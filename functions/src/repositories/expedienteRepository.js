const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "expedientes";

/**
 * Acceso a datos de Firestore para el recurso Expediente.
 */
class ExpedienteRepository {
  /**
   * Obtiene un expediente por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El expediente o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Obtiene todos los expedientes de una Participación, sin filtrar por
   * estado. Usado para verificar si ya existe uno "en curso" (el service
   * filtra en memoria los que no estén "cerrado"). Una sola igualdad, sin
   * orderBy: no requiere índice compuesto.
   * @param {string} participacionId ID de la Participación.
   * @return {Promise<object[]>} Lista de expedientes de esa Participación.
   */
  async getByParticipacion(participacionId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("participacionId", "==", participacionId)
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Obtiene todos los expedientes de una Empresa (a través de cualquier
   * Participación/Proyecto), sin filtrar por estado. Usado por
   * acreditacionService para ubicar Evaluaciones de nivel "empresa"
   * reutilizables al reemplazar una acreditación (Evaluación no tiene
   * `empresaId` propio, así que se filtra primero por los Expedientes de
   * la Empresa). Una sola igualdad, sin orderBy: no requiere índice
   * compuesto.
   * @param {string} empresaId ID de la Empresa.
   * @return {Promise<object[]>} Lista de expedientes de esa Empresa.
   */
  async getByEmpresa(empresaId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("empresaId", "==", empresaId)
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Obtiene todos los expedientes que usan un Perfil de Participación
   * dado (campo denormalizado al crearse, RN ya existente). Una sola
   * igualdad, sin orderBy: no requiere índice compuesto.
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @return {Promise<object[]>} Lista de expedientes de ese Perfil.
   */
  async getByPerfil(perfilParticipacionId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("perfilParticipacionId", "==", perfilParticipacionId)
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Lista expedientes, opcionalmente filtrados por mandante y/o estado.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de expedientes.
   */
  async list({mandanteId, estado} = {}) {
    let query = db.collection(COLLECTION);

    if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
      if (estado) {
        query = query.where("estado", "==", estado);
      }
    } else if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea un nuevo expediente.
   * @param {object} data Datos del expediente.
   * @return {Promise<object>} El expediente creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const expedienteData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(expedienteData);
    return {id: docRef.id, ...expedienteData};
  }

  /**
   * Actualiza un expediente existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El expediente actualizado.
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
}

module.exports = new ExpedienteRepository();
module.exports.COLLECTION = COLLECTION;
