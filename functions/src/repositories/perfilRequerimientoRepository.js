const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "perfilRequerimientos";

/**
 * Acceso a datos de Firestore para el recurso Perfil-Requerimiento (vincula
 * un Perfil de Participación con un Requerimiento, para todos los Perfiles
 * de Recurso del tipo — `perfilRecursoId` null — o para uno puntual).
 */
class PerfilRequerimientoRepository {
  /**
   * Busca el vínculo de una combinación exacta (perfilParticipacionId,
   * requerimientoId, perfilRecursoId), sin importar su estado — para
   * reactivar en vez de duplicar. Igualdad pura (incluye `== null`).
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @param {string} requerimientoId ID del Requerimiento.
   * @param {?string} perfilRecursoId ID del Perfil de Recurso, o null.
   * @return {Promise<object|null>} El vínculo o null si no existe.
   */
  async getByCombinacion(perfilParticipacionId, requerimientoId,
      perfilRecursoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("perfilParticipacionId", "==", perfilParticipacionId)
        .where("requerimientoId", "==", requerimientoId)
        .where("perfilRecursoId", "==", perfilRecursoId ?? null)
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Todos los vínculos (cualquier estado) de un par Perfil de Participación
   * + Requerimiento: uno por Perfil de Recurso, o el de "Todos".
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @param {string} requerimientoId ID del Requerimiento.
   * @return {Promise<object[]>} Vínculos.
   */
  async getByPerfilYRequerimiento(perfilParticipacionId, requerimientoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("perfilParticipacionId", "==", perfilParticipacionId)
        .where("requerimientoId", "==", requerimientoId)
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Vínculos ACTIVOS de un Requerimiento (en cualquier Mandante).
   * @param {string} requerimientoId ID del Requerimiento.
   * @return {Promise<object[]>} Vínculos activos.
   */
  async getActivosByRequerimiento(requerimientoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("requerimientoId", "==", requerimientoId)
        .where("estado", "==", "activo")
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Aplica en un solo batch atómico altas y actualizaciones de vínculos.
   * @param {{crear: Object[], actualizar: {id: string, data: Object}[]}}
   *     cambios Documentos a crear y actualizaciones por ID.
   * @return {Promise<string[]>} IDs de los vínculos creados.
   */
  async aplicarCambios({crear = [], actualizar = []}) {
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    const creados = crear.map((data) => {
      const ref = db.collection(COLLECTION).doc();
      batch.set(ref, {...data, createdAt: now, updatedAt: now});
      return ref.id;
    });
    actualizar.forEach(({id, data}) => {
      batch.update(
          db.collection(COLLECTION).doc(id), {...data, updatedAt: now},
      );
    });
    if (crear.length || actualizar.length) await batch.commit();
    return creados;
  }

  /**
   * Escribe altas y actualizaciones de vínculos DENTRO de una transacción
   * ajena (el guardado atómico de un Requerimiento con su aplicabilidad).
   * @param {FirebaseFirestore.Transaction} tx Transacción en curso.
   * @param {{crear: Object[], actualizar: {id: string, data: Object}[]}}
   *     cambios Documentos a crear y actualizaciones por ID.
   * @return {void}
   */
  escribirCambiosEn(tx, {crear = [], actualizar = []}) {
    const now = FieldValue.serverTimestamp();
    crear.forEach((data) => {
      tx.set(
          db.collection(COLLECTION).doc(),
          {...data, createdAt: now, updatedAt: now},
      );
    });
    actualizar.forEach(({id, data}) => {
      tx.update(
          db.collection(COLLECTION).doc(id), {...data, updatedAt: now},
      );
    });
  }
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
   * Lista los vínculos activos de un Perfil de Participación. Usado por la
   * "matriz" de configuración; sin orderBy a propósito (no requiere
   * índice compuesto).
   * @param {string} perfilParticipacionId ID del Perfil de Participación.
   * @return {Promise<object[]>} Lista de vínculos activos.
   */
  async getActivosByPerfil(perfilParticipacionId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("perfilParticipacionId", "==", perfilParticipacionId)
        .where("estado", "==", "activo")
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Vínculos ACTIVOS (opcionalmente de un Mandante), solo con los campos
   * necesarios para contar Requerimientos por Perfil de Recurso. Igualdad
   * pura, sin orderBy y con proyección: no requiere índice compuesto ni
   * carga documentos enteros.
   * @param {{mandanteId: ?string}} filtros Filtros opcionales.
   * @return {Promise<object[]>} Vínculos {id, perfilParticipacionId,
   *     requerimientoId, perfilRecursoId, tipoEntidad}.
   */
  async listActivosParaConteo({mandanteId} = {}) {
    let query = db.collection(COLLECTION).where("estado", "==", "activo");
    if (mandanteId) query = query.where("mandanteId", "==", mandanteId);
    const snapshot = await query
        .select(
            "perfilParticipacionId", "requerimientoId", "perfilRecursoId",
            "tipoEntidad",
        )
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Lista vínculos, opcionalmente filtrados por mandante, perfil y/o
   * estado.
   * @param {{mandanteId: (string|undefined),
   *     perfilParticipacionId: (string|undefined),
   *     estado: (string|undefined)}} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de vínculos.
   */
  async list({mandanteId, perfilParticipacionId, estado} = {}) {
    let query = db.collection(COLLECTION);

    if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
    }
    if (perfilParticipacionId) {
      query = query.where("perfilParticipacionId", "==", perfilParticipacionId);
    }
    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
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

  /**
   * Actualiza el campo "orden" de varios vínculos en una sola operación
   * atómica.
   * @param {{id: string, orden: number}[]} items Vínculos a actualizar.
   * @return {Promise<void>}
   */
  async batchUpdateOrden(items) {
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    items.forEach(({id, orden}) => {
      const docRef = db.collection(COLLECTION).doc(id);
      batch.update(docRef, {orden, updatedAt: now});
    });

    await batch.commit();
  }
}

module.exports = new PerfilRequerimientoRepository();
