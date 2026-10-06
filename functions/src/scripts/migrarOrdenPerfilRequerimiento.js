/**
 * Migración única: backfill de "nivelAplicacion" y "orden" en los
 * vínculos Perfil-Requerimiento ACTIVOS que ya existían antes de que la
 * pantalla "Configurar Requerimientos" pasara a tener pestañas por nivel
 * y orden reubicable (incluye los 38 vínculos reales de Transemel
 * sembrados en una tarea anterior).
 *
 * Para cada vínculo activo sin estos campos:
 *   - resuelve nivelAplicacion desde su Requerimiento vinculado.
 *   - agrupa por (perfilParticipacionId, nivelAplicacion) y asigna orden
 *     secuencial (1, 2, 3...) respetando el orden de creación original
 *     (createdAt ascendente) — no cambia cuál Requerimiento quedó
 *     vinculado, solo le da una posición inicial coherente.
 *
 * Uso:
 *   node src/scripts/migrarOrdenPerfilRequerimiento.js              (DRY
 *       RUN — solo imprime qué se modificaría, no escribe nada)
 *   node src/scripts/migrarOrdenPerfilRequerimiento.js --ejecutar    (aplica
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
 * Detecta los vínculos activos que necesitan backfill y calcula el
 * nivelAplicacion + orden que les correspondería.
 * @return {Promise<Object[]>} Lista de cambios: {id, perfilParticipacionId,
 *     nivelAplicacion, ordenNuevo, requerimientoNombre}.
 */
async function detectarCambios() {
  const [vinculosSnap, requerimientosSnap] = await Promise.all([
    db.collection("perfilRequerimientos").where("estado", "==", "activo").get(),
    db.collection("requerimientos").get(),
  ]);

  const requerimientoPorId = {};
  requerimientosSnap.forEach((doc) => {
    requerimientoPorId[doc.id] = {id: doc.id, ...doc.data()};
  });

  const pendientes = [];
  vinculosSnap.forEach((doc) => {
    const data = doc.data();
    if (data.nivelAplicacion !== undefined && data.orden !== undefined) return;

    const requerimiento = requerimientoPorId[data.requerimientoId];
    if (!requerimiento) {
      console.warn(
          `  ! Vínculo ${doc.id}: su requerimientoId ` +
          `(${data.requerimientoId}) no existe, se omite.`,
      );
      return;
    }

    pendientes.push({
      id: doc.id,
      perfilParticipacionId: data.perfilParticipacionId,
      nivelAplicacion: requerimiento.nivelAplicacion,
      requerimientoNombre: requerimiento.nombre,
      createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : 0,
    });
  });

  // Agrupa por (perfilParticipacionId, nivelAplicacion) y asigna orden
  // secuencial respetando el orden de creación original.
  const grupos = {};
  pendientes.forEach((v) => {
    const clave = `${v.perfilParticipacionId}|${v.nivelAplicacion}`;
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(v);
  });

  const cambios = [];
  Object.values(grupos).forEach((grupo) => {
    grupo.sort((a, b) => a.createdAt - b.createdAt);
    grupo.forEach((v, idx) => {
      cambios.push({
        id: v.id,
        perfilParticipacionId: v.perfilParticipacionId,
        nivelAplicacion: v.nivelAplicacion,
        requerimientoNombre: v.requerimientoNombre,
        ordenNuevo: idx + 1,
      });
    });
  });

  return cambios;
}

/**
 * Imprime la lista completa de cambios detectados, agrupados por Perfil +
 * nivel.
 * @param {Object[]} cambios Cambios detectados por detectarCambios().
 * @return {void}
 */
function imprimirDryRun(cambios) {
  console.log(`\n=== DRY RUN — ${cambios.length} vínculo(s) a modificar ===`);

  let grupoActual = null;
  for (const c of cambios) {
    const clave = `${c.perfilParticipacionId}|${c.nivelAplicacion}`;
    if (clave !== grupoActual) {
      grupoActual = clave;
      console.log(
          `\n[Perfil ${c.perfilParticipacionId} — ${c.nivelAplicacion}]`,
      );
    }
    console.log(
        `  orden ${c.ordenNuevo}: "${c.requerimientoNombre}" (${c.id})`,
    );
  }

  console.log(`\nTotal: ${cambios.length} vínculo(s).`);
}

/**
 * Aplica los cambios detectados en un solo batch write.
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  console.log("\n=== Ejecutando escritura real ===");
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  cambios.forEach((c) => {
    const docRef = db.collection("perfilRequerimientos").doc(c.id);
    batch.update(docRef, {
      nivelAplicacion: c.nivelAplicacion,
      orden: c.ordenNuevo,
      updatedAt: now,
    });
  });

  await batch.commit();
  console.log(`Listo: ${cambios.length} vínculo(s) actualizado(s).`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: nivelAplicacion + orden en " +
      "Perfil-Requerimiento ===",
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
