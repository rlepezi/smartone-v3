const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "revisionesRequerimientoIA";

/**
 * Acceso a datos de las revisiones IA por requerimiento ("Revisar con IA" en
 * la evaluación). La IA solo propone: la revisión queda "propuesta" hasta
 * que el evaluador guarda la evaluación ("confirmada") o la descarta. Nunca
 * se borra ni guarda el archivo. Solo el backend escribe.
 */
class RevisionRequerimientoIARepository {
  /**
   * Referencia a una revisión (para la transacción de la evaluación).
   * @param {string} id ID.
   * @return {FirebaseFirestore.DocumentReference} Referencia.
   */
  ref(id) {
    return db.collection(COLLECTION).doc(id);
  }

  /**
   * Obtiene una revisión por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Revisión o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Crea una revisión.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Revisión creada.
   */
  async create(data) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({...data, createdAt: FieldValue.serverTimestamp()});
    return this.getById(ref.id);
  }

  /**
   * Actualiza una revisión.
   * @param {string} id ID.
   * @param {Object} cambios Campos.
   * @return {Promise<Object>} Revisión actualizada.
   */
  async update(id, cambios) {
    await db.collection(COLLECTION).doc(id).update(cambios);
    return this.getById(id);
  }

  /**
   * Revisiones de un expediente (más reciente primero).
   * @param {string} expedienteId ID del expediente.
   * @return {Promise<Object[]>} Revisiones.
   */
  async listByExpediente(expedienteId) {
    const snap = await db.collection(COLLECTION)
        .where("expedienteId", "==", expedienteId).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) -
          (a.createdAt?.toMillis?.() || 0));
  }

  /**
   * Costos desde una fecha (para el gasto del mes).
   * @param {Date} desde Fecha inicial.
   * @return {Promise<Object[]>} [{costoEstimado, createdAt}].
   */
  async listCostosDesde(desde) {
    const snap = await db.collection(COLLECTION)
        .where("createdAt", ">=", desde)
        .select("costoEstimado", "createdAt").get();
    return snap.docs.map((d) => d.data());
  }
}

module.exports = new RevisionRequerimientoIARepository();
module.exports.COLLECTION = COLLECTION;
