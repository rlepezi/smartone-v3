/**
 * Migración: eliminación del campo "Nombre Identificador" de Mandante
 * (campo `nombre` en Firestore). El nombre a mostrar de un Mandante pasa a
 * ser nombreFantasia si tiene valor, y si no, razonSocial (ver
 * utils/mandanteDisplay.js).
 *
 * Para no perder el nombre con que hoy se reconoce a cada Mandante, copia
 * el valor de `nombre` a `nombreFantasia` SOLO donde nombreFantasia esté
 * vacío o ausente. Nunca sobrescribe un nombreFantasia con valor.
 *
 * Qué NO hace:
 *   - No borra `nombre` de los documentos: queda como dato legado que el
 *     código ya no lee ni escribe (mandanteRepository lo excluye de las
 *     respuestas de la API).
 *   - No toca ningún otro campo de Mandante (ni siquiera updatedAt), no
 *     elimina documentos y no modifica registros históricos de Bitácora.
 *
 * Idempotente: tras una ejecución real, todos los Mandantes con `nombre`
 * quedan con nombreFantasia, así que una segunda corrida no encuentra
 * nada que actualizar.
 *
 * Uso (mismo patrón que seedDatosPrueba.js):
 *   USE_EMULATOR=true node src/scripts/migrarNombreIdentificadorMandante.js
 *       (DRY RUN contra el emulador local)
 *   USE_EMULATOR=true node src/scripts/migrarNombreIdentificadorMandante.js \
 *       --ejecutar
 *       (aplica los cambios contra el emulador local)
 *   node src/scripts/migrarNombreIdentificadorMandante.js
 *       (DRY RUN contra el proyecto real, requiere
 *       functions/serviceAccountKey.json)
 *   node src/scripts/migrarNombreIdentificadorMandante.js --ejecutar
 *       (aplica los cambios contra el proyecto real)
 */

const path = require("path");

if (process.env.USE_EMULATOR === "true") {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

const admin = require("firebase-admin");

if (!admin.apps.length) {
  if (process.env.USE_EMULATOR === "true") {
    admin.initializeApp({projectId: "smartone-v3"});
  } else {
    const serviceAccount = require(
        path.join(__dirname, "../../serviceAccountKey.json"),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

const db = admin.firestore();

const COLECCION = "mandantes";
// Campo legado (el antiguo "Nombre Identificador"). Única referencia
// permitida a este campo en el código.
const CAMPO_LEGADO = "nombre";
// Límite de operaciones por batch de Firestore.
const TAMANO_BATCH = 500;

/**
 * Devuelve el string con trim, o "" si no es un string.
 * @param {*} valor Valor a normalizar.
 * @return {string} String sin espacios en los extremos.
 */
function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Recorre todos los Mandantes y clasifica cada uno, sin escribir nada.
 * @return {Promise<{revisados: number, cambios: Object[],
 *     omitidos: Object[]}>} Resultado del diagnóstico.
 */
async function detectarCambios() {
  const snapshot = await db.collection(COLECCION).get();
  const cambios = [];
  const omitidos = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    const legado = texto(data[CAMPO_LEGADO]);
    const fantasia = texto(data.nombreFantasia);

    if (fantasia) {
      omitidos.push({id: doc.id, motivo: "ya tiene nombreFantasia", fantasia});
    } else if (!legado) {
      omitidos.push({id: doc.id, motivo: "sin Nombre Identificador"});
    } else {
      cambios.push({
        id: doc.id,
        nombreFantasia: legado,
        razonSocial: texto(data.razonSocial),
      });
    }
  });

  return {revisados: snapshot.size, cambios, omitidos};
}

/**
 * Aplica los cambios: solo escribe nombreFantasia, en batches.
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  for (let i = 0; i < cambios.length; i += TAMANO_BATCH) {
    const batch = db.batch();
    cambios.slice(i, i + TAMANO_BATCH).forEach((c) => {
      batch.update(db.collection(COLECCION).doc(c.id), {
        nombreFantasia: c.nombreFantasia,
      });
    });
    await batch.commit();
  }
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");
  const destino = process.env.USE_EMULATOR === "true" ?
      "EMULADOR" : "PROYECTO REAL (smartone-v3)";

  console.log(
      "=== SmartOne v3 — Migración: Nombre Identificador de Mandante " +
      "→ nombreFantasia ===",
  );
  console.log(`Destino: ${destino}`);
  console.log(
      `Modo: ${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN (solo lectura)"}`,
  );

  const {revisados, cambios, omitidos} = await detectarCambios();

  console.log(`\n--- ${ejecutar ? "A actualizar" : "Se actualizarían"} ---`);
  if (cambios.length === 0) console.log("  (ninguno)");
  cambios.forEach((c) => {
    console.log(
        `  [${c.id}] nombreFantasia ← "${c.nombreFantasia}" ` +
        `(razón social: "${c.razonSocial}")`,
    );
  });

  console.log("\n--- Omitidos ---");
  if (omitidos.length === 0) console.log("  (ninguno)");
  omitidos.forEach((o) => {
    const detalle = o.fantasia ? ` ("${o.fantasia}")` : "";
    console.log(`  [${o.id}] ${o.motivo}${detalle}`);
  });

  if (ejecutar && cambios.length > 0) {
    await ejecutarCambios(cambios);
  }

  console.log("\n=== RESUMEN ===");
  console.log(`  Revisados:    ${revisados}`);
  console.log(
      `  Actualizados: ${ejecutar ? cambios.length : 0}` +
      (ejecutar ? "" : ` (dry run: ${cambios.length} pendiente(s))`),
  );
  console.log(`  Omitidos:     ${omitidos.length}`);

  if (!ejecutar && cambios.length > 0) {
    console.log(
        "\nDRY RUN únicamente — no se escribió nada en Firestore. " +
        "Ejecuta con --ejecutar para aplicar estos cambios.",
    );
  }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal en la migración:", err);
      process.exit(1);
    });
