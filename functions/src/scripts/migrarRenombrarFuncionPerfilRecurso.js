/**
 * Migración única: renombra el campo `nombre` a `funcion` en cada
 * documento existente de la colección `perfilesRecurso` (Entidad 18) —
 * a diferencia de la migración de identificación de Persona, acá SÍ se
 * elimina el campo viejo (`nombre`), porque es un rename real dentro de
 * un catálogo de nuestra propia aplicación (no un dato de identidad
 * histórico de terceros como el RUT): dejar ambos campos sería una
 * fuente de desincronización silenciosa (dos nombres para el mismo
 * valor, uno de los cuales el código ya no actualiza).
 *
 * Aplica a TODOS los documentos de la colección sin importar `tipo`
 * ("persona" o "recurso") — es un único campo compartido en el mismo
 * esquema, no tiene sentido renombrarlo solo para un subconjunto.
 *
 * Idempotente: si un documento ya tiene `funcion`, se salta (no se
 * sobrescribe ni se toca). Si un documento no tiene `nombre` ni
 * `funcion`, se reporta para revisión manual (no debería pasar).
 *
 * Uso:
 *   node src/scripts/migrarRenombrarFuncionPerfilRecurso.js              (DRY
 *       RUN — solo imprime qué se migraría, no escribe nada)
 *   node src/scripts/migrarRenombrarFuncionPerfilRecurso.js --ejecutar    (
 *       aplica los cambios reales)
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

const COLLECTION = "perfilesRecurso";
// Documentos por lote x 1 operación (solo update) = 300 operaciones por
// batch, bien bajo el límite real de 500/batch de Firestore.
const DOCS_POR_LOTE = 300;

/**
 * Recorre perfilesRecurso/ y arma la lista de cambios a aplicar: quiénes
 * ya tienen `funcion` (se saltan), quiénes necesitan migrarse, y
 * cualquier documento sin `nombre` ni `funcion` (para revisión manual).
 * @return {Promise<{aMigrar: Object[], yaTenian: number,
 *     fallidos: Object[]}>} Resultado del análisis.
 */
async function detectarCambios() {
  const snapshot = await db.collection(COLLECTION).get();
  const aMigrar = [];
  const fallidos = [];
  let yaTenian = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    if (data.funcion !== undefined) {
      yaTenian++;
      return;
    }
    if (!data.nombre || typeof data.nombre !== "string") {
      fallidos.push({
        id: doc.id, motivo: "Sin campo 'nombre' ni 'funcion'.",
        tipo: data.tipo, mandanteId: data.mandanteId,
      });
      return;
    }

    aMigrar.push({
      id: doc.id,
      tipo: data.tipo,
      mandanteId: data.mandanteId,
      funcion: data.nombre,
    });
  });

  return {aMigrar, yaTenian, fallidos};
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
      "migración nombre -> funcion en Perfil de Recurso ===",
  );
  console.log(`A migrar: ${aMigrar.length}`);
  console.log(`Ya tenían 'funcion' (se saltan): ${yaTenian}`);
  console.log(`Con problemas (revisión manual): ${fallidos.length}`);

  if (aMigrar.length > 0) {
    console.log("\n--- A migrar ---");
    aMigrar.forEach((p) => {
      console.log(
          `  ${p.id} (${p.tipo}, mandante ${p.mandanteId}) -> ` +
          `funcion: "${p.funcion}"`,
      );
    });
  }
  if (fallidos.length > 0) {
    console.log("\n--- Con problemas (no se tocan, revisar a mano) ---");
    fallidos.forEach((f) => {
      console.log(`  ${f.id}: ${f.motivo}`);
    });
  }
}

/**
 * Aplica los cambios: por cada documento a migrar, agrega `funcion` con
 * el valor de `nombre` y elimina `nombre`, en un único update atómico
 * por documento, en lotes acotados por DOCS_POR_LOTE.
 * @param {Object[]} aMigrar Lista armada por detectarCambios().
 * @return {Promise<void>}
 */
async function ejecutarCambios(aMigrar) {
  console.log("\n=== Ejecutando escritura real ===");

  for (let i = 0; i < aMigrar.length; i += DOCS_POR_LOTE) {
    const lote = aMigrar.slice(i, i + DOCS_POR_LOTE);
    const batch = db.batch();

    lote.forEach((p) => {
      batch.update(db.collection(COLLECTION).doc(p.id), {
        funcion: p.funcion,
        nombre: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    console.log(
        `  ✓ Lote ${Math.floor(i / DOCS_POR_LOTE) + 1} aplicado ` +
        `(${lote.length} perfil(es) migrado(s)).`,
    );
  }

  console.log(`\nListo: ${aMigrar.length} perfil(es) migrado(s) en total.`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: nombre -> funcion en " +
      "Perfil de Recurso ===",
  );
  console.log(
      `Modo: ${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN (solo lectura)"}`,
  );

  const resultado = await detectarCambios();
  imprimirResumen(resultado, ejecutar);

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
