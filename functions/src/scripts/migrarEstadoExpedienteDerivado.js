/**
 * Migración única: re-deriva el `estado` de los Expedientes existentes con
 * el nuevo modelo de estado calculado (ver decisions.md, "Estado de
 * Expediente derivado"). Los estados antiguos "preparacion_documental",
 * "en_correccion" y "reevaluacion" dejan de existir; creado/en_revision/
 * con_observaciones/aprobado pasan a depender de las Evaluaciones reales.
 * "en_ejecucion" y "cerrado" (decisiones manuales) NO se tocan.
 *
 * Solo actualiza `estado` (más `estadoMigradoDesde`, para conservar el
 * valor manual anterior). No borra nada. Idempotente: si ya coincide, salta.
 *
 * Uso:
 *   node src/scripts/migrarEstadoExpedienteDerivado.js             (DRY RUN)
 *   node src/scripts/migrarEstadoExpedienteDerivado.js --ejecutar  (aplica)
 */

const path = require("path");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = require(
      path.join(__dirname, "../../serviceaccountkey.json"),
  );
  admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
}

const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");
const expedienteService = require("../services/expedienteService");
// TRANSICIÓN bloque 2: perfilRecursoId de cada Asignación.
const {resolverPerfilesRecurso} = require("../utils/transicionPerfilRecurso");

const ESTADOS_MANUALES = ["en_ejecucion", "cerrado"];

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");
  console.log(
      `=== Migración estado de Expediente derivado — ` +
      `${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN"} ===`,
  );

  const snap = await db.collection("expedientes").get();
  const cambios = [];
  let sinCambio = 0;
  let manuales = 0;

  for (const doc of snap.docs) {
    const exp = {id: doc.id, ...doc.data()};
    if (ESTADOS_MANUALES.includes(exp.estado)) {
      manuales++;
      continue;
    }
    const [asig, evals] = await Promise.all([
      db.collection("asignaciones")
          .where("proyectoId", "==", exp.proyectoId)
          .where("estado", "==", "activa").get(),
      db.collection("evaluaciones")
          .where("expedienteId", "==", exp.id).get(),
    ]);
    const asignacionesEmpresa = await resolverPerfilesRecurso(asig.docs
        .map((d) => ({id: d.id, ...d.data()}))
        .filter((a) => a.empresaId === exp.empresaId));
    const evaluaciones = evals.docs.map((d) => ({id: d.id, ...d.data()}));
    const r = expedienteService.calcularEstadoDerivado(
        exp.requerimientosAplicables || [], asignacionesEmpresa, evaluaciones,
    );
    if (r.estado === exp.estado) {
      sinCambio++;
      continue;
    }
    cambios.push({id: exp.id, de: exp.estado, a: r.estado, ...r});
  }

  cambios.forEach((c) => {
    console.log(
        `  ${c.id}: ${c.de} -> ${c.a} ` +
        `(${c.evaluados}/${c.total} evaluados, ${c.noCumple} no cumple)`,
    );
  });
  console.log(
      `\nA cambiar: ${cambios.length} | Ya coincidían: ${sinCambio} | ` +
      `Manuales (no se tocan): ${manuales}`,
  );

  if (!ejecutar) {
    console.log("\nDRY RUN — no se escribió nada. Use --ejecutar.");
    return;
  }
  for (const c of cambios) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection("expedientes").doc(c.id).update({
      estado: c.a,
      estadoMigradoDesde: c.de,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`Listo: ${cambios.length} expediente(s) actualizados.`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal:", err);
      process.exit(1);
    });
