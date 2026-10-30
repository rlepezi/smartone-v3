const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {aplicarDelta} = require("../utils/patronesMapeo");

const db = admin.firestore();
const COLLECTION = "patronesRequerimiento";
const COLECCION_CARPETAS = "carpetasEmpresa";

/**
 * Acceso a datos de los patrones aprendidos del mapeo documental (uno por
 * Mandante, ámbito, objetivo, patrón y requerimiento; ID determinístico).
 */
class PatronRequerimientoRepository {
  /**
   * Patrón por ID.
   * @param {string} id ID.
   * @return {Promise<?Object>} Patrón o null.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Patrones por filtros de igualdad.
   * @param {{mandanteId: string, ambito: ?string, objetivo: ?string,
   *     requerimientoId: ?string, estado: ?string}} filtros Filtros.
   * @return {Promise<Object[]>} Patrones.
   */
  async list({mandanteId, ambito = null, objetivo = null,
    requerimientoId = null, estado = null}) {
    let q = db.collection(COLLECTION).where("mandanteId", "==", mandanteId);
    if (ambito) q = q.where("ambito", "==", ambito);
    if (objetivo) q = q.where("objetivo", "==", objetivo);
    if (requerimientoId) q = q.where("requerimientoId", "==", requerimientoId);
    if (estado) q = q.where("estado", "==", estado);
    const snap = await q.get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Cambia el estado (activo / inactivo) de un patrón.
   * @param {string} id ID.
   * @param {string} estado Estado.
   * @param {Object} autor {uid, nombre}.
   * @return {Promise<Object>} Patrón actualizado.
   */
  async cambiarEstado(id, estado, autor) {
    await db.collection(COLLECTION).doc(id).update({estado,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: autor});
    return this.getById(id);
  }

  /**
   * Aplica deltas de patrones y, en la MISMA transacción, la escritura de
   * la carpeta (asignaciones): todo o nada. Primero lee los patrones
   * afectados, después escribe.
   * @param {Object} entrada Datos.
   * @param {Array<Object>} entrada.deltas agruparDeltas.
   * @param {Object} entrada.autor {uid, nombre}.
   * @param {?string} entrada.carpetaEmpresaId Carpeta de origen (para los
   *     patrones nuevos) y, con `cambiosCarpeta`, la que se actualiza.
   * @param {?Object} entrada.cambiosCarpeta Campos de la carpeta.
   * @return {Promise<Array<Object>>} [{id, patron, requerimientoId, delta,
   *     vecesConfirmado, estado}] de lo aplicado.
   */
  async aplicar({deltas, autor, carpetaEmpresaId = null,
    cambiosCarpeta = null}) {
    return db.runTransaction(async (tx) => {
      const refs = deltas.map((d) => db.collection(COLLECTION).doc(d.id));
      const docs = refs.length ? await tx.getAll(...refs) : [];
      const ahora = FieldValue.serverTimestamp();
      const aplicados = [];
      deltas.forEach((d, i) => {
        const actual = docs[i].exists ? docs[i].data() : null;
        const valor = aplicarDelta(actual, d.delta);
        if (!valor) return;
        if (actual) {
          tx.update(refs[i], {...valor, updatedAt: ahora, updatedBy: autor,
            ...(d.delta > 0 ? {ultimaConfirmacionAt: ahora} : {})});
        } else {
          tx.set(refs[i], {mandanteId: d.mandanteId, ambito: d.ambito,
            objetivo: d.objetivo, patron: d.patron,
            requerimientoId: d.requerimientoId || null, ...valor,
            ultimaConfirmacionAt: ahora,
            carpetaEmpresaIdOrigen: carpetaEmpresaId, createdAt: ahora,
            createdBy: autor, updatedAt: ahora, updatedBy: autor});
        }
        aplicados.push({id: d.id, patron: d.patron,
          requerimientoId: d.requerimientoId || null, delta: d.delta,
          ...valor});
      });
      if (cambiosCarpeta && carpetaEmpresaId) {
        tx.update(db.collection(COLECCION_CARPETAS).doc(carpetaEmpresaId),
            {...cambiosCarpeta, updatedAt: ahora});
      }
      return aplicados;
    });
  }
}

module.exports = new PatronRequerimientoRepository();
module.exports.COLLECTION = COLLECTION;
