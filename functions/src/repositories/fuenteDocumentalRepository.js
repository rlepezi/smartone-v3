const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "fuentesDocumentales";

/**
 * Acceso a datos de las Fuentes Documentales (SharePoint) por Mandante.
 * Contienen el client secret cifrado: solo el backend las lee y escribe.
 */
class FuenteDocumentalRepository {
  /**
   * Obtiene una fuente por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} Fuente o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Fuentes de un Mandante (o de todos).
   * @param {?string} mandanteId Mandante, o null para todas.
   * @return {Promise<Object[]>} Fuentes.
   */
  async list(mandanteId) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Crea una fuente.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Fuente creada.
   */
  async create(data) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(ref.id);
  }

  /**
   * Actualiza una fuente.
   * @param {string} id ID de la fuente.
   * @param {Object} data Campos.
   * @return {Promise<Object>} Fuente actualizada.
   */
  async update(id, data) {
    await db.collection(COLLECTION).doc(id).update({
      ...data, updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }
}

module.exports = new FuenteDocumentalRepository();
module.exports.COLLECTION = COLLECTION;
