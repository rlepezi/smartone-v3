const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "evidenciaRequerimientos";

/**
 * Acceso a datos de Firestore para el recurso Evidencia-Requerimiento
 * (vincula una Evidencia con un Requerimiento aplicable a su Expediente).
 * Tabla de vínculo puro: sus únicas consultas son de igualdad, sin
 * orderBy, por lo que no requiere ningún índice compuesto.
 */
class EvidenciaRequerimientoRepository {
  /**
   * Obtiene un vínculo por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El vínculo o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista los vínculos de una Evidencia (cualquier estado).
   * @param {string} evidenciaId ID de la Evidencia.
   * @return {Promise<object[]>} Vínculos.
   */
  async listByEvidencia(evidenciaId) {
    const snapshot = await db.collection(COLLECTION)
        .where("evidenciaId", "==", evidenciaId).get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Busca un vínculo existente para un par (evidenciaId, requerimientoId),
   * sin importar su estado.
   * @param {string} evidenciaId ID de la Evidencia.
   * @param {string} requerimientoId ID del Requerimiento.
   * @return {Promise<object|null>} El vínculo o null si no existe.
   */
  async getByEvidenciaYRequerimiento(evidenciaId, requerimientoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("evidenciaId", "==", evidenciaId)
        .where("requerimientoId", "==", requerimientoId)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista los vínculos activos de un Expediente. Usado por el detalle del
   * Expediente para armar el listado de Evidencias por Requerimiento.
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<object[]>} Lista de vínculos activos.
   */
  async getActivosByExpediente(expedienteId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("expedienteId", "==", expedienteId)
        .where("estado", "==", "activo")
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea un nuevo vínculo.
   * @param {object} data Datos del vínculo.
   * @return {Promise<object>} El vínculo creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const vinculoData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(vinculoData);
    return {id: docRef.id, ...vinculoData};
  }

  /**
   * Actualiza un vínculo existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El vínculo actualizado.
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

module.exports = new EvidenciaRequerimientoRepository();
