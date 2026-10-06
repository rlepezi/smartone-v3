const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "evidencias";

/**
 * Acceso a datos de Firestore para el recurso Evidencia. El archivo binario
 * vive en Firebase Storage; este documento solo guarda su URL y metadatos.
 */
class EvidenciaRepository {
  /**
   * Obtiene una evidencia por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} La evidencia o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista las evidencias activas de un Expediente. Usado por el detalle del
   * Expediente para armar el listado por Requerimiento; dos igualdades, sin
   * orderBy a propósito (no requiere índice compuesto).
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<object[]>} Lista de evidencias activas.
   */
  async getActivasByExpediente(expedienteId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("expedienteId", "==", expedienteId)
        .where("estado", "==", "activo")
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Lista evidencias, opcionalmente filtradas por mandante y/o estado.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de evidencias.
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
   * Lista todas las evidencias de una Persona (consulta de igualdad).
   * @param {string} personaId ID de la Persona.
   * @return {Promise<object[]>} Evidencias.
   */
  async listByPersona(personaId) {
    const snapshot = await db.collection(COLLECTION)
        .where("personaId", "==", personaId).get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Evidencias marcadas para eliminación por anonimización.
   * @return {Promise<object[]>} Evidencias pendientes de purga.
   */
  async listPendientesPurga() {
    const snapshot = await db.collection(COLLECTION)
        .where("pendienteEliminacionPorAnonimizacion", "==", true).get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea una nueva evidencia.
   * @param {object} data Datos de la evidencia.
   * @return {Promise<object>} La evidencia creada.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const evidenciaData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(evidenciaData);
    return {id: docRef.id, ...evidenciaData};
  }

  /**
   * Actualiza una evidencia existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} La evidencia actualizada.
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

module.exports = new EvidenciaRepository();
