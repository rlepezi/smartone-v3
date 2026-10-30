const admin = require("firebase-admin");

const db = admin.firestore();
const COLLECTION = "expedienteRequerimientos";

/**
 * Acceso a datos de expedienteRequerimientos: cada Requerimiento concreto
 * (este Requerimiento, para este sujeto, en este Expediente). El ID es
 * determinístico (expediente + requerimiento + sujeto): garantiza una sola
 * instancia por combinación y hace idempotente la generación.
 */
class ExpedienteRequerimientoRepository {
  /**
   * ID determinístico de una instancia.
   * @param {string} expedienteId ID del Expediente.
   * @param {string} requerimientoId ID del Requerimiento.
   * @param {string} sujetoId empresaId, personaId o recursoId.
   * @return {string} ID del documento.
   */
  idPara(expedienteId, requerimientoId, sujetoId) {
    return `${expedienteId}_${requerimientoId}_${sujetoId}`;
  }

  /**
   * Referencia a un documento.
   * @param {string} id ID.
   * @return {FirebaseFirestore.DocumentReference} Referencia.
   */
  ref(id) {
    return db.collection(COLLECTION).doc(id);
  }

  /**
   * Convierte un snapshot en objeto plano (con la hora de actualización,
   * para escribir con precondición).
   * @param {FirebaseFirestore.DocumentSnapshot} doc Snapshot.
   * @return {Object} Instancia.
   */
  _aObjeto(doc) {
    return {id: doc.id, ...doc.data(), _updateTime: doc.updateTime};
  }

  /**
   * Obtiene una instancia por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Instancia o null.
   */
  async getById(id) {
    const doc = await this.ref(id).get();
    return doc.exists ? this._aObjeto(doc) : null;
  }

  /**
   * Query de las instancias de un Expediente (opcionalmente por estado).
   * @param {string} expedienteId ID del Expediente.
   * @param {?string} estado "activo" / "retirado" o null para todas.
   * @return {FirebaseFirestore.Query} Query.
   */
  queryPorExpediente(expedienteId, estado = null) {
    let q = db.collection(COLLECTION).where("expedienteId", "==", expedienteId);
    if (estado) q = q.where("estado", "==", estado);
    return q;
  }

  /**
   * Instancias de un Expediente.
   * @param {string} expedienteId ID del Expediente.
   * @param {?string} estado Estado o null para todas.
   * @return {Promise<Object[]>} Instancias.
   */
  async listByExpediente(expedienteId, estado = null) {
    const snap = await this.queryPorExpediente(expedienteId, estado).get();
    return snap.docs.map((d) => this._aObjeto(d));
  }

  /**
   * Instancias de un sujeto dentro de un Expediente.
   * @param {string} expedienteId ID del Expediente.
   * @param {{tipoEntidad: string, sujetoId: (string|undefined)}} sujeto
   *     "empresa" (sin id) o persona/recurso con su id.
   * @param {?string} estado Estado o null para todas.
   * @return {Promise<Object[]>} Instancias.
   */
  async listByExpedienteYSujeto(expedienteId, {tipoEntidad, sujetoId},
      estado = null) {
    let q = this.queryPorExpediente(expedienteId, estado);
    if (tipoEntidad === "persona") {
      q = q.where("personaId", "==", sujetoId);
    } else if (tipoEntidad === "recurso") {
      q = q.where("recursoId", "==", sujetoId);
    } else {
      q = q.where("tipoEntidad", "==", "empresa");
    }
    const snap = await q.get();
    return snap.docs.map((d) => this._aObjeto(d));
  }

  /**
   * Instancias de una Persona, un Recurso o una Empresa (nivel empresa) en
   * todos sus Expedientes, opcionalmente acotadas a un Mandante.
   * @param {{campo: string, valor: string, mandanteId: (string|undefined),
   *     estado: (string|undefined)}} filtros Filtros.
   * @return {Promise<Object[]>} Instancias.
   */
  async listBySujeto({campo, valor, mandanteId, estado}) {
    let q = db.collection(COLLECTION).where(campo, "==", valor);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    if (estado) q = q.where("estado", "==", estado);
    const snap = await q.get();
    return snap.docs.map((d) => this._aObjeto(d));
  }

  /**
   * Instancias de un Mandante (o de todos) con un resultado dado.
   * @param {{mandanteId: (string|undefined), resultado: string}} filtros
   *     Filtros.
   * @return {Promise<Object[]>} Instancias activas con ese resultado.
   */
  async listByResultado({mandanteId, resultado}) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    q = q.where("resultado", "==", resultado);
    const snap = await q.get();
    return snap.docs.map((d) => this._aObjeto(d))
        .filter((i) => i.estado === "activo");
  }

  /**
   * Instancias que cuentan para vencimientos (activas, "cumple", que piden
   * vencimiento) con fechaVencimiento en un rango, ordenadas por fecha.
   * Solo trae los campos que se usan para listar.
   * @param {{mandanteId: (string|undefined), desde: (Date|undefined),
   *     antesDe: (Date|undefined), hasta: (Date|undefined)}} filtros Rango:
   *     `desde` (>=), `antesDe` (<) y `hasta` (<=).
   * @return {Promise<Object[]>} Instancias.
   */
  async listVencimientos({mandanteId, desde, antesDe, hasta}) {
    let q = db.collection(COLLECTION)
        .where("estado", "==", "activo")
        .where("resultado", "==", "cumple")
        .where("requiereVencimiento", "==", true);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    if (desde) q = q.where("fechaVencimiento", ">=", desde);
    if (antesDe) q = q.where("fechaVencimiento", "<", antesDe);
    if (hasta) q = q.where("fechaVencimiento", "<=", hasta);
    const snap = await q.orderBy("fechaVencimiento", "asc")
        .select(
            "expedienteId", "requerimientoId", "nombre", "nombreCorto",
            "tipoEntidad", "empresaId", "personaId", "recursoId",
            "fechaVencimiento", "estado", "resultado", "requiereVencimiento",
        )
        .get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Instancias de un Mandante (o de todos) con fecha de vencimiento.
   * @param {{mandanteId: (string|undefined)}} filtros Filtros.
   * @return {Promise<Object[]>} Instancias activas con vencimiento.
   */
  async listConVencimiento({mandanteId}) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    q = q.where("fechaVencimiento", ">", new Date(0));
    const snap = await q.get();
    return snap.docs.map((d) => this._aObjeto(d))
        .filter((i) => i.estado === "activo");
  }
}

module.exports = new ExpedienteRequerimientoRepository();
module.exports.COLLECTION = COLLECTION;
