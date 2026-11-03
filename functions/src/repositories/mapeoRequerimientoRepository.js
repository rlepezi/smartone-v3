const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "mapeoRequerimientos";

/**
 * Acceso a datos del vínculo N:N nodo de la plantilla ↔ requerimiento. ID
 * determinístico `{mandanteId}|{nodoClave}|{requerimientoId}` (la "/" de la
 * nodoClave, que Firestore no admite en un ID, se guarda como "~"). Sin
 * borrado físico: estado "activo" / "inactivo".
 */
class MapeoRequerimientoRepository {
  /**
   * ID de un vínculo.
   * @param {string} mandanteId Mandante.
   * @param {string} nodoClave Nodo.
   * @param {string} requerimientoId Requerimiento.
   * @return {string} ID.
   */
  id(mandanteId, nodoClave, requerimientoId) {
    return `${mandanteId}|${String(nodoClave).replace(/\//g, "~")}|` +
      requerimientoId;
  }

  /**
   * Vínculo por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Vínculo o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Vínculos por filtros de igualdad (siempre con Mandante).
   * @param {{mandanteId: string, requerimientoId: ?string,
   *     nodoClave: ?string, estado: ?string}} filtros Filtros.
   * @return {Promise<Object[]>} Vínculos.
   */
  async list({mandanteId, requerimientoId = null, nodoClave = null,
    estado = null}) {
    let q = db.collection(COLLECTION).where("mandanteId", "==", mandanteId);
    if (requerimientoId) q = q.where("requerimientoId", "==", requerimientoId);
    if (nodoClave) q = q.where("nodoClave", "==", nodoClave);
    if (estado) q = q.where("estado", "==", estado);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Crea o reactiva un vínculo.
   * @param {Object} datos {mandanteId, plantillaId, nodoClave,
   *     requerimientoId, nivel}.
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<Object>} Vínculo.
   */
  async activar(datos, autor) {
    const id = this.id(datos.mandanteId, datos.nodoClave,
        datos.requerimientoId);
    const ref = db.collection(COLLECTION).doc(id);
    const ahora = FieldValue.serverTimestamp();
    const previo = await ref.get();
    await ref.set({...datos, estado: "activo", motivoInactivo: null,
      updatedAt: ahora, updatedBy: autor,
      ...(previo.exists ? {} : {createdAt: ahora, createdBy: autor})},
    {merge: true});
    return this.getById(id);
  }

  /**
   * Cambia el estado de varios vínculos en un batch.
   * @param {string[]} ids IDs.
   * @param {string} estado "activo" | "inactivo".
   * @param {?string} motivo Motivo (p. ej. "nodo_retirado").
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<void>}
   */
  async cambiarEstado(ids, estado, motivo, autor) {
    for (let i = 0; i < ids.length; i += 400) {
      const lote = db.batch();
      ids.slice(i, i + 400).forEach((id) => lote.update(
          db.collection(COLLECTION).doc(id), {estado,
            motivoInactivo: estado === "inactivo" ? motivo || null : null,
            updatedAt: FieldValue.serverTimestamp(), updatedBy: autor}));
      await lote.commit();
    }
  }
}

module.exports = new MapeoRequerimientoRepository();
module.exports.COLLECTION = COLLECTION;
