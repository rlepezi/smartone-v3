/**
 * Migración única: backfill de RelaciónLaboral (entidad 17, ver
 * decisions.md) para las Personas que ya existían antes de esta entidad.
 *
 * IMPORTANTE — esto es un backfill, NO una recuperación de datos
 * históricos reales: el modelo anterior de Persona NUNCA tuvo campos
 * como cargo/tipoContrato/jornada/fechaContratacion (se verificó
 * directamente en el código y en el seed data antes de escribir esta
 * migración — no existían para migrar). Por eso cada RelaciónLaboral
 * creada acá usa valores PLACEHOLDER ("No especificado") para
 * tipoRelacion/cargo/tipoContrato — un admin debe corregirlos más
 * adelante vía "Cambiar Empresa" si quiere el dato real.
 *
 * Para cada Persona sin `empresaActivaId` (campo nuevo, backfill
 * pendiente):
 *   - crea una RelaciónLaboral con estado "activa", empresaId = el
 *     empresaId ya existente de la Persona, fechaInicio = createdAt de
 *     la Persona (o ahora, si no tuviera).
 *   - setea empresaActivaId/cargoActivo en la Persona.
 *
 * Uso:
 *   node src/scripts/migrarRelacionesLaborales.js              (DRY RUN
 *       — solo imprime qué se crearía, no escribe nada)
 *   node src/scripts/migrarRelacionesLaborales.js --ejecutar    (aplica
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

const CARGO_PLACEHOLDER = "No especificado";
const TIPO_RELACION_PLACEHOLDER = "Trabajador";
const TIPO_CONTRATO_PLACEHOLDER = "No especificado";

/**
 * Detecta las Personas sin `empresaActivaId` (backfill pendiente) y
 * arma la RelaciónLaboral placeholder que les correspondería.
 * @return {Promise<Object[]>} Lista de cambios: {personaId, empresaId,
 *     fechaInicio, personaNombre}.
 */
async function detectarCambios() {
  const personasSnap = await db.collection("personas").get();

  const pendientes = [];
  personasSnap.forEach((doc) => {
    const data = doc.data();
    if (data.empresaActivaId !== undefined) return;

    if (!data.empresaId) {
      console.warn(
          `  ! Persona ${doc.id} (${data.nombre} ${data.apellido}) no ` +
          "tiene empresaId — se omite, no se puede crear una relación " +
          "laboral sin Empresa.",
      );
      return;
    }

    pendientes.push({
      personaId: doc.id,
      personaNombre: `${data.nombre} ${data.apellido}`,
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
  console.log(`\n=== DRY RUN — ${cambios.length} Persona(s) a migrar ===`);
  for (const c of cambios) {
    console.log(
        `  ${c.personaNombre} (${c.personaId}) → RelaciónLaboral activa ` +
        `con Empresa ${c.empresaId}, fechaInicio ` +
        `${c.fechaInicio.toISOString()}`,
    );
  }
  console.log(`\nTotal: ${cambios.length} Persona(s).`);
}

/**
 * Aplica los cambios detectados en un solo batch write (crea la
 * RelaciónLaboral + actualiza la Persona por cada una).
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  console.log("\n=== Ejecutando escritura real ===");
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  cambios.forEach((c) => {
    const relacionRef = db.collection("relacionesLaborales").doc();
    batch.set(relacionRef, {
      personaId: c.personaId,
      empresaId: c.empresaId,
      tipoRelacion: TIPO_RELACION_PLACEHOLDER,
      cargo: CARGO_PLACEHOLDER,
      tipoContrato: TIPO_CONTRATO_PLACEHOLDER,
      jornada: null,
      fechaInicio: c.fechaInicio,
      fechaTermino: null,
      estado: "activa",
      createdAt: now,
      updatedAt: now,
    });

    const personaRef = db.collection("personas").doc(c.personaId);
    batch.update(personaRef, {
      empresaActivaId: c.empresaId,
      cargoActivo: CARGO_PLACEHOLDER,
      updatedAt: now,
    });
  });

  await batch.commit();
  console.log(`Listo: ${cambios.length} Persona(s) migrada(s).`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: backfill de RelaciónLaboral ===",
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
