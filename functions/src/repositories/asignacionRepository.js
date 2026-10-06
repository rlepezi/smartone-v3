const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "asignaciones";

/**
 * Acceso a datos de Firestore para el recurso Asignación: vincula una
 * Persona o un Recurso (maquinaria/vehículo) a un Proyecto, a través de la
 * Empresa que los aporta.
 */
class AsignacionRepository {
  /**
   * Ordena un arreglo de documentos por createdAt descendente. Se usa en
   * lugar de `.orderBy()` de Firestore para los filtros por clave foránea,
   * de modo que las consultas de igualdad pura no requieran índices
   * compuestos adicionales a los ya declarados (que cubren únicamente las
   * búsquedas de existencia de RN-064 y el conteo por proyecto).
   * @param {object[]} docs Documentos a ordenar.
   * @return {object[]} Documentos ordenados, más reciente primero.
   */
  _ordenarPorCreatedAtDesc(docs) {
    return docs.sort((a, b) => {
      const millisA = a.createdAt?.toMillis?.() || 0;
      const millisB = b.createdAt?.toMillis?.() || 0;
      return millisB - millisA;
    });
  }

  /**
   * Obtiene una asignación por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} La asignación o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca una asignación activa para una Persona dentro de un Proyecto.
   * Usado para RN-064: una Persona no puede tener dos asignaciones activas
   * simultáneas en el mismo Proyecto.
   * @param {string} personaId ID de la Persona.
   * @param {string} proyectoId ID del Proyecto.
   * @return {Promise<object|null>} La asignación activa o null.
   */
  async getActivaByPersonaYProyecto(personaId, proyectoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("personaId", "==", personaId)
        .where("proyectoId", "==", proyectoId)
        .where("estado", "==", "activa")
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Busca una asignación activa para un Recurso dentro de un Proyecto.
   * Usado para RN-064: un Recurso no puede tener dos asignaciones activas
   * simultáneas en el mismo Proyecto.
   * @param {string} recursoId ID del Recurso.
   * @param {string} proyectoId ID del Proyecto.
   * @return {Promise<object|null>} La asignación activa o null.
   */
  async getActivaByRecursoYProyecto(recursoId, proyectoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("recursoId", "==", recursoId)
        .where("proyectoId", "==", proyectoId)
        .where("estado", "==", "activa")
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista las asignaciones activas de una Persona, en cualquier Proyecto.
   * Usado para mostrar el "Rol Actual" en PersonasListPage sin duplicar el
   * campo rol en el catálogo de Persona (RN-044: el rol pertenece a la
   * Asignación).
   * @param {string} personaId ID de la Persona.
   * @return {Promise<object[]>} Lista de asignaciones activas.
   */
  async getActivasByPersona(personaId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("personaId", "==", personaId)
        .where("estado", "==", "activa")
        .get();

    const resultados = snapshot.docs.map(
        (doc) => ({id: doc.id, ...doc.data()}),
    );
    return this._ordenarPorCreatedAtDesc(resultados);
  }

  /**
   * Lista las asignaciones activas de un Recurso, en cualquier Proyecto.
   * Análogo a `getActivasByPersona` pero para maquinaria/vehículos —
   * usado por acreditacionService para ubicar la asignación "actual" a
   * cerrar al reemplazar una acreditación.
   * @param {string} recursoId ID del Recurso.
   * @return {Promise<object[]>} Lista de asignaciones activas.
   */
  async getActivasByRecurso(recursoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("recursoId", "==", recursoId)
        .where("estado", "==", "activa")
        .get();

    const resultados = snapshot.docs.map(
        (doc) => ({id: doc.id, ...doc.data()}),
    );
    return this._ordenarPorCreatedAtDesc(resultados);
  }

  /**
   * Lista las asignaciones activas de un Proyecto. Usado tanto para el
   * resumen de contadores del Proyecto como para la lista de "Recursos
   * Asignados" en su vista de detalle.
   * @param {string} proyectoId ID del Proyecto.
   * @return {Promise<object[]>} Lista de asignaciones activas.
   */
  async getActivasByProyecto(proyectoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("proyectoId", "==", proyectoId)
        .where("estado", "==", "activa")
        .get();

    const resultados = snapshot.docs.map(
        (doc) => ({id: doc.id, ...doc.data()}),
    );
    return this._ordenarPorCreatedAtDesc(resultados);
  }

  /**
   * Asignaciones ACTIVAS (opcionalmente de un Mandante), solo con los
   * campos necesarios para contar Personas/Maquinarias por Expediente.
   * Igualdad pura, sin orderBy y con proyección: no requiere índice
   * compuesto ni carga documentos enteros.
   * @param {{mandanteId: ?string}} filtros Filtros opcionales.
   * @return {Promise<object[]>} Asignaciones {id, personaId, recursoId,
   *     participacionId, proyectoId, empresaId}.
   */
  async listActivasParaConteo({mandanteId} = {}) {
    let query = db.collection(COLLECTION).where("estado", "==", "activa");
    if (mandanteId) query = query.where("mandanteId", "==", mandanteId);
    const snapshot = await query
        .select(
            "personaId", "recursoId", "participacionId", "proyectoId",
            "empresaId",
        )
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Lista asignaciones, opcionalmente filtradas. Todos los filtros se
   * aplican como cláusulas de igualdad pura (sin `.orderBy()` de
   * Firestore, que exigiría índices compuestos adicionales a los ya
   * declarados) y el resultado se ordena en memoria por createdAt
   * descendente.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined),
   *     proyectoId: (string|undefined), personaId: (string|undefined),
   *     recursoId: (string|undefined)}} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de asignaciones.
   */
  async list({
    mandanteId, estado, proyectoId, personaId, recursoId, empresaId,
  } = {}) {
    let query = db.collection(COLLECTION);

    if (mandanteId) query = query.where("mandanteId", "==", mandanteId);
    if (proyectoId) query = query.where("proyectoId", "==", proyectoId);
    if (personaId) query = query.where("personaId", "==", personaId);
    if (recursoId) query = query.where("recursoId", "==", recursoId);
    if (empresaId) query = query.where("empresaId", "==", empresaId);
    if (estado) query = query.where("estado", "==", estado);

    const snapshot = await query.get();
    const resultados = snapshot.docs.map(
        (doc) => ({id: doc.id, ...doc.data()}),
    );
    return this._ordenarPorCreatedAtDesc(resultados);
  }

  /**
   * Crea una nueva asignación.
   * @param {object} data Datos de la asignación.
   * @return {Promise<object>} La asignación creada.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const asignacionData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(asignacionData);
    return {id: docRef.id, ...asignacionData};
  }

  /**
   * Actualiza una asignación existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} La asignación actualizada.
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

module.exports = new AsignacionRepository();
module.exports.COLLECTION = COLLECTION;
