const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLECCION_CONFIG = "configuracionRespaldo";
const DOC_CONFIG = "principal";
const COLECCION_BITACORA = "respaldosBitacora";

/**
 * Acceso a datos de Firestore para el módulo de Respaldo y Restauración:
 * la configuración (documento único) y el historial de operaciones.
 */
class RespaldoRepository {
  /**
   * Obtiene la configuración de respaldos (documento único).
   * @return {Promise<?object>} La configuración o null si aún no existe.
   */
  async getConfiguracion() {
    const doc = await db.collection(COLECCION_CONFIG).doc(DOC_CONFIG).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Guarda (merge) la configuración de respaldos.
   * @param {object} data Campos a guardar.
   * @return {Promise<object>} La configuración resultante.
   */
  async setConfiguracion(data) {
    const ref = db.collection(COLECCION_CONFIG).doc(DOC_CONFIG);
    await ref.set({...data, updatedAt: FieldValue.serverTimestamp()},
        {merge: true});
    return {id: DOC_CONFIG, ...(await ref.get()).data()};
  }

  /**
   * Crea un registro en el historial de respaldos y restauraciones.
   * @param {object} data Datos del registro.
   * @return {Promise<object>} El registro creado.
   */
  async crearRegistro(data) {
    const ref = db.collection(COLECCION_BITACORA).doc();
    await ref.set({
      fechaFin: null,
      errorMensaje: null,
      operationName: null,
      ...data,
      fechaInicio: FieldValue.serverTimestamp(),
    });
    return {id: ref.id, ...(await ref.get()).data()};
  }

  /**
   * Actualiza campos de un registro del historial.
   * @param {string} id ID del registro.
   * @param {object} data Campos a actualizar.
   * @return {Promise<void>}
   */
  async actualizarRegistro(id, data) {
    await db.collection(COLECCION_BITACORA).doc(id).update(data);
  }

  /**
   * Obtiene un registro del historial por su ID.
   * @param {string} id ID del registro.
   * @return {Promise<?object>} El registro o null.
   */
  async getRegistro(id) {
    const doc = await db.collection(COLECCION_BITACORA).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Lista el historial de operaciones, más reciente primero.
   * @param {number} limite Máximo de registros.
   * @return {Promise<object[]>} Registros.
   */
  async listarRegistros(limite = 200) {
    const snap = await db.collection(COLECCION_BITACORA)
        .orderBy("fechaInicio", "desc").limit(limite).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }
}

module.exports = new RespaldoRepository();
