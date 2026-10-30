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
   * Obtiene varios expedientes por ID con lecturas en lote (db.getAll), sin
   * una consulta por documento. Los IDs inexistentes se omiten.
   * @param {string[]} ids IDs de los documentos.
   * @return {Promise<object[]>} Documentos encontrados.
   */
  async getByIds(ids) {
    const unicos = [...new Set((ids || []).filter(Boolean))];
    const resultado = [];
    for (let i = 0; i < unicos.length; i += 100) {
      const refs = unicos.slice(i, i + 100)
          .map((id) => db.collection(COLLECTION).doc(id));
      // eslint-disable-next-line no-await-in-loop
      const docs = await db.getAll(...refs);
      docs.forEach((d) => {
        if (d.exists) resultado.push({id: d.id, ...d.data()});
      });
    }
    return resultado;
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
   * Obtiene todos los expedientes de un Proyecto, sin filtrar por estado
   * (cierre automático al finalizar o archivar el Proyecto). Una sola
   * igualdad, sin orderBy: no requiere índice compuesto.
   * @param {string} proyectoId ID del Proyecto.
   * @return {Promise<object[]>} Lista de expedientes de ese Proyecto.
   */
  async getByProyecto(proyectoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("proyectoId", "==", proyectoId)
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
