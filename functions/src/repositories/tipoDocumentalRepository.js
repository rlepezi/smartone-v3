const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "tiposDocumentales";

/**
 * Acceso a datos de los Tipos Documentales de Revisiones IA (CEDULA_CL,
 * LICENCIA_CL). Catálogo global; solo el backend escribe.
 */
class TipoDocumentalRepository {
  /**
   * Obtiene un tipo documental por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} Tipo documental o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Busca un tipo documental por su código.
   * @param {string} codigo Código ("CEDULA_CL").
   * @return {Promise<?Object>} Tipo documental o null.
   */
  async getByCodigo(codigo) {
    const snap = await db.collection(COLLECTION)
        .where("codigo", "==", codigo).limit(1).get();
    if (snap.empty) return null;
    return {id: snap.docs[0].id, ...snap.docs[0].data()};
  }

  /**
   * Lista los tipos documentales.
   * @return {Promise<Object[]>} Tipos documentales.
   */
  async list() {
    const snap = await db.collection(COLLECTION).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Crea un tipo documental con su código como ID. Falla si ya existe.
   * @param {string} id ID (el código).
   * @param {Object} data Campos.
   * @return {Promise<Object>} Tipo creado.
   */
  async create(id, data) {
    await db.collection(COLLECTION).doc(id).create({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }

  /**
   * Actualiza campos de un tipo documental.
   * @param {string} id ID del tipo.
   * @param {Object} data Campos.
   * @return {Promise<Object>} Tipo actualizado.
   */
  async update(id, data) {
    await db.collection(COLLECTION).doc(id).update({
      ...data, updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }

  /**
   * Incrementa métricas de un tipo documental (atómico).
   * @param {string} id ID del tipo documental.
   * @param {Object<string, number>} incrementos {procesados: 1, ...}.
   * @return {Promise<void>}
   */
  async incrementarMetricas(id, incrementos) {
    const cambios = {updatedAt: FieldValue.serverTimestamp()};
    Object.entries(incrementos).forEach(([campo, valor]) => {
      cambios[`metricas.${campo}`] = FieldValue.increment(valor);
    });
    await db.collection(COLLECTION).doc(id).update(cambios);
  }
}

module.exports = new TipoDocumentalRepository();
module.exports.COLLECTION = COLLECTION;
