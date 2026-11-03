const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "plantillasEstructura";

/**
 * Acceso a datos de las Plantillas de Estructura de carpetas (Revisiones IA),
 * una activa por Mandante. Solo el backend escribe.
 */
class PlantillaEstructuraRepository {
  /**
   * Obtiene una plantilla por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} Plantilla o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Plantillas de un Mandante (o de todos).
   * @param {?string} mandanteId Mandante, o null para todos.
   * @param {?string} [estado] Estado.
   * @return {Promise<Object[]>} Plantillas.
   */
  async list(mandanteId, estado = null) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    if (estado) q = q.where("estado", "==", estado);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Plantilla activa de un Mandante.
   * @param {string} mandanteId Mandante.
   * @return {Promise<?Object>} Plantilla o null.
   */
  async getActiva(mandanteId) {
    return (await this.list(mandanteId, "activa"))[0] || null;
  }

  /**
   * Crea una plantilla.
   * @param {Object} data Datos.
   * @return {Promise<Object>} Plantilla creada.
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
   * Lee y actualiza una plantilla en una transacción: `fn` recibe la
   * plantilla actual y devuelve los campos a escribir (o lanza).
   * @param {string} id ID.
   * @param {Function} fn (plantilla) => campos.
   * @return {Promise<Object>} Plantilla actualizada.
   */
  async actualizarEnTransaccion(id, fn) {
    const ref = db.collection(COLLECTION).doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const campos = fn(snap.exists ? {id: snap.id, ...snap.data()} : null);
      tx.update(ref, {...campos, updatedAt: FieldValue.serverTimestamp()});
    });
    return this.getById(id);
  }

  /**
   * Actualiza una plantilla.
   * @param {string} id ID.
   * @param {Object} data Campos.
   * @return {Promise<Object>} Plantilla actualizada.
   */
  async update(id, data) {
    await db.collection(COLLECTION).doc(id).update({
      ...data, updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }

  /**
   * Guarda la copia de una versión (subcolección versiones/{n}) para
   * auditoría. Idempotente: la misma versión se sobrescribe con lo mismo.
   * @param {string} id Plantilla.
   * @param {Object} plantilla Plantilla (con version).
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<void>}
   */
  async guardarVersion(id, plantilla, autor) {
    const version = Number(plantilla.version || 1);
    await db.collection(COLLECTION).doc(id).collection("versiones")
        .doc(String(version)).set({
          version, nombre: plantilla.nombre,
          profundidadSubcontratos: plantilla.profundidadSubcontratos ?? 1,
          secciones: plantilla.secciones || [], guardadaPor: autor || null,
          guardadaAt: FieldValue.serverTimestamp(),
        });
  }

  /**
   * true si la versión ya tiene copia.
   * @param {string} id Plantilla.
   * @param {number} version Versión.
   * @return {Promise<boolean>} Existe.
   */
  async existeVersion(id, version) {
    const doc = await db.collection(COLLECTION).doc(id).collection("versiones")
        .doc(String(version)).get();
    return doc.exists;
  }
}

module.exports = new PlantillaEstructuraRepository();
module.exports.COLLECTION = COLLECTION;
