/**
 * Copia SOLO la configuración de producción al proyecto QA: Mandantes,
 * requerimientos, reglas de revisión y lo que los une (perfiles, vínculos,
 * tipos documentales, plantillas). Nunca copia personas, maquinarias,
 * empresas, expedientes, evidencias, evaluaciones, carpetas, usuarios,
 * fuentes ni la Bitácora: la lista de colecciones es cerrada (abajo).
 *
 * Producción solo se LEE (con serviceAccountKey.prod.json); se escribe
 * únicamente en QA (serviceAccountKey.qa.json), conservando los IDs para que
 * las referencias entre colecciones sigan valiendo. Los documentos de QA con
 * el mismo ID se reemplazan; los demás de QA no se tocan.
 *
 * Uso (desde functions/):
 *   node src/scripts/copiarConfiguracionAQa.js            (simulación: cuenta)
 *   node src/scripts/copiarConfiguracionAQa.js --aplicar  (escribe en QA)
 */
// abrirApp verifica que cada clave sea de su proyecto: el destino nunca puede
// ser producción.
const {abrirApp, PROYECTOS} = require("./ambiente");

// Colecciones de configuración que se copian (y nada más).
const COLECCIONES = [
  "mandantes",
  "perfilesParticipacion",
  "perfilesRecurso",
  "requerimientos",
  "requerimientosNombre", // índice de nombres únicos de requerimientos
  "perfilRequerimientos", // a qué perfiles aplica cada requerimiento
  "tiposDocumentales",
  "reglasIA", // biblioteca de reglas de revisión
  "requerimientoReglas", // reglas aplicadas a cada requerimiento
  "plantillasEstructura",
];
const LOTE = 400;

/**
 * Copia una colección (documentos de primer nivel).
 * @param {Object} origen Firestore de producción.
 * @param {Object} destino Firestore de QA.
 * @param {string} nombre Colección.
 * @param {boolean} aplicar true para escribir.
 * @return {Promise<number>} Documentos.
 */
async function copiar(origen, destino, nombre, aplicar) {
  const snap = await origen.collection(nombre).get();
  if (aplicar) {
    for (let i = 0; i < snap.docs.length; i += LOTE) {
      const batch = destino.batch();
      snap.docs.slice(i, i + LOTE).forEach((d) =>
        batch.set(destino.collection(nombre).doc(d.id), d.data()));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
  }
  return snap.size;
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const prod = abrirApp("prod");
  const qa = abrirApp("qa");
  const origen = prod.firestore();
  const destino = qa.firestore();
  console.log(`Origen: ${PROYECTOS.prod} (solo lectura) → destino: ` +
      `${PROYECTOS.qa}${aplicar ? "" : " · SIMULACIÓN (sin --aplicar)"}`);
  let total = 0;
  for (const nombre of COLECCIONES) {
    // eslint-disable-next-line no-await-in-loop
    const n = await copiar(origen, destino, nombre, aplicar);
    total += n;
    console.log(`  ${nombre.padEnd(24)} ${String(n).padStart(5)} ` +
        `${aplicar ? "copiados" : "a copiar"}`);
  }
  console.log(`\n${total} documentos ${aplicar ? "copiados a QA" :
    "se copiarían. Ejecute con --aplicar para escribir en QA"}.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
