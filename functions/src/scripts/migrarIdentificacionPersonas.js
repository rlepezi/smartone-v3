/**
 * Migración única: agrega el campo `identificacion` (nuevo modelo:
 * {tipo, numero, pais}) a cada Persona existente que tenga `rut` (formato
 * antiguo), y crea su documento índice de unicidad en
 * personasIdentificacion/{clave}. El campo `rut` original NUNCA se toca
 * ni se elimina (coherente con la regla ya establecida de no eliminar
 * información existente) — `identificacion` se agrega aparte, y pasa a
 * ser la fuente de verdad hacia adelante (ver personaService.crearPersona).
 * Es UPDATE + CREATE sobre documentos existentes, nunca delete.
 *
 * Idempotente: si una Persona ya tiene `identificacion`, se salta (no se
 * sobrescribe). Si el documento índice de una clave ya existe (no
 * debería pasar — el RUT ya era único antes de esta migración — pero se
 * verifica antes de escribir), esa Persona se salta con una advertencia
 * para revisión manual en vez de sobrescribir el índice.
 *
 * Uso:
 *   node src/scripts/migrarIdentificacionPersonas.js              (DRY RUN —
 *       solo imprime qué se migraría, no escribe nada)
 *   node src/scripts/migrarIdentificacionPersonas.js --ejecutar    (aplica
 *       los cambios reales)
 *
 * Se conecta directo a la base de datos del serviceAccountKey.json (mismo
 * patrón que el resto de los scripts de esta carpeta) — confirmar contra
 * qué proyecto apunta esa credencial antes de correr con --ejecutar.
 */

const path = require("path");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = require(
      path.join(__dirname, "../../serviceAccountKey.json"),
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");
const {
  normalizarNumero, claveIdentificacion,
} = require("../utils/identificacionValidator");

const PERSONAS_COLLECTION = "personas";
const INDICE_COLLECTION = "personasIdentificacion";
// 240 personas x 2 operaciones (update Persona + set índice) = 480
// operaciones por batch, bajo el límite real de 500/batch de Firestore.
const PERSONAS_POR_LOTE = 240;

/**
 * Recorre personas/ y arma la lista de cambios a aplicar: quiénes ya
 * tienen `identificacion` (se saltan), quiénes necesitan migrarse, y
 * cualquier `rut` que no se pueda normalizar (para revisión manual).
 * @return {Promise<{aMigrar: Object[], yaTenian: number,
 *     fallidos: Object[]}>} Resultado del análisis.
 */
async function detectarCambios() {
  const snapshot = await db.collection(PERSONAS_COLLECTION).get();
  const aMigrar = [];
  const fallidos = [];
  let yaTenian = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.identificacion) {
      yaTenian++;
      return;
    }
    if (!data.rut || typeof data.rut !== "string" || !data.rut.trim()) {
      fallidos.push({
        id: doc.id, motivo: "Sin campo 'rut' o vacío.", rut: data.rut,
      });
      return;
    }

    const numeroNormalizado = normalizarNumero("RUT", data.rut);
    if (!numeroNormalizado) {
      fallidos.push({
        id: doc.id, motivo: "El RUT no normalizó a nada.", rut: data.rut,
      });
      return;
    }

    const identificacion = {
      tipo: "RUT", numero: numeroNormalizado, pais: "Chile",
    };
    aMigrar.push({
      id: doc.id,
      nombre: `${data.nombre || ""} ${data.apellido || ""}`.trim(),
      identificacion,
      clave: claveIdentificacion(identificacion),
    });
  });

  return {aMigrar, yaTenian, fallidos};
}

/**
 * Detecta colisiones de clave DENTRO del propio lote a migrar (dos
 * Personas distintas cuyo RUT normalizara a la misma clave) — no debería
 * pasar (el RUT ya era único antes de esta migración), pero se verifica
 * antes de escribir nada para no dejar el índice apuntando a la Persona
 * equivocada.
 * @param {Object[]} aMigrar Lista armada por detectarCambios().
 * @return {Object[]} Colisiones encontradas, vacío si no hay ninguna.
 */
function detectarColisionesInternas(aMigrar) {
  const porClave = new Map();
  const colisiones = [];
  for (const p of aMigrar) {
    if (porClave.has(p.clave)) {
      colisiones.push({
        clave: p.clave, personas: [porClave.get(p.clave), p.id],
      });
    } else {
      porClave.set(p.clave, p.id);
    }
  }
  return colisiones;
}

/**
 * Imprime el resultado del análisis, sin escribir nada.
 * @param {{aMigrar: Object[], yaTenian: number, fallidos: Object[]}}
 *     resultado Resultado de detectarCambios().
 * @param {boolean} ejecutar Si el modo es ejecución real o dry run.
 * @return {void}
 */
function imprimirResumen({aMigrar, yaTenian, fallidos}, ejecutar) {
  console.log(
      `\n=== ${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN"} — ` +
      "migración identificacion Persona ===",
  );
  console.log(`A migrar: ${aMigrar.length}`);
  console.log(`Ya tenían 'identificacion' (se saltan): ${yaTenian}`);
  console.log(`Con problemas (revisión manual): ${fallidos.length}`);

  if (aMigrar.length > 0) {
    console.log("\n--- A migrar ---");
    aMigrar.forEach((p) => {
      console.log(`  ${p.id} (${p.nombre || "sin nombre"}) -> ${p.clave}`);
    });
  }
  if (fallidos.length > 0) {
    console.log("\n--- Con problemas (no se tocan, revisar a mano) ---");
    fallidos.forEach((f) => {
      console.log(`  ${f.id}: ${f.motivo} (rut=${JSON.stringify(f.rut)})`);
    });
  }
}

/**
 * Aplica los cambios: por cada Persona a migrar, un update de
 * `identificacion` + un set del documento índice, en lotes acotados por
 * PERSONAS_POR_LOTE. Antes de cada set de índice verifica que no exista
 * ya (idempotencia real: correr el script dos veces no falla ni
 * duplica — la segunda vez detectarCambios() las salta por ya tener
 * `identificacion`, pero esta verificación también protege si el índice
 * quedó de una corrida parcial anterior).
 * @param {Object[]} aMigrar Lista armada por detectarCambios().
 * @return {Promise<void>}
 */
async function ejecutarCambios(aMigrar) {
  console.log("\n=== Ejecutando escritura real ===");
  let migrados = 0;
  let saltados = 0;

  for (let i = 0; i < aMigrar.length; i += PERSONAS_POR_LOTE) {
    const lote = aMigrar.slice(i, i + PERSONAS_POR_LOTE);
    const batch = db.batch();
    let operacionesEnLote = 0;

    for (const p of lote) {
      const refIndice = db.collection(INDICE_COLLECTION).doc(p.clave);
      // eslint-disable-next-line no-await-in-loop
      const indiceExistente = await refIndice.get();
      if (indiceExistente.exists) {
        console.log(
            `  ⚠ ${p.id}: el índice ${p.clave} ya existe ` +
            `(apunta a ${indiceExistente.data().personaId}) — se salta, ` +
            "revisar manualmente.",
        );
        saltados++;
        continue;
      }
      batch.update(db.collection(PERSONAS_COLLECTION).doc(p.id), {
        identificacion: p.identificacion,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(refIndice, {
        personaId: p.id, createdAt: FieldValue.serverTimestamp(),
      });
      operacionesEnLote += 2;
      migrados++;
    }

    if (operacionesEnLote > 0) {
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    console.log(
        `  ✓ Lote ${Math.floor(i / PERSONAS_POR_LOTE) + 1} aplicado ` +
        `(${lote.length} persona(s) revisada(s)).`,
    );
  }

  console.log(
      `\nListo: ${migrados} persona(s) migrada(s), ` +
      `${saltados} saltada(s) por índice ya existente.`,
  );
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run. Con --ejecutar,
 * aplica los cambios detectados (salvo que haya colisiones internas, en
 * cuyo caso aborta sin escribir nada).
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log("=== SmartOne v3 — Migración: identificacion de Persona ===");
  console.log(
      `Modo: ${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN (solo lectura)"}`,
  );

  const resultado = await detectarCambios();
  imprimirResumen(resultado, ejecutar);

  const colisiones = detectarColisionesInternas(resultado.aMigrar);
  if (colisiones.length > 0) {
    console.log(
        `\n⚠ ${colisiones.length} colisión(es) de clave detectada(s) — ` +
        "abortando sin escribir nada. Revisar manualmente:",
    );
    colisiones.forEach((c) => {
      console.log(`  ${c.clave}: personas ${c.personas.join(", ")}`);
    });
    return;
  }

  if (resultado.aMigrar.length === 0) {
    console.log("\nNada que migrar.");
    return;
  }

  if (!ejecutar) {
    console.log(
        "\nDRY RUN únicamente — no se escribió nada en Firestore. " +
        "Corré con --ejecutar para aplicar estos cambios.",
    );
    return;
  }

  await ejecutarCambios(resultado.aMigrar);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal en la migración:", err);
      process.exit(1);
    });
