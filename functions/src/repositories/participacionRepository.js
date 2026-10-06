const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "participaciones";

/**
 * Acceso a datos de Firestore para el recurso Participación (vincula una
 * Empresa con un Proyecto bajo un Perfil de Participación).
 */
class ParticipacionRepository {
  /**
   * Obtiene una participación por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} La participación o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca una participación activa para un (proyectoId, empresaId) dado.
   * Usado para la regla de unicidad: no puede haber dos participaciones
   * activas simultáneas de la misma Empresa en el mismo Proyecto.
   * @param {string} proyectoId ID del Proyecto.
   * @param {string} empresaId ID de la Empresa.
   * @return {Promise<object|null>} La participación activa o null.
   */
  async getActivaByProyectoYEmpresa(proyectoId, empresaId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("proyectoId", "==", proyectoId)
        .where("empresaId", "==", empresaId)
        .where("estado", "==", "activa")
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Obtiene todas las participaciones activas de una Empresa, en
   * cualquier Proyecto. Una Empresa puede tener participaciones activas
   * simultáneas en varios Proyectos (la exclusividad es solo por
   * Proyecto, ver `getActivaByProyectoYEmpresa`) — usado por
   * acreditacionService para ubicar la participación "actual" a cerrar
   * al reemplazar una acreditación.
   * @param {string} empresaId ID de la Empresa.
   * @return {Promise<object[]>} Lista de participaciones activas.
   */
  async getActivasByEmpresa(empresaId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("empresaId", "==", empresaId)
        .where("estado", "==", "activa")
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Obtiene todas las participaciones de un Perfil de Participación,
   * sin filtrar por estado (uso histórico incluido). Una sola igualdad,
   * sin orderBy: no requiere índice compuesto.
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @return {Promise<object[]>} Lista de participaciones de ese Perfil.
   */
  async listByPerfil(perfilParticipacionId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("perfilParticipacionId", "==", perfilParticipacionId)
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Lista participaciones. Solo acepta UNO de los filtros por clave foránea
   * (mandanteId, proyectoId o empresaId) combinado opcionalmente con
   * estado en el caso de mandanteId — nunca proyectoId/empresaId junto con
   * estado en la misma query, para no requerir índices compuestos
   * adicionales que no existen.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined),
   *     proyectoId: (string|undefined), empresaId: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de participaciones.
   */
  async list({mandanteId, estado, proyectoId, empresaId} = {}) {
    let query = db.collection(COLLECTION);

    if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
      if (estado) {
        query = query.where("estado", "==", estado);
      }
    } else if (proyectoId) {
      query = query.where("proyectoId", "==", proyectoId);
    } else if (empresaId) {
      query = query.where("empresaId", "==", empresaId);
    } else if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea una nueva participación.
   * @param {object} data Datos de la participación.
   * @return {Promise<object>} La participación creada.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const participacionData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(participacionData);
    return {id: docRef.id, ...participacionData};
  }

  /**
   * Actualiza una participación existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} La participación actualizada.
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
   * Actualiza únicamente el estado de una participación.
   * No usado actualmente (finalizarParticipacion pasa por update), se
   * mantiene por paridad de interfaz con el resto de repositorios.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} La participación actualizada.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new ParticipacionRepository();
module.exports.COLLECTION = COLLECTION;
