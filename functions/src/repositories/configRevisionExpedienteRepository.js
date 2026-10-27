const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "configRevisionExpediente";

/**
 * Configuración de Revisiones IA de un Expediente (ID del documento =
 * expedienteId): carpeta, requerimientos habilitados para IA y última
 * validación. Colección aparte para no tocar el Expediente. Solo el
 * backend escribe.
 */
class ConfigRevisionExpedienteRepository {
  /**
   * Configuración de un Expediente.
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<?Object>} Configuración o null.
   */
  async get(expedienteId) {
    const doc = await db.collection(COLLECTION).doc(expedienteId).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Crea o actualiza (merge) la configuración.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} data Campos.
   * @return {Promise<Object>} Configuración guardada.
   */
  async guardar(expedienteId, data) {
    await db.collection(COLLECTION).doc(expedienteId).set({
      ...data, expedienteId, updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return this.get(expedienteId);
  }
}

module.exports = new ConfigRevisionExpedienteRepository();
module.exports.COLLECTION = COLLECTION;
