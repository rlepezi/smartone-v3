const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "requerimientos";

/**
 * Acceso a datos de Firestore para el recurso Requerimiento. Catálogo
 * global, sin aislamiento por Mandante.
 */
class RequerimientoRepository {
  /**
   * Obtiene un requerimiento por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El requerimiento o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca un requerimiento con el mismo nombre y tipo de entidad exactos
   * (para la validación de duplicado exacto).
   * @param {string} nombre Nombre del requerimiento.
   * @param {string} tipoEntidad "empresa" | "persona" | "recurso".
   * @return {Promise<object|null>} El requerimiento o null si no existe.
   */
  async getByNombreYTipo(nombre, tipoEntidad) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("nombre", "==", nombre)
        .where("tipoEntidad", "==", tipoEntidad)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista requerimientos, opcionalmente filtrados por estado y/o tipo de
   * entidad.
   * @param {{estado: (string|undefined),
   *     tipoEntidad: (string|undefined)}} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de requerimientos.
   */
  async list({estado, tipoEntidad} = {}) {
    let query = db.collection(COLLECTION);

    if (tipoEntidad) {
      query = query.where("tipoEntidad", "==", tipoEntidad);
    }
    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Requerimientos ACTIVOS, solo con su `tipoEntidad` (lo único que hace
   * falta para contar Requerimientos por Perfil de Recurso). Igualdad
   * pura, sin orderBy y con proyección: no requiere índice compuesto.
   * @return {Promise<object[]>} Requerimientos {id, tipoEntidad}.
   */
  async listActivosAplicacion() {
    const snapshot = await db.collection(COLLECTION)
        .where("estado", "==", "activo")
        .select("tipoEntidad")
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea un nuevo requerimiento.
   * @param {object} data Datos del requerimiento.
   * @return {Promise<object>} El requerimiento creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const requerimientoData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(requerimientoData);
    return {id: docRef.id, ...requerimientoData};
  }

  /**
   * Actualiza un requerimiento existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El requerimiento actualizado.
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
   * Actualiza únicamente el estado de un requerimiento.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El requerimiento actualizado.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new RequerimientoRepository();
