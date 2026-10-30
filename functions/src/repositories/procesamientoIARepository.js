const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "procesamientosIA";

/**
 * Acceso a datos de los Procesamientos IA: un documento por archivo
 * procesado, inmutable salvo su estado. Nunca guarda el archivo ni su
 * base64.
 */
class ProcesamientoIARepository {
  /**
   * Obtiene un procesamiento por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} Procesamiento o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Crea un procesamiento.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Procesamiento creado.
   */
  async create(data) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({...data, createdAt: FieldValue.serverTimestamp()});
    return this.getById(ref.id);
  }

  /**
   * Procesamiento ya procesado de un archivo (mismo hash) en el Mandante,
   * para reutilizar su extracción sin volver a llamar a la IA.
   * @param {string} mandanteId Mandante.
   * @param {string} hashSha256 Hash del archivo original.
   * @return {Promise<?Object>} Procesamiento o null.
   */
  async getProcesadoPorHash(mandanteId, hashSha256) {
    const snap = await db.collection(COLLECTION)
        .where("mandanteId", "==", mandanteId)
        .where("archivoRef.hashSha256", "==", hashSha256)
        .where("estado", "==", "procesado")
        .limit(1).get();
    if (snap.empty) return null;
    return {id: snap.docs[0].id, ...snap.docs[0].data()};
  }

  /**
   * Procesamientos de una sesión (opcionalmente de una carpeta), en orden de
   * creación.
   * @param {string} sesionId Sesión.
   * @param {string} [carpetaRelativa] Carpeta.
   * @return {Promise<Object[]>} Procesamientos.
   */
  async listBySesion(sesionId, carpetaRelativa = null) {
    let q = db.collection(COLLECTION).where("sesionId", "==", sesionId);
    if (carpetaRelativa) q = q.where("carpetaRelativa", "==", carpetaRelativa);
    const snap = await q.get();
    const ms = (v) =>
      (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
    return snap.docs.map((d) => ({id: d.id, ...d.data()}))
        .sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  }

  /**
   * Procesamientos clasificados como OTRO (tipos por normalizar), solo con
   * su descripción, Mandante y fecha. Con tope de lectura.
   * @param {number} limite Máximo de documentos.
   * @return {Promise<Object[]>} [{tipoDetectadoDescripcion, mandanteId,
   *     createdAt}].
   */
  async listOtros(limite) {
    const snap = await db.collection(COLLECTION)
        .where("tipoDetectado", "==", "OTRO")
        .select("tipoDetectadoDescripcion", "mandanteId", "createdAt")
        .limit(limite).get();
    return snap.docs.map((d) => d.data());
  }

  /**
   * Costos de los procesamientos desde una fecha, opcionalmente de un
   * Mandante (pestaña Consumo), con su tipo detectado.
   * @param {?string} mandanteId Mandante, o null para todos.
   * @param {Date} desde Inicio (>=).
   * @return {Promise<Object[]>} [{costoUsd, createdAt, mandanteId,
   *     tipoDetectado}].
   */
  async listConsumoDesde(mandanteId, desde) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    const snap = await q.where("createdAt", ">=", desde)
        .select("costoUsd", "createdAt", "mandanteId", "tipoDetectado").get();
    return snap.docs.map((d) => d.data());
  }

  /**
   * Costos de los procesamientos creados desde una fecha (todos los
   * Mandantes: el límite de gasto es de la configuración global).
   * @param {Date} desde Inicio (>=).
   * @return {Promise<Object[]>} [{costoUsd, createdAt}].
   */
  async listCostosDesde(desde) {
    const snap = await db.collection(COLLECTION)
        .where("createdAt", ">=", desde)
        .select("costoUsd", "createdAt").get();
    return snap.docs.map((d) => d.data());
  }
}

module.exports = new ProcesamientoIARepository();
module.exports.COLLECTION = COLLECTION;
