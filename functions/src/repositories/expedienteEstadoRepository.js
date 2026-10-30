const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "expedienteEstados";

/**
 * Acceso a datos del historial de estados de un Expediente
 * (expedienteEstados): un documento por cada cambio de estado, automático o
 * manual. Solo se escribe desde el servidor, dentro de la misma transacción
 * o lote que el cambio.
 */
class ExpedienteEstadoRepository {
  /**
   * Referencia nueva (ID pre-generado, estable ante reintentos).
   * @return {FirebaseFirestore.DocumentReference} Referencia.
   */
  nuevaRef() {
    return db.collection(COLLECTION).doc();
  }

  /**
   * Datos de un cambio de estado.
   * @param {{expediente: Object, estadoNuevo: string, origen: string,
   *     motivo: (string|undefined), detalle: (string|undefined),
   *     actorUid: (string|undefined), actorNombre: (string|undefined)}}
   *     cambio Cambio aplicado.
   * @return {Object} Documento a escribir.
   */
  datos({expediente, estadoNuevo, origen, motivo, detalle, actorUid,
    actorNombre}) {
    return {
      expedienteId: expediente.id,
      mandanteId: expediente.mandanteId || null,
      estadoAnterior: expediente.estado || null,
      estadoNuevo,
      origen,
      motivo: motivo || null,
      detalle: detalle || null,
      actorUid: actorUid || null,
      actorNombre: actorNombre || null,
      createdAt: FieldValue.serverTimestamp(),
    };
  }

  /**
   * Historial de un Expediente, del más antiguo al más reciente.
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<Object[]>} Cambios de estado.
   */
  async listByExpediente(expedienteId) {
    const snap = await db.collection(COLLECTION)
        .where("expedienteId", "==", expedienteId)
        .orderBy("createdAt", "asc")
        .get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Consulta del último cierre de un Expediente (para leerlo en una
   * transacción).
   * @param {string} expedienteId ID del Expediente.
   * @return {FirebaseFirestore.Query} Consulta.
   */
  queryUltimoCierre(expedienteId) {
    return db.collection(COLLECTION)
        .where("expedienteId", "==", expedienteId)
        .where("estadoNuevo", "==", "cerrado")
        .orderBy("createdAt", "desc")
        .limit(1);
  }
}

module.exports = new ExpedienteEstadoRepository();
module.exports.COLLECTION = COLLECTION;
