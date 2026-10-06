const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "perfilesRecurso";

/**
 * Acceso a datos de Firestore para el recurso Perfil de Recurso: catálogo
 * configurable por Mandante que unifica el Rol de Persona y la
 * Clasificación de Maquinaria (distinguidos por `tipo`).
 */
class PerfilRecursoRepository {
  /**
   * Obtiene un perfil de recurso por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El perfil o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca un perfil por su nombre, dentro de un mandante y un
   * tipo (cualquier estado — usado para el chequeo de
   * duplicados al crear/renombrar).
   * @param {string} mandanteId ID del Mandante.
   * @param {string} tipo "persona" | "recurso".
   * @param {string} nombre Nombre del perfil.
   * @return {Promise<object|null>} El perfil o null si no existe.
   */
  async getByNombre(mandanteId, tipo, nombre) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("mandanteId", "==", mandanteId)
        .where("tipo", "==", tipo)
        .where("nombre", "==", nombre)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca un perfil ACTIVO por su nombre, dentro de un mandante y un
   * tipo. Usado para validar el rol de una Persona o la
   * clasificación de un Recurso al crear una Asignación. Consulta de
   * pura igualdad (sin orderBy): no requiere índice compuesto.
   * @param {string} mandanteId ID del Mandante.
   * @param {string} tipo "persona" | "recurso".
   * @param {string} nombre Nombre del perfil.
   * @return {Promise<object|null>} El perfil activo o null si no existe.
   */
  async getActivoByNombre(mandanteId, tipo, nombre) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("mandanteId", "==", mandanteId)
        .where("tipo", "==", tipo)
        .where("nombre", "==", nombre)
        .where("estado", "==", "activo")
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista perfiles de recurso, opcionalmente filtrados por mandante,
   * tipo y/o estado. Los tres filtros son independientes entre
   * sí (pueden combinarse libremente) — ver firestore.indexes.json para
   * la cobertura de índices compuestos de las 7 combinaciones posibles.
   * @param {{mandanteId: (string|undefined), tipo:
   *     (string|undefined), estado: (string|undefined)}} filtros Filtros
   *     de búsqueda.
   * @return {Promise<object[]>} Lista de perfiles.
   */
  async list({mandanteId, tipo, estado} = {}) {
    let query = db.collection(COLLECTION);

    if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
    }
    if (tipo) {
      query = query.where("tipo", "==", tipo);
    }
    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea un nuevo perfil de recurso.
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
   * Actualiza un perfil de recurso existente.
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
   * Actualiza únicamente el estado de un perfil de recurso.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El perfil actualizado.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new PerfilRecursoRepository();
