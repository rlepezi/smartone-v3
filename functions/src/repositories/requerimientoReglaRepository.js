const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "requerimientoReglas";

/**
 * Acceso a datos de los vínculos requerimiento ↔ regla de revisión IA
 * (severidad, parámetros y orden van en el vínculo; la regla se usa en su
 * versión vigente). Nunca se borran: "quitar" deja `activa: false` y
 * `quitada: true`. Solo el backend escribe.
 */
class RequerimientoReglaRepository {
  /**
   * Obtiene un vínculo por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Vínculo o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Vínculos activos (para contar en cuántos requerimientos se usa cada
   * regla).
   * @return {Promise<Object[]>} Vínculos activos.
   */
  async listActivos() {
    const snap = await db.collection(COLLECTION)
        .where("activa", "==", true).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Vínculos activos que usan una regla.
   * @param {string} reglaId ID de la regla.
   * @return {Promise<Object[]>} Vínculos.
   */
  async listActivosByRegla(reglaId) {
    const snap = await db.collection(COLLECTION)
        .where("reglaId", "==", reglaId).where("activa", "==", true).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Vínculos de un requerimiento que no fueron quitados, por orden.
   * @param {string} requerimientoId ID del requerimiento.
   * @return {Promise<Object[]>} Vínculos (activos e inactivos).
   */
  async listByRequerimiento(requerimientoId) {
    const snap = await db.collection(COLLECTION)
        .where("requerimientoId", "==", requerimientoId).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}))
        .filter((v) => !v.quitada)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  }

  /**
   * Crea un vínculo.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Vínculo creado.
   */
  async create(data) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({...data, quitada: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    return this.getById(ref.id);
  }

  /**
   * Actualiza un vínculo.
   * @param {string} id ID.
   * @param {Object} cambios Campos.
   * @return {Promise<Object>} Vínculo actualizado.
   */
  async update(id, cambios) {
    await db.collection(COLLECTION).doc(id)
        .update({...cambios, updatedAt: FieldValue.serverTimestamp()});
    return this.getById(id);
  }

  /**
   * Reordena varios vínculos en un lote.
   * @param {Array<{id: string, orden: number}>} ordenes Nuevo orden.
   * @param {Object} auditoria {updatedBy}.
   * @return {Promise<void>}
   */
  async ordenar(ordenes, auditoria) {
    const lote = db.batch();
    ordenes.forEach(({id, orden}) => lote.update(
        db.collection(COLLECTION).doc(id),
        {orden, ...auditoria, updatedAt: FieldValue.serverTimestamp()}));
    await lote.commit();
  }
}

module.exports = new RequerimientoReglaRepository();
module.exports.COLLECTION = COLLECTION;
