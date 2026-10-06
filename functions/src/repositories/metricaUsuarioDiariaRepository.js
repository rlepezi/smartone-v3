const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "metricasUsuarioDiarias";

/**
 * Acceso a datos de Firestore para `metricasUsuarioDiarias/{usuarioId}_
 * {YYYY-MM-DD}` (fecha en zona America/Santiago, ver
 * utils/fechaSantiago.js). Un único documento por usuario y día,
 * incrementado desde los puntos exactos que describe Fase C del prompt —
 * nunca se recalcula desde cero ni se toca desde más de un lugar por
 * métrica.
 */
class MetricaUsuarioDiariaRepository {
  /**
   * @param {string} usuarioId ID del usuario.
   * @param {string} fecha Fecha YYYY-MM-DD (America/Santiago).
   * @return {string} El ID del documento (`{usuarioId}_{fecha}`).
   */
  _id(usuarioId, fecha) {
    return `${usuarioId}_${fecha}`;
  }

  /**
   * Crea o mezcla campos base (usuarioId, mandanteId, fecha) — se llama
   * antes de cualquier `increment`/`arrayUnion` para asegurar que el
   * documento exista con `merge: true` (Firestore no permite `increment`
   * sobre un documento inexistente sin `set(..., {merge:true})`).
   * @param {string} usuarioId ID del usuario.
   * @param {?string} mandanteId ID del Mandante, o null.
   * @param {string} fecha Fecha YYYY-MM-DD.
   * @return {Promise<void>}
   */
  async _asegurarBase(usuarioId, mandanteId, fecha) {
    const ref = db.collection(COLLECTION).doc(this._id(usuarioId, fecha));
    await ref.set(
        {usuarioId, mandanteId: mandanteId ?? null, fecha}, {merge: true},
    );
  }

  /**
   * Incrementa `accesos` en 1 para el día de `fecha` — un solo punto de
   * escritura, llamado al iniciar una sesión (`sesionService.iniciar`).
   * @param {string} usuarioId ID del usuario.
   * @param {?string} mandanteId ID del Mandante.
   * @param {string} fecha Fecha YYYY-MM-DD.
   * @return {Promise<void>}
   */
  async incrementarAcceso(usuarioId, mandanteId, fecha) {
    await this._asegurarBase(usuarioId, mandanteId, fecha);
    await db.collection(COLLECTION).doc(this._id(usuarioId, fecha)).update({
      accesos: FieldValue.increment(1),
    });
  }

  /**
   * Incrementa `segundosConectado` — un solo punto de escritura, llamado
   * al cerrar una sesión (logout o timeout).
   * @param {string} usuarioId ID del usuario.
   * @param {?string} mandanteId ID del Mandante.
   * @param {string} fecha Fecha YYYY-MM-DD del INICIO de la sesión (no del
   *     cierre — una sesión que cruza medianoche suma su tiempo al día en
   *     que empezó, criterio simple y documentado, sin prorratear).
   * @param {number} segundos Segundos a sumar.
   * @return {Promise<void>}
   */
  async incrementarTiempoConectado(usuarioId, mandanteId, fecha, segundos) {
    if (!segundos || segundos <= 0) return;
    await this._asegurarBase(usuarioId, mandanteId, fecha);
    await db.collection(COLLECTION).doc(this._id(usuarioId, fecha)).update({
      segundosConectado: FieldValue.increment(segundos),
    });
  }

  /**
   * Incrementa `expedientesCreados` — un solo punto de escritura, desde el
   * trigger `onCreate` de Bitácora (`entidad: "expediente", accion:
   * "creado"`).
   * @param {string} usuarioId ID del usuario (actorUid de la bitácora).
   * @param {?string} mandanteId ID del Mandante.
   * @param {string} fecha Fecha YYYY-MM-DD (del `createdAt` del evento).
   * @return {Promise<void>}
   */
  async incrementarExpedienteCreado(usuarioId, mandanteId, fecha) {
    await this._asegurarBase(usuarioId, mandanteId, fecha);
    await db.collection(COLLECTION).doc(this._id(usuarioId, fecha)).update({
      expedientesCreados: FieldValue.increment(1),
    });
  }

  /**
   * Incrementa `evaluacionesRealizadas` y agrega el id del sujeto
   * evaluado (empresa/persona/máquina, el que corresponda) a su array de
   * ids distintos con `arrayUnion` — desde el trigger `onCreate` de
   * Bitácora (`entidad: "evaluacion", accion: "creado"`).
   * @param {string} usuarioId ID del usuario (actorUid/evaluadorId).
   * @param {?string} mandanteId ID del Mandante.
   * @param {string} fecha Fecha YYYY-MM-DD.
   * @param {{empresaId: (string|undefined), personaId: (string|undefined),
   *     recursoId: (string|undefined)}} sujeto Exactamente uno de los tres
   *     debe venir informado (mismo criterio que Evaluación: nivel
   *     empresa/persona/maquinaria son mutuamente excluyentes).
   * @return {Promise<void>}
   */
  async incrementarEvaluacionRealizada(usuarioId, mandanteId, fecha, sujeto) {
    await this._asegurarBase(usuarioId, mandanteId, fecha);
    const update = {evaluacionesRealizadas: FieldValue.increment(1)};
    if (sujeto.empresaId) {
      update.empresasEvaluadas = FieldValue.arrayUnion(sujeto.empresaId);
    } else if (sujeto.personaId) {
      update.personasEvaluadas = FieldValue.arrayUnion(sujeto.personaId);
    } else if (sujeto.recursoId) {
      update.maquinasEvaluadas = FieldValue.arrayUnion(sujeto.recursoId);
    }
    await db.collection(COLLECTION)
        .doc(this._id(usuarioId, fecha)).update(update);
  }

  /**
   * Documentos diarios de un usuario entre dos fechas (inclusive),
   * ordenados por fecha ascendente — base de `GET /usuarios/:id/metricas`.
   * @param {string} usuarioId ID del usuario.
   * @param {string} desde Fecha YYYY-MM-DD.
   * @param {string} hasta Fecha YYYY-MM-DD.
   * @return {Promise<object[]>} Documentos diarios en el rango.
   */
  async listarRango(usuarioId, desde, hasta) {
    const snapshot = await db.collection(COLLECTION)
        .where("usuarioId", "==", usuarioId)
        .where("fecha", ">=", desde)
        .where("fecha", "<=", hasta)
        .orderBy("fecha", "asc")
        .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * El documento del día de HOY para un usuario — usado para "Activos
   * hoy" / "accesos hoy" en el listado y el panel "Actividad hoy".
   * @param {string} usuarioId ID del usuario.
   * @param {string} fechaHoy Fecha YYYY-MM-DD de hoy (America/Santiago).
   * @return {Promise<?object>} El documento, o null si no hubo actividad.
   */
  async getDeHoy(usuarioId, fechaHoy) {
    const doc = await db.collection(COLLECTION)
        .doc(this._id(usuarioId, fechaHoy)).get();
    return doc.exists ? doc.data() : null;
  }

  /**
   * Documentos de HOY de TODOS los usuarios de un Mandante (o de todos, si
   * `mandanteId` es null) — usado por `GET /usuarios` para anexar
   * `accesos7d`/`ultimoAcceso` sin una consulta por fila, y por el panel
   * "Actividad hoy" del listado.
   * @param {string} fechaHoy Fecha YYYY-MM-DD de hoy.
   * @param {?string} mandanteId Acota por Mandante, o null para todos.
   * @return {Promise<object[]>} Documentos de hoy.
   */
  async listarDeHoy(fechaHoy, mandanteId) {
    let query = db.collection(COLLECTION).where("fecha", "==", fechaHoy);
    if (mandanteId) query = query.where("mandanteId", "==", mandanteId);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Mismo rango que `listarRango`, pero para VARIOS usuarios a la vez
   * (`accesos7d` de cada fila del listado, en una sola tanda de
   * consultas en vez de una por fila).
   * @param {string[]} usuarioIds IDs de los usuarios.
   * @param {string} desde Fecha YYYY-MM-DD.
   * @param {string} hasta Fecha YYYY-MM-DD.
   * @return {Promise<object[]>} Documentos en el rango, de todos.
   */
  async listarRangoTodos(usuarioIds, desde, hasta) {
    // `in` de Firestore soporta hasta 30 valores por consulta — se
    // trocea, mismo criterio que el resto del backend (ver
    // evaluacionService/expedienteService con listas de ids largas).
    const grupos = [];
    for (let i = 0; i < usuarioIds.length; i += 30) {
      grupos.push(usuarioIds.slice(i, i + 30));
    }
    const resultados = await Promise.all(grupos.map((grupo) =>
      db.collection(COLLECTION)
          .where("usuarioId", "in", grupo)
          .where("fecha", ">=", desde)
          .where("fecha", "<=", hasta)
          .get(),
    ));
    return resultados.flatMap((snap) => snap.docs.map((doc) => doc.data()));
  }
}

module.exports = new MetricaUsuarioDiariaRepository();
