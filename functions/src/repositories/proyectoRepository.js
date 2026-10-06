const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "proyectos";

/**
 * Acceso a datos de Firestore para el recurso Proyecto.
 */
class ProyectoRepository {
  /**
   * Obtiene un proyecto por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El proyecto o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca un proyecto por su código, dentro de un mandante.
   * @param {string} mandanteId ID del Mandante.
   * @param {string} codigo Código del proyecto.
   * @return {Promise<object|null>} El proyecto o null si no existe.
   */
  async getByCodigo(mandanteId, codigo) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("mandanteId", "==", mandanteId)
        .where("codigo", "==", codigo)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista proyectos, opcionalmente filtrados por mandante y/o estado.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de proyectos.
   */
  async list({mandanteId, estado} = {}) {
    let query = db.collection(COLLECTION);

    if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
    }
    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea un nuevo proyecto.
   * @param {object} data Datos del proyecto.
   * @return {Promise<object>} El proyecto creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const proyectoData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(proyectoData);
    return {id: docRef.id, ...proyectoData};
  }

  /**
   * Actualiza un proyecto existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El proyecto actualizado.
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
   * Actualiza únicamente el estado de un proyecto.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El proyecto actualizado.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new ProyectoRepository();
