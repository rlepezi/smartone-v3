const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * Acceso a datos compartido por participacionPersonas y
 * participacionRecursos: un documento por cada (Participación, sujeto,
 * Perfil de Recurso). `campoSujeto` es "personaId" o "recursoId". Todas las
 * consultas son de igualdad pura; el orden se resuelve en memoria.
 */
class ParticipacionSujetoRepository {
  /**
   * @param {string} coleccion Nombre de la colección.
   * @param {string} campoSujeto "personaId" | "recursoId".
   */
  constructor(coleccion, campoSujeto) {
    this.COLLECTION = coleccion;
    this.campoSujeto = campoSujeto;
  }

  /**
   * Referencia a la colección.
   * @return {FirebaseFirestore.CollectionReference} Colección.
   */
  coleccion() {
    return db.collection(this.COLLECTION);
  }

  /**
   * Ordena por createdAt descendente.
   * @param {Object[]} docs Documentos.
   * @return {Object[]} Documentos ordenados.
   */
  _ordenar(docs) {
    return docs.sort((a, b) =>
      (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  }

  /**
   * Convierte un snapshot de consulta en documentos.
   * @param {FirebaseFirestore.QuerySnapshot} snapshot Resultado.
   * @return {Object[]} Documentos.
   */
  _docs(snapshot) {
    return this._ordenar(
        snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})),
    );
  }

  /**
   * Obtiene un documento por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} El documento o null.
   */
  async getById(id) {
    const doc = await this.coleccion().doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Lista documentos con filtros de igualdad opcionales.
   * @param {Object} filtros mandanteId, proyectoId, participacionId,
   *     empresaId, personaId/recursoId, perfilRecursoId, estado.
   * @return {Promise<Object[]>} Documentos, más reciente primero.
   */
  async list(filtros = {}) {
    let query = this.coleccion();
    const campos = [
      "mandanteId", "proyectoId", "participacionId", "empresaId",
      this.campoSujeto, "perfilRecursoId", "estado",
    ];
    campos.forEach((campo) => {
      if (filtros[campo]) query = query.where(campo, "==", filtros[campo]);
    });
    return this._docs(await query.get());
  }

  /**
   * Documentos activos de un sujeto (en cualquier Proyecto).
   * @param {string} sujetoId personaId o recursoId.
   * @return {Promise<Object[]>} Documentos activos.
   */
  getActivosBySujeto(sujetoId) {
    return this.list({[this.campoSujeto]: sujetoId, estado: "activa"});
  }

  /**
   * Documentos activos de un Proyecto.
   * @param {string} proyectoId ID del Proyecto.
   * @return {Promise<Object[]>} Documentos activos.
   */
  getActivosByProyecto(proyectoId) {
    return this.list({proyectoId, estado: "activa"});
  }

  /**
   * Documentos activos (opcionalmente de un Mandante), solo con los campos
   * necesarios para contar sujetos por Participación.
   * @param {{mandanteId: ?string}} filtros Filtros opcionales.
   * @return {Promise<Object[]>} Documentos proyectados.
   */
  async listActivosParaConteo({mandanteId} = {}) {
    let query = this.coleccion().where("estado", "==", "activa");
    if (mandanteId) query = query.where("mandanteId", "==", mandanteId);
    const snapshot = await query
        .select(this.campoSujeto, "participacionId").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Consulta (para usar dentro de una transacción) de los documentos
   * activos de un sujeto en un Proyecto.
   * @param {string} sujetoId personaId o recursoId.
   * @param {string} proyectoId ID del Proyecto.
   * @return {FirebaseFirestore.Query} Consulta.
   */
  queryActivosSujetoProyecto(sujetoId, proyectoId) {
    return this.coleccion()
        .where(this.campoSujeto, "==", sujetoId)
        .where("proyectoId", "==", proyectoId)
        .where("estado", "==", "activa");
  }

  /**
   * Consulta (para transacciones) de los documentos activos de un sujeto.
   * @param {string} sujetoId personaId o recursoId.
   * @return {FirebaseFirestore.Query} Consulta.
   */
  queryActivosSujeto(sujetoId) {
    return this.coleccion()
        .where(this.campoSujeto, "==", sujetoId)
        .where("estado", "==", "activa");
  }

  /**
   * Datos de alta con timestamps de servidor.
   * @param {Object} data Datos del documento.
   * @return {Object} Datos listos para escribir.
   */
  datosAlta(data) {
    return {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  /**
   * Actualiza un documento.
   * @param {string} id ID del documento.
   * @param {Object} data Campos a actualizar.
   * @return {Promise<?Object>} El documento actualizado.
   */
  async update(id, data) {
    const updateData = {...data, updatedAt: FieldValue.serverTimestamp()};
    delete updateData.createdAt;
    delete updateData.id;
    await this.coleccion().doc(id).update(updateData);
    return this.getById(id);
  }
}

module.exports = ParticipacionSujetoRepository;
