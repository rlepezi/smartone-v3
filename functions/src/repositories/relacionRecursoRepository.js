const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "relacionesRecurso";

/**
 * Acceso a datos de Firestore para el recurso RelaciónRecurso (vincula
 * un Recurso/Maquinaria con una Empresa — entidad 19, ver decisions.md).
 * Calca exactamente la estructura de relacionLaboralRepository.js.
 */
class RelacionRecursoRepository {
  /**
   * Obtiene una relación de recurso por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} La relación o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Obtiene la relación ACTIVA de un Recurso, si tiene una (RN-122: a lo
   * sumo una). Una sola igualdad + estado, sin orderBy: no requiere
   * índice compuesto.
   * @param {string} recursoId ID del Recurso.
   * @return {Promise<object|null>} La relación activa o null.
   */
  async getActivaByRecurso(recursoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("recursoId", "==", recursoId)
        .where("estado", "==", "activa")
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista todas las relaciones de un Recurso (cualquier estado — para el
   * historial completo). Sin orderBy: no requiere índice compuesto, el
   * orden por fecha se resuelve en el service/cliente.
   * @param {string} recursoId ID del Recurso.
   * @return {Promise<object[]>} Lista de relaciones.
   */
  async listByRecurso(recursoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("recursoId", "==", recursoId)
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea una nueva relación de recurso.
   * @param {object} data Datos de la relación.
   * @return {Promise<object>} La relación creada.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const relacionData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(relacionData);
    return {id: docRef.id, ...relacionData};
  }
}

module.exports = new RelacionRecursoRepository();
module.exports.COLLECTION = COLLECTION;
