const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "resultadosCompletitud";
const LOTE = 400;

/**
 * Acceso a datos de los Resultados de Completitud (Revisiones IA): uno por
 * sesión × empresa × sección × entidad. Solo el backend escribe.
 */
class ResultadoCompletitudRepository {
  /**
   * Crea varios resultados en lotes.
   * @param {Object[]} items Resultados.
   * @return {Promise<void>}
   */
  async createMany(items) {
    for (let i = 0; i < items.length; i += LOTE) {
      const batch = db.batch();
      items.slice(i, i + LOTE).forEach((item) => {
        batch.set(db.collection(COLLECTION).doc(), {
          ...item, createdAt: FieldValue.serverTimestamp(),
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
  }

  /**
   * Resultados de una sesión.
   * @param {string} sesionId Sesión.
   * @return {Promise<Object[]>} Resultados.
   */
  async listBySesion(sesionId) {
    const snap = await db.collection(COLLECTION)
        .where("sesionId", "==", sesionId).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Resultados de una entidad en una sesión.
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
   * Documentos encontrados en revisiones (para contar apariciones de los
   * documentos de plantilla sin tipo documental). Con tope de lectura.
   * @param {number} limite Máximo de documentos.
   * @return {Promise<Object[]>} [{mandanteId, seccionClave,
   *     documentosEncontrados}].
   */
  async listDocumentosEncontrados(limite) {
    const snap = await db.collection(COLLECTION)
        .select("mandanteId", "seccionClave", "documentosEncontrados")
        .limit(limite).get();
    return snap.docs.map((d) => d.data());
  }
}

module.exports = new ResultadoCompletitudRepository();
module.exports.COLLECTION = COLLECTION;
