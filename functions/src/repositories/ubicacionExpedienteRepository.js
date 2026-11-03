const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "ubicacionesExpediente";

/**
 * Acceso a datos de las excepciones de ubicación confirmadas en un
 * expediente (override), por nodo de la plantilla: ID determinístico
 * `{expedienteId}|{nodoClave}|{sujeto}` (sujeto = "empresa", personaId o
 * recursoId; la "/" de la nodoClave se guarda como "~"). Sin borrado
 * físico: `activo`.
 */
class UbicacionExpedienteRepository {
  /**
   * ID de un override.
   * @param {string} expedienteId Expediente.
   * @param {string} nodoClave Nodo.
   * @param {string} sujeto "empresa" | personaId | recursoId.
   * @return {string} ID.
   */
  id(expedienteId, nodoClave, sujeto) {
    return `${expedienteId}|${String(nodoClave).replace(/\//g, "~")}|` +
      (sujeto || "empresa");
  }

  /**
   * Override por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Override o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Overrides por filtros de igualdad (siempre con Mandante).
   * @param {{mandanteId: string, expedienteId: ?string, activo: ?boolean}}
   *     filtros Filtros.
   * @return {Promise<Object[]>} Overrides.
   */
  async list({mandanteId, expedienteId = null, activo = null}) {
    let q = db.collection(COLLECTION).where("mandanteId", "==", mandanteId);
    if (expedienteId) q = q.where("expedienteId", "==", expedienteId);
    if (activo !== null) q = q.where("activo", "==", activo);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Crea o reemplaza un override (activo).
   * @param {string} id ID.
   * @param {Object} datos {mandanteId, expedienteId, nodoClave, sujeto,
   *     rutaReal, confirmadoPor}.
   * @return {Promise<Object>} Override.
   */
  async guardar(id, datos) {
    const ahora = FieldValue.serverTimestamp();
    await db.collection(COLLECTION).doc(id).set({...datos, activo: true,
      confirmadoAt: ahora, updatedAt: ahora}, {merge: true});
    return this.getById(id);
  }

  /**
   * Desactiva un override (sin borrarlo).
   * @param {string} id ID.
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<Object>} Override.
   */
  async desactivar(id, autor) {
    await db.collection(COLLECTION).doc(id).update({activo: false,
      desactivadoPor: autor, updatedAt: FieldValue.serverTimestamp()});
    return this.getById(id);
  }
}

module.exports = new UbicacionExpedienteRepository();
module.exports.COLLECTION = COLLECTION;
