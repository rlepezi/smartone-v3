const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "relacionesLaborales";

/**
 * Acceso a datos de Firestore para el recurso RelaciónLaboral (vincula
 * una Persona con una Empresa — entidad 17, ver decisions.md).
 */
class RelacionLaboralRepository {
  /**
   * Obtiene una relación laboral por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} La relación o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Obtiene la relación laboral ACTIVA de una Persona, si tiene una (RN-041b:
   * a lo sumo una). Una sola igualdad + estado, sin orderBy: no requiere
   * índice compuesto.
   * @param {string} personaId ID de la Persona.
   * @return {Promise<object|null>} La relación activa o null.
   */
  async getActivaByPersona(personaId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("personaId", "==", personaId)
        .where("estado", "==", "activa")
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista todas las relaciones laborales de una Persona (cualquier
   * estado — para el historial completo). Sin orderBy: no requiere
   * índice compuesto, el orden por fecha se resuelve en el service/cliente.
   * @param {string} personaId ID de la Persona.
   * @return {Promise<object[]>} Lista de relaciones laborales.
   */
  async listByPersona(personaId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("personaId", "==", personaId)
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea una nueva relación laboral.
   * @param {object} data Datos de la relación laboral.
   * @return {Promise<object>} La relación laboral creada.
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

module.exports = new RelacionLaboralRepository();
module.exports.COLLECTION = COLLECTION;
