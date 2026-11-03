const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "aliasSugeridos";

/**
 * Acceso a datos de los alias sugeridos desde un expediente para un nodo de
 * la plantilla (estado pendiente | aprobado | rechazado). Sin borrado
 * físico.
 */
class AliasSugeridoRepository {
  /**
   * Alias sugerido por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Sugerencia o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Sugerencias por filtros de igualdad (siempre con Mandante).
   * @param {{mandanteId: string, estado: ?string}} filtros Filtros.
   * @return {Promise<Object[]>} Sugerencias.
   */
  async list({mandanteId, estado = null}) {
    let q = db.collection(COLLECTION).where("mandanteId", "==", mandanteId);
    if (estado) q = q.where("estado", "==", estado);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Crea una sugerencia.
   * @param {Object} datos {mandanteId, nodoClave, alias, sugeridoPor,
   *     expedienteId, estado}.
   * @return {Promise<Object>} Sugerencia.
   */
  async create(datos) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({...datos, createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    return this.getById(ref.id);
  }

  /**
   * Resuelve una sugerencia (aprobado / rechazado).
   * @param {string} id ID.
   * @param {string} estado Estado.
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<Object>} Sugerencia.
   */
  async resolver(id, estado, autor) {
    await db.collection(COLLECTION).doc(id).update({estado,
      resueltoPor: autor, resueltoAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    return this.getById(id);
  }
}

module.exports = new AliasSugeridoRepository();
module.exports.COLLECTION = COLLECTION;
