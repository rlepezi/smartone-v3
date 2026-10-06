/**
 * Migración única (best-effort): backfill del campo "orden" en el
 * snapshot requerimientosAplicables de Expedientes ya creados antes del
 * fix de expedienteService.crearExpediente (que ahora sí lo captura).
 *
 * El snapshot es deliberadamente inmutable (RN-032: un cambio posterior
 * en Perfil-Requerimiento no debe afectar Expedientes ya creados), así
 * que esto NO reconstruye el orden real que existía al momento de crear
 * cada Expediente — usa el orden ACTUAL del vínculo Perfil-Requerimiento
 * correspondiente como mejor aproximación disponible. Si ese vínculo ya
 * no está activo hoy (orden=null), el ítem queda sin orden (mismo
 * resultado que dejarlo como estaba: sin poder numerarlo).
 *
 * Uso:
 *   node src/scripts/migrarOrdenExpedientesAplicables.js              (DRY
 *       RUN — solo imprime qué se modificaría, no escribe nada)
 *   node src/scripts/migrarOrdenExpedientesAplicables.js --ejecutar    (aplica
 *       los cambios reales)
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

/**
 * Detecta los Expedientes cuyo requerimientosAplicables tiene ítems sin
 * "orden", y calcula el valor de backfill para cada uno usando el orden
 * actual del vínculo Perfil-Requerimiento correspondiente.
 * @return {Promise<Object[]>} Lista de cambios: {id, nuevosItems, detalle}.
 */
async function detectarCambios() {
  const [expedientesSnap, vinculosSnap] = await Promise.all([
    db.collection("expedientes").get(),
    db.collection("perfilRequerimientos").get(),
  ]);

  const ordenActualPorClave = {};
  vinculosSnap.forEach((doc) => {
    const d = doc.data();
    const clave = `${d.perfilParticipacionId}|${d.requerimientoId}`;
    ordenActualPorClave[clave] = d.orden ?? null;
  });

  const cambios = [];
  expedientesSnap.forEach((doc) => {
    const data = doc.data();
    const items = data.requerimientosAplicables || [];
    if (items.length === 0) return;

    let necesitaCambio = false;
    const nuevosItems = items.map((item) => {
      if (item.orden !== undefined) return item;
      necesitaCambio = true;
      const clave = `${data.perfilParticipacionId}|${item.requerimientoId}`;
      return {...item, orden: ordenActualPorClave[clave] ?? null};
    });

    if (necesitaCambio) {
      cambios.push({
        id: doc.id,
        nuevosItems,
        detalle: nuevosItems.map(
            (it) => `${it.nombre} (${it.nivelAplicacion}) → orden=${it.orden}`,
        ),
      });
    }
  });

  return cambios;
}

/**
 * Imprime la lista completa de cambios detectados.
 * @param {Object[]} cambios Cambios detectados por detectarCambios().
 * @return {void}
 */
function imprimirDryRun(cambios) {
  console.log(
      `\n=== DRY RUN — ${cambios.length} expediente(s) a modificar ===`,
  );

  for (const c of cambios) {
    console.log(`\n[expedientes/${c.id}]`);
    c.detalle.forEach((linea) => console.log(`  ${linea}`));
  }

  console.log(`\nTotal: ${cambios.length} expediente(s).`);
}

/**
 * Aplica los cambios detectados: reescribe el array completo
 * requerimientosAplicables por documento (Firestore no permite parchear
 * un objeto individual dentro de un array).
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  console.log("\n=== Ejecutando escritura real ===");
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  cambios.forEach((c) => {
    const docRef = db.collection("expedientes").doc(c.id);
    batch.update(docRef, {
      requerimientosAplicables: c.nuevosItems,
      updatedAt: now,
    });
  });

  await batch.commit();
  console.log(`Listo: ${cambios.length} expediente(s) actualizado(s).`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: orden en requerimientosAplicables " +
      "de Expedientes ===",
  );
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
