const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "reglasIA";
const VERSIONES = "versiones";

/**
 * Acceso a datos de la biblioteca de reglas de revisión IA. Cada edición
 * guarda la versión anterior completa en la subcolección `versiones` (ID =
 * número de versión). Nunca se borra: solo cambia de estado. Solo el backend
 * escribe.
 */
class ReglaIARepository {
  /**
   * Obtiene una regla por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Regla o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Varias reglas por ID (las inexistentes se omiten).
   * @param {Array<string>} ids IDs.
   * @return {Promise<Object[]>} Reglas.
   */
  async getByIds(ids) {
    const unicos = [...new Set((ids || []).filter(Boolean))];
    if (!unicos.length) return [];
    const docs = await db.getAll(...unicos.map((id) =>
      db.collection(COLLECTION).doc(id)));
    return docs.filter((d) => d.exists).map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Todas las reglas (la biblioteca es chica; se filtra en memoria).
   * @return {Promise<Object[]>} Reglas.
   */
  async list() {
    const snap = await db.collection(COLLECTION).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Crea una regla (versión 1).
   * @param {Object} data Datos.
   * @return {Promise<Object>} Regla creada.
   */
  async create(data) {
    const ref = db.collection(COLLECTION).doc();
    await ref.set({...data, version: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()});
    return this.getById(ref.id);
  }

  /**
   * Nueva versión: guarda la anterior completa en `versiones` y actualiza la
   * regla, en una transacción.
   * @param {string} id ID.
   * @param {Object} cambios Campos nuevos (sin version).
   * @return {Promise<Object>} Regla actualizada.
   */
  async nuevaVersion(id, cambios) {
    const ref = db.collection(COLLECTION).doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("La regla no existe.");
      const actual = snap.data();
      const version = actual.version || 1;
      tx.set(ref.collection(VERSIONES).doc(String(version)), {
        ...actual, archivadaAt: FieldValue.serverTimestamp(),
      });
      tx.update(ref, {...cambios, version: version + 1,
        updatedAt: FieldValue.serverTimestamp()});
    });
    return this.getById(id);
  }

  /**
   * Cambia campos sin crear versión (estado).
   * @param {string} id ID.
   * @param {Object} cambios Campos.
   * @return {Promise<Object>} Regla actualizada.
   */
  async update(id, cambios) {
    await db.collection(COLLECTION).doc(id).update({
      ...cambios, updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }

  /**
   * Versiones anteriores, de la más nueva a la más antigua.
   * @param {string} id ID.
   * @return {Promise<Object[]>} Versiones.
   */
  async listVersiones(id) {
    const snap = await db.collection(COLLECTION).doc(id)
        .collection(VERSIONES).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}))
        .sort((a, b) => (b.version || 0) - (a.version || 0));
  }
}

module.exports = new ReglaIARepository();
module.exports.COLLECTION = COLLECTION;
