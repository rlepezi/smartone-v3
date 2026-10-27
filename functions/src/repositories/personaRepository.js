const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "personas";

/**
 * Acceso a datos de Firestore para el recurso Persona.
 * Catálogo global, sin aislamiento por Mandante.
 */
class PersonaRepository {
  /**
   * Obtiene una persona por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} La persona o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Obtiene varios personas por ID en lecturas por lote (db.getAll), sin
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
   * Busca una persona por su RUT normalizado.
   * @param {string} rutNormalizado RUT ya normalizado.
   * @return {Promise<object|null>} La persona o null si no existe.
   */
  async getByRut(rutNormalizado) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("rut", "==", rutNormalizado)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista personas, opcionalmente filtradas por estado y/o empresa.
   * La pertenencia a una Empresa vive en la relación (empresaPersonas /
   * empresaRecursos): se filtra en el servicio, no aquí.
   * @param {{estado: (string|undefined)}} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de personas.
   */
  async list({estado} = {}) {
    let query = db.collection(COLLECTION);

    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Crea una nueva persona.
   * @param {object} data Datos de la persona.
   * @return {Promise<object>} La persona creada.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const personaData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(personaData);
    return {id: docRef.id, ...personaData};
  }

  /**
   * Actualiza una persona existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} La persona actualizada.
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
   * Actualiza únicamente el estado de una persona.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} La persona actualizada.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new PersonaRepository();
// Expuesto para personaService: la creación de Persona ahora corre dentro
// de una transacción junto con el índice de unicidad de identificación
// (personasIdentificacion) — mismo patrón que relacionLaboralRepository.
module.exports.COLLECTION = COLLECTION;
