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
   * La pertenencia a una Empresa vive en la relación (empresaPersonas /
   * empresaRecursos): se filtra en el servicio, no aquí.
   * @param {{estado: (string|undefined)}} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de recursos.
   */
  async list({estado} = {}) {
    let query = db.collection(COLLECTION);

    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Recursos con una patente (normalizada en mayúsculas).
   * @param {string} patente Patente normalizada.
   * @return {Promise<object[]>} Recursos con esa patente.
   */
  async listByPatente(patente) {
    const snap = await db.collection(COLLECTION)
        .where("patente", "==", patente).get();
    return snap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Datos de alta con timestamps de servidor (para transacciones).
   * @param {object} data Datos del recurso.
   * @return {object} Datos listos para escribir.
   */
  datosAlta(data) {
    return {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
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
module.exports.COLLECTION = COLLECTION;
