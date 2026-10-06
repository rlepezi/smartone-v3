const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "perfilesParticipacion";

/**
 * Acceso a datos de Firestore para el recurso Perfil de Participación.
 */
class PerfilParticipacionRepository {
  /**
   * Obtiene un perfil de participación por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El perfil o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca un perfil por su nombre, dentro de un mandante.
   * @param {string} mandanteId ID del Mandante.
   * @param {string} nombre Nombre del perfil.
   * @return {Promise<object|null>} El perfil o null si no existe.
   */
  async getByNombre(mandanteId, nombre) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("mandanteId", "==", mandanteId)
        .where("nombre", "==", nombre)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista perfiles de participación, opcionalmente filtrados por mandante
   * y/o estado.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de perfiles.
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
   * Perfiles de participación ACTIVOS (opcionalmente de un Mandante), solo
   * con su mandanteId: usado para descartar vínculos de perfiles inactivos
   * al contar Requerimientos por Perfil de Recurso. Igualdad pura, sin
   * orderBy y con proyección: no requiere índice compuesto.
   * @param {{mandanteId: ?string}} filtros Filtros opcionales.
   * @return {Promise<object[]>} Perfiles {id, mandanteId}.
   */
  async listActivosParaConteo({mandanteId} = {}) {
    let query = db.collection(COLLECTION).where("estado", "==", "activo");
    if (mandanteId) query = query.where("mandanteId", "==", mandanteId);
    const snapshot = await query.select("mandanteId").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea un nuevo perfil de participación.
   * @param {object} data Datos del perfil.
   * @return {Promise<object>} El perfil creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const perfilData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(perfilData);
    return {id: docRef.id, ...perfilData};
  }

  /**
   * Actualiza un perfil de participación existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El perfil actualizado.
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
   * Actualiza únicamente el estado de un perfil de participación.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El perfil actualizado.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new PerfilParticipacionRepository();
