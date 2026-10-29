const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "carpetasEmpresa";
const COLECCION_EXPEDIENTES = "expedientes";

/**
 * Acceso a datos de las Carpetas de empresa: cada subcarpeta de la fuente
 * documental de un Mandante, que representa a una empresa en un proyecto,
 * con su mapeo documental.
 */
class CarpetaEmpresaRepository {
  /**
   * Carpeta por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Carpeta o null.
   */
  async getById(id) {
    if (!id) return null;
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Carpetas por filtros de igualdad.
   * @param {{mandanteId: ?string, fuenteId: ?string, empresaId: ?string,
   *     estado: ?string}} filtros Filtros.
   * @return {Promise<Object[]>} Carpetas.
   */
  async list({mandanteId = null, fuenteId = null, empresaId = null,
    estado = null} = {}) {
    let q = db.collection(COLLECTION);
    if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
    if (fuenteId) q = q.where("fuenteId", "==", fuenteId);
    if (empresaId) q = q.where("empresaId", "==", empresaId);
    if (estado) q = q.where("estado", "==", estado);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Carpetas activas de una fuente (para no cambiar la fuente con carpetas
   * en uso).
   * @param {string} fuenteId Fuente.
   * @return {Promise<number>} Cantidad.
   */
  async contarActivasDeFuente(fuenteId) {
    const snap = await db.collection(COLLECTION)
        .where("fuenteId", "==", fuenteId)
        .where("estado", "==", "activa").get();
    return snap.size;
  }

  /**
   * Actualiza una carpeta.
   * @param {string} id ID.
   * @param {Object} data Campos.
   * @return {Promise<Object>} Carpeta actualizada.
   */
  async update(id, data) {
    await db.collection(COLLECTION).doc(id).update({
      ...data, updatedAt: FieldValue.serverTimestamp(),
    });
    return this.getById(id);
  }

  /**
   * Find-or-create de la carpeta y vínculo con el expediente, en UNA
   * transacción: lee la carpeta (por su ID determinístico), el expediente,
   * el expediente que hoy la usa y la carpeta que el expediente tenía;
   * `validar` decide (lanza para rechazar); luego crea o reactiva la
   * carpeta, la vincula, desvincula la anterior y apunta el expediente.
   * @param {Object} entrada Datos.
   * @param {string} entrada.id ID (idCarpeta).
   * @param {Object} entrada.nueva Campos de la carpeta si hay que crearla.
   * @param {string} entrada.expedienteId Expediente.
   * @param {Object} entrada.autor {uid, nombre}.
   * @param {Function} entrada.validar async ({actual, expediente,
   *     otroExpediente}) => void.
   * @return {Promise<{carpeta: Object, creada: boolean,
   *     anteriorId: ?string}>} Resultado.
   */
  async vincular({id, nueva, expedienteId, autor, validar}) {
    const ref = db.collection(COLLECTION).doc(id);
    const refExp = db.collection(COLECCION_EXPEDIENTES).doc(expedienteId);
    const r = await db.runTransaction(async (tx) => {
      const [doc, docExp] = await Promise.all([tx.get(ref), tx.get(refExp)]);
      if (!docExp.exists) throw new Error("EXPEDIENTE_NO_EXISTE");
      const actual = doc.exists ? {id: doc.id, ...doc.data()} : null;
      const expediente = {id: docExp.id, ...docExp.data()};
      const otroId = actual?.expedienteId &&
          actual.expedienteId !== expedienteId ? actual.expedienteId : null;
      const anteriorId = expediente.repositorioDocumental?.carpetaEmpresaId ||
          null;
      const refAnterior = anteriorId && anteriorId !== id ?
        db.collection(COLLECTION).doc(anteriorId) : null;
      const [docOtro, docAnterior] = await Promise.all([
        otroId ? tx.get(db.collection(COLECCION_EXPEDIENTES).doc(otroId)) :
          null,
        refAnterior ? tx.get(refAnterior) : null,
      ]);
      await validar({actual, expediente,
        otroExpediente: docOtro?.exists ? {id: docOtro.id, ...docOtro.data()} :
          null});
      const ahora = FieldValue.serverTimestamp();
      if (actual) {
        // Registrada sin proyecto (Mapeo documental): toma el del expediente.
        tx.update(ref, {expedienteId, estado: "activa", updatedAt: ahora,
          updatedBy: autor,
          ...(actual.proyectoId ? {} : {proyectoId: expediente.proyectoId})});
      } else {
        tx.set(ref, {...nueva, expedienteId, estado: "activa",
          createdAt: ahora, createdBy: autor, updatedAt: ahora,
          updatedBy: autor});
      }
      // La carpeta que el expediente tenía queda libre (con su mapeo).
      if (docAnterior?.exists &&
          docAnterior.data().expedienteId === expedienteId) {
        tx.update(refAnterior, {expedienteId: null, updatedAt: ahora,
          updatedBy: autor});
      }
      tx.update(refExp, {
        "repositorioDocumental.carpetaEmpresaId": id, "updatedAt": ahora,
      });
      return {creada: !actual,
        anteriorId: refAnterior && docAnterior?.exists ? anteriorId : null};
    });
    return {...r, carpeta: await this.getById(id)};
  }

  /**
   * Crea la carpeta con ese ID si no existe (find-or-create en una
   * transacción, sin duplicados).
   * @param {string} id ID (idCarpeta).
   * @param {Object} data Campos.
   * @return {Promise<{carpeta: Object, creada: boolean}>} Resultado.
   */
  async crear(id, data) {
    const ref = db.collection(COLLECTION).doc(id);
    const creada = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (doc.exists) return false;
      const ahora = FieldValue.serverTimestamp();
      tx.create(ref, {...data, createdAt: ahora, updatedAt: ahora});
      return true;
    });
    return {carpeta: await this.getById(id), creada};
  }

  /**
   * Desvincula la carpeta del expediente en una transacción: la carpeta
   * queda libre (expedienteId null, conserva su mapeo y su estado) y el
   * expediente sin carpetaEmpresaId.
   * @param {string} expedienteId Expediente.
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<?string>} ID de la carpeta que tenía, o null.
   */
  async desvincular(expedienteId, autor) {
    const refExp = db.collection(COLECCION_EXPEDIENTES).doc(expedienteId);
    return db.runTransaction(async (tx) => {
      const docExp = await tx.get(refExp);
      if (!docExp.exists) throw new Error("EXPEDIENTE_NO_EXISTE");
      const id = docExp.data().repositorioDocumental?.carpetaEmpresaId ||
          null;
      if (!id) return null;
      const ref = db.collection(COLLECTION).doc(id);
      const doc = await tx.get(ref);
      const ahora = FieldValue.serverTimestamp();
      if (doc.exists && doc.data().expedienteId === expedienteId) {
        tx.update(ref, {expedienteId: null, updatedAt: ahora,
          updatedBy: autor});
      }
      tx.update(refExp, {
        "repositorioDocumental.carpetaEmpresaId": null, "updatedAt": ahora,
      });
      return id;
    });
  }
}

module.exports = new CarpetaEmpresaRepository();
module.exports.COLLECTION = COLLECTION;
