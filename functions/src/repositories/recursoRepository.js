const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "recursos";

/**
 * Acceso a datos de Firestore para el recurso Recurso (maquinarias,
 * vehículos, equipos). Catálogo global, sin aislamiento por Mandante.
 */
class RecursoRepository {
  /**
   * Obtiene un recurso por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El recurso o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista recursos, opcionalmente filtrados por estado y/o empresa.
   * @param {{estado: (string|undefined), empresaId: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de recursos.
   */
  async list({estado, empresaId} = {}) {
    let query = db.collection(COLLECTION);

    if (empresaId) {
      query = query.where("empresaId", "==", empresaId);
    }
    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea un nuevo recurso.
   * @param {object} data Datos del recurso.
   * @return {Promise<object>} El recurso creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const recursoData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(recursoData);
    return {id: docRef.id, ...recursoData};
  }

  /**
   * Actualiza un recurso existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El recurso actualizado.
   */
  async update(id, data) {
    const docRef = db.collection(COLLECTION).doc(id);

    const updateData = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    delete updateData.createdAt;
    delete updateData.id;

    await docRef.update(updateData);
    return this.getById(id);
  }

  /**
   * Actualiza únicamente el estado de un recurso.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El recurso actualizado.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new RecursoRepository();
