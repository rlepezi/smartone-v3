const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "sesionesRevision";

/**
 * Acceso a datos de las Sesiones de Revisión IA (una por carpeta revisada).
 * Solo el backend escribe; el cliente las lee (onSnapshot) para el progreso.
 */
class SesionRevisionRepository {
  /**
   * Obtiene una sesión por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} Sesión o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Crea una sesión.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Sesión creada.
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
   * Lista sesiones, opcionalmente de un Mandante, de la más reciente a la
   * más antigua.
   * @param {?string} mandanteId Mandante, o null para todas.
   * @param {?number} [limite] Máximo de sesiones (null = todas).
   * @return {Promise<Object[]>} Sesiones.
   */
  async list(mandanteId, limite = null) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    q = q.orderBy("createdAt", "desc");
    if (limite) q = q.limit(limite);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Historial filtrado y paginado por cursor (ID de la última sesión de la
   * página anterior), de la más reciente a la más antigua.
   * @param {Object} filtros {mandanteId, fuente, estado, desde, antesDe,
   *     cursor, limite}.
   * @return {Promise<{items: Object[], cursor: ?string}>} Página.
   */
  async buscar({mandanteId, fuente, estado, desde, antesDe, cursor, limite}) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    if (fuente) q = q.where("fuente", "==", fuente);
    if (estado) q = q.where("estado", "==", estado);
    if (desde) q = q.where("createdAt", ">=", desde);
    if (antesDe) q = q.where("createdAt", "<", antesDe);
    q = q.orderBy("createdAt", "desc");
    if (cursor) {
      const ultimo = await db.collection(COLLECTION).doc(cursor).get();
      if (ultimo.exists) q = q.startAfter(ultimo);
    }
    const snap = await q.limit(limite + 1).get();
    const docs = snap.docs.slice(0, limite);
    return {
      items: docs.map((d) => ({id: d.id, ...d.data()})),
      cursor: snap.docs.length > limite ? docs[docs.length - 1].id : null,
    };
  }

  /**
   * Actualiza campos de una sesión.
   * @param {string} id ID de la sesión.
   * @param {Object} data Campos.
   * @return {Promise<Object>} Sesión actualizada.
   */
  async update(id, data) {
    await db.collection(COLLECTION).doc(id).update({
      ...data, updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }

  /**
   * Suma valores a los totales y al costo real de una sesión (atómico).
   * @param {string} id ID de la sesión.
   * @param {Object<string, number>} totales Incrementos de `totales`.
   * @param {number} [costoUsd] Costo a sumar a costoRealUsd.
   * @return {Promise<void>}
   */
  async incrementar(id, totales, costoUsd = 0) {
    const cambios = {updatedAt: FieldValue.serverTimestamp()};
    Object.entries(totales).forEach(([campo, valor]) => {
      cambios[`totales.${campo}`] = FieldValue.increment(valor);
    });
    if (costoUsd) cambios.costoRealUsd = FieldValue.increment(costoUsd);
    await db.collection(COLLECTION).doc(id).update(cambios);
  }
}

module.exports = new SesionRevisionRepository();
module.exports.COLLECTION = COLLECTION;
