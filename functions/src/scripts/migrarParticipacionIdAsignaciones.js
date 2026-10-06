/**
 * Migración única: backfill de `participacionId` en Asignación.
 *
 * Asignación (Persona/Recurso ↔ Proyecto) siempre guardó proyectoId +
 * empresaId, pero no a qué Participación específica pertenece.
 * `participacionService.crearParticipacion` solo impide dos
 * Participaciones ACTIVAS simultáneas de la misma Empresa en el mismo
 * Proyecto — nada impide que, tras finalizar una, la misma Empresa
 * vuelva a participar más adelante en el mismo Proyecto (una
 * Participación nueva, mismo proyectoId+empresaId). Sin `participacionId`,
 * las Asignaciones de ambos períodos quedan indistinguibles.
 *
 * Para cada Asignación sin `participacionId`:
 *   - Se buscan las Participaciones de ese mismo proyectoId+empresaId
 *     cuyo rango [fechaInicio, fechaTermino] (fechaTermino=null = sigue
 *     abierta) contenga la fechaInicio de la Asignación.
 *   - Si hay EXACTAMENTE UNA coincidencia → se backfillea con ese id.
 *   - Si hay cero o más de una (ambigüedad) → NO se adivina: queda en el
 *     reporte de revisión manual, sin tocar el documento.
 *
 * `participacionId` es de trazabilidad — no reemplaza a
 * proyectoId/empresaId como filtro principal en ninguna consulta ya
 * existente.
 *
 * Uso:
 *   node src/scripts/migrarParticipacionIdAsignaciones.js              (DRY
 *       RUN — solo imprime qué se modificaría, no escribe nada)
 *   node src/scripts/migrarParticipacionIdAsignaciones.js --ejecutar    (
 *       aplica los cambios reales)
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

const LOTE_MAXIMO_BATCH = 450; // margen bajo el límite de 500 de Firestore.

/**
 * Convierte un valor (Firestore Timestamp, Date, string o null) a
 * milisegundos epoch. `null`/`undefined` representa "sin límite" — el
 * llamador decide si eso significa -Infinity o +Infinity según el campo.
 * @param {*} valor Valor a convertir.
 * @return {?number} Milisegundos, o null si el valor es nulo.
 */
function aMillis(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate().getTime();
  return new Date(valor).getTime();
}

/**
 * Indica si `fechaInicioAsignacionMillis` cae dentro del rango
 * [fechaInicio, fechaTermino] de una Participación.
 * @param {Object} participacion Documento de Participación.
 * @param {number} fechaInicioAsignacionMillis fechaInicio de la
 *     Asignación, en milisegundos.
 * @return {boolean} true si el rango la contiene.
 */
function participacionContieneFecha(
    participacion, fechaInicioAsignacionMillis,
) {
  const inicioMillis = aMillis(participacion.fechaInicio);
  if (inicioMillis === null || fechaInicioAsignacionMillis < inicioMillis) {
    return false;
  }
  const terminoMillis = aMillis(participacion.fechaTermino);
  if (terminoMillis === null) return true; // Participación sigue abierta.
  return fechaInicioAsignacionMillis <= terminoMillis;
}

/**
 * Detecta las Asignaciones sin `participacionId` y, para cada una, busca
 * la Participación de su mismo proyectoId+empresaId cuyo rango de fechas
 * contenga la fechaInicio de la Asignación.
 * @return {Promise<{cambios: Object[], revisionManual: Object[]}>}
 */
async function detectarCambios() {
  const [asignacionesSnap, participacionesSnap] = await Promise.all([
    db.collection("asignaciones").get(),
    db.collection("participaciones").get(),
  ]);

  // Índice en memoria por proyectoId+empresaId — evita una consulta por
  // Asignación (participacionRepository.list solo acepta UN filtro por
  // clave foránea a la vez, ver su propio docstring).
  const participacionesPorClave = {};
  participacionesSnap.forEach((doc) => {
    const data = doc.data();
    const clave = `${data.proyectoId}|${data.empresaId}`;
    if (!participacionesPorClave[clave]) participacionesPorClave[clave] = [];
    participacionesPorClave[clave].push({id: doc.id, ...data});
  });

  const cambios = [];
  const revisionManual = [];

  asignacionesSnap.forEach((doc) => {
    const data = doc.data();
    if (data.participacionId !== undefined) return; // Ya migrada.

    const etiqueta = data.personaId ?
        `Persona ${data.personaId}` :
        `Recurso ${data.recursoId}`;

    if (!data.proyectoId || !data.empresaId || !data.fechaInicio) {
      revisionManual.push({
        asignacionId: doc.id,
        etiqueta,
        motivo: "faltan_campos",
        detalle:
            "Falta proyectoId, empresaId o fechaInicio en la propia " +
            "Asignación.",
      });
      return;
    }

    const clave = `${data.proyectoId}|${data.empresaId}`;
    const candidatas = participacionesPorClave[clave] || [];
    const fechaInicioMillis = aMillis(data.fechaInicio);
    const coincidencias = candidatas.filter(
        (p) => participacionContieneFecha(p, fechaInicioMillis),
    );

    if (coincidencias.length === 1) {
      cambios.push({
        asignacionId: doc.id,
        etiqueta,
        proyectoId: data.proyectoId,
        empresaId: data.empresaId,
        participacionId: coincidencias[0].id,
      });
    } else if (coincidencias.length === 0) {
      revisionManual.push({
        asignacionId: doc.id,
        etiqueta,
        motivo: candidatas.length === 0 ?
            "sin_participacion_para_proyecto_empresa" :
            "ninguna_participacion_cubre_la_fecha",
        proyectoId: data.proyectoId,
        empresaId: data.empresaId,
        candidatas: candidatas.map((p) => p.id),
      });
    } else {
      revisionManual.push({
        asignacionId: doc.id,
        etiqueta,
        motivo: "ambiguo_mas_de_una_participacion_coincide",
        proyectoId: data.proyectoId,
        empresaId: data.empresaId,
        candidatas: coincidencias.map((p) => p.id),
      });
    }
  });

  return {cambios, revisionManual};
}

/**
 * Imprime el resultado del diagnóstico.
 * @param {Object[]} cambios Cambios seguros a aplicar.
 * @param {Object[]} revisionManual Casos que necesitan revisión manual.
 * @return {void}
 */
function imprimirDryRun(cambios, revisionManual) {
  console.log(
      `\n=== DRY RUN — ${cambios.length} Asignación(es) a backfillear ===`,
  );
  for (const c of cambios) {
    console.log(
        `  [${c.asignacionId}] ${c.etiqueta} — Proyecto ${c.proyectoId} / ` +
        `Empresa ${c.empresaId} → participacionId: ${c.participacionId}`,
    );
  }

  if (revisionManual.length > 0) {
    console.log(
        `\n=== ${revisionManual.length} caso(s) requieren revisión ` +
        "manual — NO se tocan ===",
    );
    for (const r of revisionManual) {
      const candidatasTexto = r.candidatas ?
          ` (candidatas: ${r.candidatas.join(", ") || "ninguna"})` :
          "";
      const detalleTexto = r.detalle ? ` — ${r.detalle}` : "";
      console.log(
          `  [${r.asignacionId}] ${r.etiqueta} — motivo: ${r.motivo}` +
          candidatasTexto + detalleTexto,
      );
    }
  }

  console.log(
      `\nTotal: ${cambios.length} a backfillear automáticamente, ` +
      `${revisionManual.length} requieren revisión manual.`,
  );
}

/**
 * Aplica los cambios detectados en lotes (respeta el límite de 500
 * escrituras por batch de Firestore).
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  console.log("\n=== Ejecutando escritura real ===");

  for (let i = 0; i < cambios.length; i += LOTE_MAXIMO_BATCH) {
    const lote = cambios.slice(i, i + LOTE_MAXIMO_BATCH);
    const batch = db.batch();
    lote.forEach((c) => {
      const ref = db.collection("asignaciones").doc(c.asignacionId);
      batch.update(ref, {participacionId: c.participacionId});
    });
    await batch.commit();
    const numeroLote = Math.floor(i / LOTE_MAXIMO_BATCH) + 1;
    console.log(
        `  Lote ${numeroLote}: ${lote.length} Asignación(es) actualizadas.`,
    );
  }

  console.log(`Listo: ${cambios.length} Asignación(es) migrada(s).`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: backfill de participacionId en " +
      "Asignación ===",
  );
  console.log(
      `Modo: ${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN (solo lectura)"}`,
  );

  const {cambios, revisionManual} = await detectarCambios();
  imprimirDryRun(cambios, revisionManual);

  if (cambios.length === 0) {
    console.log("\nNada que migrar automáticamente.");
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
