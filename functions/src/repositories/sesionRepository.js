const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "sesiones";

/**
 * Acceso a datos de Firestore para la colección Sesiones (RN de
 * telemetría de accesos — ver docs/ para las definiciones de "acceso" y
 * "tiempo conectado"). A diferencia de Bitácora, SÍ admite `update`
 * (latido, cierre) porque una sesión es un registro vivo mientras dura,
 * pero nunca se borra individualmente — solo el archivado/purga mensual
 * por antigüedad (excepción documentada a la regla de no-eliminación
 * física, ver `sesionRetencionService.js`).
 */
class SesionRepository {
  /**
   * Crea una sesión nueva.
   * @param {{usuarioId: string, mandanteId: ?string, plataforma: string,
   *     userAgent: ?string}} data Datos de la sesión.
   * @return {Promise<object>} La sesión creada, con su id.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();
    const ahora = FieldValue.serverTimestamp();
    const sesion = {
      usuarioId: data.usuarioId,
      mandanteId: data.mandanteId ?? null,
      plataforma: data.plataforma,
      userAgent: data.userAgent || null,
      inicio: ahora,
      ultimoLatido: ahora,
      fin: null,
      duracionSeg: null,
      cierre: null,
    };
    await docRef.set(sesion);
    return {id: docRef.id, ...sesion};
  }

  /**
   * @param {string} id ID de la sesión.
   * @return {Promise<?object>} La sesión, o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Actualiza `ultimoLatido` a la hora actual del servidor.
   * @param {string} id ID de la sesión.
   * @return {Promise<void>}
   */
  async actualizarLatido(id) {
    await db.collection(COLLECTION).doc(id).update({
      ultimoLatido: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Cierra una sesión: fija `fin`, `duracionSeg` (en base a `inicio`) y el
   * tipo de cierre.
   * @param {string} id ID de la sesión.
   * @param {object} sesionActual La sesión ya leída (para no releerla).
   * @param {"logout"|"timeout"|"revocada"} cierre Motivo del cierre.
   * @param {Date} [finFecha] Momento exacto del fin — por defecto ahora;
   *     el cierre por timeout usa `ultimoLatido` en vez del momento en que
   *     corre la scheduled function (ver Fase B, "Scheduled function").
   * @return {Promise<object>} La sesión con los campos de cierre ya
   *     calculados (no relee de Firestore: `serverTimestamp()` no es
   *     legible de inmediato en el mismo write).
   */
  async cerrar(id, sesionActual, cierre, finFecha) {
    const fin = finFecha || new Date();
    const inicioDate = sesionActual.inicio?.toDate ?
        sesionActual.inicio.toDate() : new Date(sesionActual.inicio);
    const duracionSeg = Math.max(
        0, Math.round((fin.getTime() - inicioDate.getTime()) / 1000),
    );
    await db.collection(COLLECTION).doc(id).update({
      fin,
      duracionSeg,
      cierre,
    });
    return {...sesionActual, fin, duracionSeg, cierre};
  }

  /**
   * Sesiones abiertas (`fin == null`) cuyo último latido es anterior al
   * corte dado — para el cierre automático por timeout.
   * @param {Date} corte Fecha límite: `ultimoLatido < corte` se considera
   *     abandonada.
   * @return {Promise<object[]>} Sesiones abandonadas.
   */
  async getAbandonadasDesde(corte) {
    const snapshot = await db.collection(COLLECTION)
        .where("fin", "==", null)
        .where("ultimoLatido", "<", corte)
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Cantidad de sesiones abiertas con latido reciente (>= corte) — "
   * conectados ahora" del panel "Actividad hoy".
   * @param {Date} corte Umbral: `ultimoLatido >= corte` cuenta como activo.
   * @return {Promise<number>} Cantidad de sesiones activas ahora.
   */
  async contarActivasDesde(corte) {
    const snapshot = await db.collection(COLLECTION)
        .where("fin", "==", null)
        .where("ultimoLatido", ">=", corte)
        .count().get();
    return snapshot.data().count;
  }

  /**
   * Sesiones abiertas de un usuario (para "revocar sesiones").
   * @param {string} usuarioId ID del usuario.
   * @return {Promise<object[]>} Sesiones sin `fin`.
   */
  async getAbiertasPorUsuario(usuarioId) {
    const snapshot = await db.collection(COLLECTION)
        .where("usuarioId", "==", usuarioId)
        .where("fin", "==", null)
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Historial de sesiones de un usuario, paginado con cursor por
   * `inicio` descendente.
   * @param {string} usuarioId ID del usuario.
   * @param {{limit: number, cursor: (string|undefined)}} opciones
   *     Paginación.
   * @return {Promise<object[]>} Sesiones, más reciente primero.
   */
  async listPorUsuario(usuarioId, {limit = 20, cursor} = {}) {
    let query = db.collection(COLLECTION)
        .where("usuarioId", "==", usuarioId)
        .orderBy("inicio", "desc")
        .limit(Number(limit));
    if (cursor) {
      const cursorDoc = await db.collection(COLLECTION).doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Sesiones (de cualquier usuario) cuyo `inicio` es anterior al corte —
   * para el archivado/purga mensual por retención de 12 meses.
   * @param {Date} corte Fecha límite.
   * @param {number} limitLote Tamaño máximo del lote (evita timeouts en
   *     Mandantes con mucho volumen histórico).
   * @return {Promise<object[]>} Sesiones a archivar/purgar.
   */
  async getAnterioresA(corte, limitLote = 500) {
    const snapshot = await db.collection(COLLECTION)
        .where("inicio", "<", corte)
        .limit(limitLote)
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Borrado físico por lote — SOLO usado por la retención mensual de
   * telemetría (excepción documentada a la regla de no-eliminación).
   * @param {string[]} ids IDs a borrar.
   * @return {Promise<void>}
   */
  async borrarLote(ids) {
    if (ids.length === 0) return;
    const batch = db.batch();
    ids.forEach((id) => batch.delete(db.collection(COLLECTION).doc(id)));
    await batch.commit();
  }
}

module.exports = new SesionRepository();
