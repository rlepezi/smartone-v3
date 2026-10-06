/**
 * Migración única: quita el prefijo "[SEED] " del campo de nombre
 * principal de los documentos existentes en smartone-v3 que lo llevan —
 * decisión de preferencia (ya no queremos distinguir visualmente estos
 * datos), no técnica. Es un UPDATE sobre el documento existente, nunca
 * create ni delete: no borra ni duplica nada.
 *
 * El filtro es por prefijo EXACTO ("[SEED] ", con el espacio final) sobre
 * el/los campo(s) de nombre principal de cada colección — eso ya protege
 * a los datos reales (Transemel, Entelgy, etc.) sin necesidad de lista de
 * exclusión manual: si no empieza con el prefijo, no se toca.
 *
 * Fuera de alcance a propósito: evidencias.archivoNombre y
 * evaluaciones.observaciones no son el "nombre principal" de una entidad
 * (son texto libre / artefacto generado), no se tocan acá.
 *
 * Uso:
 *   node src/scripts/migrarQuitarPrefijoSeed.js              (DRY RUN —
 *       solo imprime qué se modificaría, no escribe nada)
 *   node src/scripts/migrarQuitarPrefijoSeed.js --ejecutar    (aplica los
 *       cambios reales)
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

const PREFIJO = "[SEED] ";

// Colección → campo(s) de "nombre principal" a revisar. Un documento
// puede necesitar más de un campo actualizado (ej. Mandante tiene
// razonSocial Y nombreFantasia, ambos con el prefijo).
const COLECCIONES = [
  {coleccion: "mandantes", campos: ["razonSocial", "nombreFantasia"]},
  {coleccion: "empresas", campos: ["razonSocial", "nombreFantasia"]},
  {coleccion: "personas", campos: ["nombre"]},
  {coleccion: "recursos", campos: ["nombre"]},
  {coleccion: "proyectos", campos: ["nombre"]},
  {coleccion: "perfilesParticipacion", campos: ["nombre"]},
  {coleccion: "requerimientos", campos: ["nombre"]},
];

/**
 * Recorre todas las colecciones configuradas y detecta, sin escribir
 * nada, qué documentos tienen algún campo de nombre principal que
 * empieza exactamente con el prefijo "[SEED] ".
 * @return {Promise<Object[]>} Lista de cambios detectados: {coleccion,
 *     id, updateData, detalle}.
 */
async function detectarCambios() {
  const cambios = [];

  for (const {coleccion, campos} of COLECCIONES) {
    const snapshot = await db.collection(coleccion).get();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const updateData = {};
      const detalle = [];

      for (const campo of campos) {
        const valor = data[campo];
        if (typeof valor === "string" && valor.startsWith(PREFIJO)) {
          const nuevo = valor.slice(PREFIJO.length);
          updateData[campo] = nuevo;
          detalle.push({campo, anterior: valor, nuevo});
        }
      }

      if (Object.keys(updateData).length > 0) {
        cambios.push({coleccion, id: doc.id, updateData, detalle});
      }
    });
  }

  return cambios;
}

/**
 * Imprime la lista completa de cambios detectados, agrupados por
 * colección.
 * @param {Object[]} cambios Cambios detectados por detectarCambios().
 * @return {void}
 */
function imprimirDryRun(cambios) {
  console.log(`\n=== DRY RUN — ${cambios.length} documento(s) a modificar ===`);

  let coleccionActual = null;
  for (const c of cambios) {
    if (c.coleccion !== coleccionActual) {
      coleccionActual = c.coleccion;
      console.log(`\n[${coleccionActual}]`);
    }
    console.log(`  id: ${c.id}`);
    c.detalle.forEach((d) => {
      console.log(`    ${d.campo}: "${d.anterior}" → "${d.nuevo}"`);
    });
  }

  console.log(`\nTotal: ${cambios.length} documento(s) en ` +
      `${COLECCIONES.length} colecciones revisadas.`);
}

/**
 * Aplica los cambios detectados: un update por documento, quitando solo
 * el prefijo de los campos afectados.
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  console.log("\n=== Ejecutando escritura real ===");
  for (const c of cambios) {
    await db.collection(c.coleccion).doc(c.id).update({
      ...c.updateData,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`  ✓ ${c.coleccion}/${c.id} actualizado.`);
  }
  console.log(`\nListo: ${cambios.length} documento(s) actualizado(s).`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run. Con --ejecutar,
 * aplica los cambios detectados.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log("=== SmartOne v3 — Migración: quitar prefijo \"[SEED] \" ===");
  console.log(
      `Modo: ${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN (solo lectura)"}`,
  );

  const cambios = await detectarCambios();
  imprimirDryRun(cambios);

  if (cambios.length === 0) {
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

  await ejecutarCambios(cambios);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal en la migración:", err);
      process.exit(1);
    });
