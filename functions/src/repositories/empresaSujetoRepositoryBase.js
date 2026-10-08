const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();

/**
 * Acceso a datos compartido por empresaPersonas y empresaRecursos: la
 * relación de una Persona o un Recurso con una Empresa (única fuente de
 * verdad de "empresa actual"). Sin mandanteId. Una sola relación activa
 * por sujeto; terminar fija fechaTermino y estado (sin borrado físico).
 */
class EmpresaSujetoRepository {
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
   * Documentos de un snapshot, más recientes primero (por fechaInicio).
   * @param {FirebaseFirestore.QuerySnapshot} snapshot Resultado.
   * @return {Object[]} Documentos.
   */
  _docs(snapshot) {
    const millis = (v) => (v?.toMillis ?
      v.toMillis() : new Date(v || 0).getTime());
    return snapshot.docs
        .map((d) => ({id: d.id, ...d.data()}))
        .sort((a, b) => millis(b.fechaInicio) - millis(a.fechaInicio));
  }

  /**
   * Obtiene una relación por ID.
   * @param {string} id ID del documento.
   * @return {Promise<?Object>} La relación o null.
   */
  async getById(id) {
    const doc = await this.coleccion().doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Relación ACTIVA de un sujeto, o null.
   * @param {string} sujetoId personaId o recursoId.
   * @return {Promise<?Object>} Relación activa.
   */
  async getActivaBySujeto(sujetoId) {
    const snap = await this.queryActivaSujeto(sujetoId).get();
    return snap.empty ? null : {id: snap.docs[0].id, ...snap.docs[0].data()};
  }

  /**
   * Consulta (para transacciones) de la relación activa de un sujeto.
   * @param {string} sujetoId personaId o recursoId.
   * @return {FirebaseFirestore.Query} Consulta.
   */
  queryActivaSujeto(sujetoId) {
    return this.coleccion()
        .where(this.campoSujeto, "==", sujetoId)
        .where("estado", "==", "activa")
        .limit(1);
  }

  /**
   * Todas las relaciones de un sujeto (historial).
   * @param {string} sujetoId personaId o recursoId.
   * @return {Promise<Object[]>} Relaciones, más recientes primero.
   */
  async listBySujeto(sujetoId) {
    return this._docs(await this.coleccion()
        .where(this.campoSujeto, "==", sujetoId).get());
  }

  /**
   * Relaciones de un conjunto de Empresas (lotes de 30, límite de "in").
   * @param {string[]} empresaIds IDs de Empresas.
   * @param {{estado: (string|undefined)}} [filtros] Estado opcional.
   * @return {Promise<Object[]>} Relaciones.
   */
  async listByEmpresas(empresaIds, {estado} = {}) {
    const ids = [...new Set(empresaIds.filter(Boolean))];
    const resultado = [];
    for (let i = 0; i < ids.length; i += 30) {
      let query = this.coleccion()
          .where("empresaId", "in", ids.slice(i, i + 30));
      if (estado) query = query.where("estado", "==", estado);
      // eslint-disable-next-line no-await-in-loop
      resultado.push(...this._docs(await query.get()));
    }
    return resultado;
  }

  /**
   * Relaciones ACTIVAS de todo el sistema (para derivar "empresa actual"
   * en listados sin una consulta por fila).
   * @return {Promise<Object[]>} Relaciones activas.
   */
  async listActivas() {
    return this._docs(await this.coleccion()
        .where("estado", "==", "activa").get());
  }

  /**
   * Relaciones ACTIVAS de una Empresa.
   * @param {string} empresaId ID de la Empresa.
   * @return {Promise<Object[]>} Relaciones activas.
   */
  async listActivasByEmpresa(empresaId) {
    return this._docs(await this.coleccion()
        .where("empresaId", "==", empresaId)
        .where("estado", "==", "activa").get());
  }

  /**
   * Datos de alta con timestamps de servidor.
   * @param {Object} data Datos.
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
   * Actualiza una relación.
   * @param {string} id ID del documento.
   * @param {Object} data Campos a actualizar.
   * @return {Promise<?Object>} La relación actualizada.
   */
  async update(id, data) {
    const updateData = {...data, updatedAt: FieldValue.serverTimestamp()};
    delete updateData.createdAt;
    delete updateData.id;
    await this.coleccion().doc(id).update(updateData);
    return this.getById(id);
  }
}

module.exports = EmpresaSujetoRepository;
