const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "empresaMandantes";

/**
 * empresaMandantes: el Mandante puede ver y usar la Empresa (no es
 * pertenencia). Un único documento por pareja: su ID es determinístico
 * (`${empresaId}_${mandanteId}`), así asociar dos veces no duplica y
 * desasociar lo deja inactivo.
 */
class EmpresaMandanteRepository {
  /**
   * ID determinístico de la pareja.
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @return {string} ID del documento.
   */
  idDe(empresaId, mandanteId) {
    return `${empresaId}_${mandanteId}`;
  }

  /**
   * Referencia del documento de una pareja.
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @return {FirebaseFirestore.DocumentReference} Referencia.
   */
  ref(empresaId, mandanteId) {
    return db.collection(COLLECTION).doc(this.idDe(empresaId, mandanteId));
  }

  /**
   * Documento de una pareja, o null.
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @return {Promise<?Object>} El vínculo.
   */
  async get(empresaId, mandanteId) {
    const doc = await this.ref(empresaId, mandanteId).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * true si la pareja está asociada y activa.
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @return {Promise<boolean>} Asociación activa.
   */
  async estaActiva(empresaId, mandanteId) {
    const v = await this.get(empresaId, mandanteId);
    return v?.estado === "activo";
  }

  /**
   * Vínculos de una Empresa (cualquier estado si no se indica).
   * @param {string} empresaId ID de la Empresa.
   * @param {?string} [estado] Estado.
   * @return {Promise<Object[]>} Vínculos.
   */
  async listByEmpresa(empresaId, estado = null) {
    let q = db.collection(COLLECTION).where("empresaId", "==", empresaId);
    if (estado) q = q.where("estado", "==", estado);
    return (await q.get()).docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * IDs de Empresas con vínculo ACTIVO con un Mandante.
   * @param {string} mandanteId ID del Mandante.
   * @return {Promise<string[]>} IDs de Empresas.
   */
  async empresaIdsActivas(mandanteId) {
    const snap = await db.collection(COLLECTION)
        .where("mandanteId", "==", mandanteId)
        .where("estado", "==", "activo")
        .select("empresaId").get();
    return snap.docs.map((d) => d.data().empresaId);
  }

  /**
   * Todos los vínculos ACTIVOS, como pares {empresaId, mandanteId} (listado
   * de Empresas). Una sola igualdad: no requiere índice compuesto.
   * @return {Promise<Array<{empresaId: string, mandanteId: string}>>} Pares.
   */
  async listActivos() {
    const snap = await db.collection(COLLECTION)
        .where("estado", "==", "activo")
        .select("empresaId", "mandanteId").get();
    return snap.docs.map((d) => d.data());
  }

  /**
   * Datos para dejar el vínculo ACTIVO (alta o reactivación).
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @param {boolean} existe true si el documento ya existía.
   * @return {Object} Datos a escribir con set(..., {merge: true}).
   */
  datosActivo(empresaId, mandanteId, existe) {
    return {
      empresaId,
      mandanteId,
      estado: "activo",
      updatedAt: FieldValue.serverTimestamp(),
      ...(existe ? {} : {createdAt: FieldValue.serverTimestamp()}),
    };
  }

  /**
   * Asocia (o reactiva) la pareja.
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @return {Promise<Object>} El vínculo.
   */
  async activar(empresaId, mandanteId) {
    const existente = await this.get(empresaId, mandanteId);
    await this.ref(empresaId, mandanteId).set(
        this.datosActivo(empresaId, mandanteId, Boolean(existente)),
        {merge: true},
    );
    return this.get(empresaId, mandanteId);
  }

  /**
   * Deja la pareja inactiva (sin borrado físico).
   * @param {string} empresaId ID de la Empresa.
   * @param {string} mandanteId ID del Mandante.
   * @return {Promise<Object>} El vínculo.
   */
  async desactivar(empresaId, mandanteId) {
    await this.ref(empresaId, mandanteId).update({
      estado: "inactivo", updatedAt: FieldValue.serverTimestamp(),
    });
    return this.get(empresaId, mandanteId);
  }
}

module.exports = new EmpresaMandanteRepository();
module.exports.COLLECTION = COLLECTION;
