const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "pruebasReglasIA";

/**
 * Acceso a datos de las pruebas de reglas IA de un requerimiento ("Probar
 * reglas"). Inmutables; nunca guardan el archivo ni su base64. Solo el
 * backend escribe.
 */
class PruebaReglaIARepository {
  /**
   * Crea una prueba.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Prueba creada.
   */
  async create(data) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({...data, createdAt: FieldValue.serverTimestamp()});
    const doc = await ref.get();
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Últimas pruebas de un requerimiento (más reciente primero).
   * @param {string} requerimientoId ID del requerimiento.
   * @param {number} limite Máximo.
   * @return {Promise<Object[]>} Pruebas.
   */
  async listByRequerimiento(requerimientoId, limite = 10) {
    const snap = await db.collection(COLLECTION)
        .where("requerimientoId", "==", requerimientoId).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) -
          (a.createdAt?.toMillis?.() || 0))
        .slice(0, limite);
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

module.exports = new PruebaReglaIARepository();
module.exports.COLLECTION = COLLECTION;
