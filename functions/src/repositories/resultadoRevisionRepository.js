const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "resultadosRevision";

/**
 * Acceso a datos de los Resultados de Revisión IA: uno por carpeta (persona)
 * y tipo documental, ya consolidado. Solo el backend escribe.
 */
class ResultadoRevisionRepository {
  /**
   * Obtiene un resultado por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} Resultado o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Resultados de una entidad (persona) de una sesión.
   * @param {string} sesionId Sesión.
   * @param {string} entidadClave Clave de la entidad.
   * @return {Promise<Object[]>} Resultados.
   */
  async listBySesionEntidad(sesionId, entidadClave) {
    const snap = await db.collection(COLLECTION)
        .where("sesionId", "==", sesionId)
        .where("entidadClave", "==", entidadClave).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Resultados de una sesión, ordenados por entidad.
   * @param {string} sesionId Sesión.
   * @return {Promise<Object[]>} Resultados.
   */
  async listBySesion(sesionId) {
    const snap = await db.collection(COLLECTION)
        .where("sesionId", "==", sesionId).get();
    const orden = (r) => r.entidadCarpeta || r.carpetaRelativa || "";
    return snap.docs.map((d) => ({id: d.id, ...d.data()}))
        .sort((a, b) => orden(a).localeCompare(orden(b), "es"));
  }

  /**
   * Resultados sin resolver ("propuesto") enlazados a un Expediente (por
   * el campo `expedienteIds`, que se llena al consolidar).
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<Object[]>} Resultados propuestos.
   */
  async listPropuestosByExpediente(expedienteId) {
    const snap = await db.collection(COLLECTION)
        .where("expedienteIds", "array-contains", expedienteId)
        .where("estado", "==", "propuesto").get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Crea un resultado.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Resultado creado.
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
   * Actualiza un resultado.
   * @param {string} id ID del resultado.
   * @param {Object} data Campos a cambiar.
   * @return {Promise<Object>} Resultado actualizado.
   */
  async update(id, data) {
    await db.collection(COLLECTION).doc(id).update({
      ...data, updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }
}

module.exports = new ResultadoRevisionRepository();
module.exports.COLLECTION = COLLECTION;
