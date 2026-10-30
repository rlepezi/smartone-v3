/**
 * Migración única: estados de Expediente al modelo nuevo (avance de la
 * evaluación). Antes: creado / en_revision / con_observaciones / aprobado
 * (derivados) + en_ejecucion (manual, "la Empresa ya opera") + cerrado.
 * Ahora: creado / en_ejecucion / completado / completado_pendientes +
 * cerrado (ver expedienteService.calcularEstadoDerivado).
 *
 * Por cada Expediente NO cerrado y sin la marca `migracionEstados`:
 *   - "ya estuvo completado" si su estado viejo era aprobado,
 *     con_observaciones o en_ejecucion (todos exigían todo evaluado);
 *   - recalcula el estado con sus contadores (`resumen`);
 *   - fija fechaCompletado si estuvo o está completado;
 *   - conserva fechaInicioEjecucion (pasa a ser la marca "inicio en faena");
 *   - escribe el cambio en expedienteEstados (origen "migracion").
 * Los cerrados no cambian. Marca todos los procesados con
 * `migracionEstados: true` para que volver a correrla no los reinterprete
 * ("en_ejecucion" significa otra cosa en el modelo nuevo).
 *
 * Uso:
 *   node src/scripts/migrarEstadosExpediente.js              (DRY RUN: solo
 *       muestra qué cambiaría, no escribe)
 *   node src/scripts/migrarEstadosExpediente.js --ejecutar    (aplica)
 *   USE_EMULATOR=true ... para correrla contra el emulador local.
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

const {FieldValue} = require("firebase-admin/firestore");
const expedienteService = require("../services/expedienteService");
const expedienteEstadoRepository =
    require("../repositories/expedienteEstadoRepository");

const db = admin.firestore();
const EJECUTAR = process.argv.includes("--ejecutar");
// Dos escrituras por Expediente (el Expediente y su historial).
const LOTE = 200;
const ESTADOS_VIEJOS_COMPLETOS = ["aprobado", "con_observaciones",
  "en_ejecucion"];

/**
 * Calcula el cambio de cada Expediente pendiente de migrar.
 * @return {Promise<{cambios: Object[], sinCambio: number, cerrados: number,
 *     yaMigrados: number}>} Resultado del análisis.
 */
async function analizar() {
  const snap = await db.collection("expedientes").get();
  const cambios = [];
  let sinCambio = 0;
  let cerrados = 0;
  let yaMigrados = 0;
  snap.forEach((doc) => {
    const e = {id: doc.id, ...doc.data()};
    if (e.migracionEstados) {
      yaMigrados++;
      return;
    }
    if (e.estado === "cerrado") {
      cerrados++;
      return;
    }
    const fueCompletado = Boolean(e.fechaCompletado) ||
        ESTADOS_VIEJOS_COMPLETOS.includes(e.estado);
    const {estado} = expedienteService.calcularEstadoDerivado(e.resumen,
        {fueCompletado});
    const fijarCompletado = !e.fechaCompletado &&
        (fueCompletado || estado === "completado");
    if (estado === e.estado && !fijarCompletado) sinCambio++;
    cambios.push({expediente: e, estadoNuevo: estado, fijarCompletado});
  });
  return {cambios, sinCambio, cerrados, yaMigrados};
}

/**
 * Escribe los cambios en lotes.
 * @param {Object[]} cambios Cambios calculados.
 * @return {Promise<void>}
 */
async function aplicar(cambios) {
  for (let i = 0; i < cambios.length; i += LOTE) {
    const lote = db.batch();
    cambios.slice(i, i + LOTE).forEach(({expediente, estadoNuevo,
      fijarCompletado}) => {
      const ref = db.collection("expedientes").doc(expediente.id);
      lote.update(ref, {
        estado: estadoNuevo,
        migracionEstados: true,
        ...(fijarCompletado ?
          {fechaCompletado: FieldValue.serverTimestamp()} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (estadoNuevo !== expediente.estado) {
        lote.set(expedienteEstadoRepository.nuevaRef(),
            expedienteEstadoRepository.datos({
              expediente, estadoNuevo, origen: "migracion",
              motivo: "modelo_estados",
              detalle: "Cambio al modelo Creado / En ejecución / Completado.",
            }));
      }
    });
    // eslint-disable-next-line no-await-in-loop
    await lote.commit();
    const enLote = Math.min(LOTE, cambios.length - i);
    console.log(`  Lote ${i / LOTE + 1}: ${enLote}`);
  }
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  console.log(`Proyecto: ${admin.app().options.credential?.projectId ||
    process.env.GCLOUD_PROJECT || "smartone-v3"}` +
    `${process.env.USE_EMULATOR === "true" ? " (EMULADOR)" : ""}`);
  console.log(EJECUTAR ? "MODO EJECUTAR\n" : "MODO DRY RUN (no escribe)\n");
  const {cambios, sinCambio, cerrados, yaMigrados} = await analizar();

  const conteo = {};
  cambios.forEach(({expediente, estadoNuevo}) => {
    const clave = `${expediente.estado} -> ${estadoNuevo}`;
    conteo[clave] = (conteo[clave] || 0) + 1;
  });
  console.log("Cambios de estado (anterior -> nuevo):");
  Object.entries(conteo).sort().forEach(([k, n]) =>
    console.log(`  ${k}: ${n}`));
  console.log(`\nA migrar: ${cambios.length} (sin cambio de estado: ` +
    `${sinCambio}) · Cerrados sin tocar: ${cerrados} · Ya migrados: ` +
    `${yaMigrados}`);
  const conFaena = cambios.filter((c) =>
    c.expediente.fechaInicioEjecucion).length;
  console.log(`Con inicio en faena (se conserva la fecha): ${conFaena}`);

  if (!EJECUTAR) {
    console.log("\nDry run: no se escribió nada. Use --ejecutar para aplicar.");
    return;
  }
  await aplicar(cambios);
  console.log("\nMigración aplicada.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
