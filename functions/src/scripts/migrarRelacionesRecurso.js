/**
 * Migración única: backfill de RelaciónRecurso (entidad 19, ver
 * decisions.md) para los Recursos que ya existían antes de esta entidad.
 *
 * IMPORTANTE — esto es un backfill, NO una recuperación de datos
 * históricos reales: el modelo anterior de Recurso NUNCA tuvo un campo
 * `tipoRelacion` con la Empresa (se verificó directamente en el código
 * antes de escribir esta migración). Por eso cada RelaciónRecurso creada
 * acá usa el valor PLACEHOLDER ("No especificado") para `tipoRelacion` —
 * un admin debe corregirlo más adelante vía "Cambiar Empresa" si quiere
 * el dato real.
 *
 * Para cada Recurso sin `empresaActivaId` (campo nuevo, backfill
 * pendiente):
 *   - crea una RelaciónRecurso con estado "activa", empresaId = el
 *     empresaId ya existente del Recurso, fechaInicio = createdAt del
 *     Recurso (o ahora, si no tuviera).
 *   - setea empresaActivaId en el Recurso.
 *
 * Uso:
 *   node src/scripts/migrarRelacionesRecurso.js              (DRY RUN
 *       — solo imprime qué se crearía, no escribe nada)
 *   node src/scripts/migrarRelacionesRecurso.js --ejecutar    (aplica
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

const TIPO_RELACION_PLACEHOLDER = "No especificado";

/**
 * Detecta los Recursos sin `empresaActivaId` (backfill pendiente) y
 * arma la RelaciónRecurso placeholder que les correspondería.
 * @return {Promise<Object[]>} Lista de cambios: {recursoId, empresaId,
 *     fechaInicio, recursoNombre}.
 */
async function detectarCambios() {
  const recursosSnap = await db.collection("recursos").get();

  const pendientes = [];
  recursosSnap.forEach((doc) => {
    const data = doc.data();
    if (data.empresaActivaId !== undefined) return;

    if (!data.empresaId) {
      console.warn(
          `  ! Recurso ${doc.id} (${data.nombre}) no tiene empresaId — ` +
          "se omite, no se puede crear una relación sin Empresa.",
      );
      return;
    }

    pendientes.push({
      recursoId: doc.id,
      recursoNombre: data.nombre,
      empresaId: data.empresaId,
      fechaInicio: data.createdAt?.toDate ?
          data.createdAt.toDate() : new Date(),
    });
  });

  return pendientes;
}

/**
 * Imprime la lista completa de cambios detectados.
 * @param {Object[]} cambios Cambios detectados por detectarCambios().
 * @return {void}
 */
function imprimirDryRun(cambios) {
  console.log(`\n=== DRY RUN — ${cambios.length} Recurso(s) a migrar ===`);
  for (const c of cambios) {
    console.log(
        `  ${c.recursoNombre} (${c.recursoId}) → RelaciónRecurso activa ` +
        `con Empresa ${c.empresaId}, fechaInicio ` +
        `${c.fechaInicio.toISOString()}`,
    );
  }
  console.log(`\nTotal: ${cambios.length} Recurso(s).`);
}

/**
 * Aplica los cambios detectados en un solo batch write (crea la
 * RelaciónRecurso + actualiza el Recurso por cada uno).
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  console.log("\n=== Ejecutando escritura real ===");
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  cambios.forEach((c) => {
    const relacionRef = db.collection("relacionesRecurso").doc();
    batch.set(relacionRef, {
      recursoId: c.recursoId,
      empresaId: c.empresaId,
      tipoRelacion: TIPO_RELACION_PLACEHOLDER,
      fechaInicio: c.fechaInicio,
      fechaTermino: null,
      estado: "activa",
      createdAt: now,
      updatedAt: now,
    });

    const recursoRef = db.collection("recursos").doc(c.recursoId);
    batch.update(recursoRef, {
      empresaActivaId: c.empresaId,
      updatedAt: now,
    });
  });

  await batch.commit();
  console.log(`Listo: ${cambios.length} Recurso(s) migrado(s).`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: backfill de RelaciónRecurso ===",
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
