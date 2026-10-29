const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "consumosIA";

// Campos que leen los resúmenes de consumo (sin el resto del registro).
const CAMPOS_RESUMEN = [
  "mandanteId", "origen", "tipoDocumentalId", "tipoDocumentalNombre",
  "tokensEntrada", "tokensSalida", "costoUsd", "createdAt",
];

/**
 * Acceso a datos del registro de consumo de IA: un documento por llamada a
 * la IA, inmutable, con el precio vigente al momento de la llamada y su
 * costo ya calculado (nunca se recalcula).
 */
class ConsumoIARepository {
  /**
   * Crea un registro. Con `id` (registro asociado a otra colección, p. ej.
   * "procesamientosIA_<id>") la escritura es idempotente: volver a
   * escribirlo no lo duplica.
   * @param {?string} id ID del documento, o null para uno automático.
   * @param {Object} data Datos (sin createdAt: lo pone el servidor, salvo
   *     que venga, como en el backfill).
   * @return {Promise<string>} ID del registro.
   */
  async crear(id, data) {
    const ref = id ? db.collection(COLLECTION).doc(id) :
      db.collection(COLLECTION).doc();
    await ref.set({...data,
      createdAt: data.createdAt || FieldValue.serverTimestamp()});
    return ref.id;
  }

  /**
   * IDs (de una lista) que ya tienen registro.
   * @param {string[]} ids IDs a revisar.
   * @return {Promise<Set<string>>} Los que existen.
   */
  async existentes(ids) {
    const existen = new Set();
    for (let i = 0; i < ids.length; i += 300) {
      const refs = ids.slice(i, i + 300)
          .map((id) => db.collection(COLLECTION).doc(id));
      // eslint-disable-next-line no-await-in-loop
      const docs = refs.length ? await db.getAll(...refs) : [];
      docs.forEach((d) => {
        if (d.exists) existen.add(d.id);
      });
    }
    return existen;
  }

  /**
   * Registros en [desde, hasta), opcionalmente de un Mandante.
   * @param {Date} desde Inicio (>=).
   * @param {Date} hasta Fin (<).
   * @param {(string|null|undefined)} mandanteId undefined: todos; null: solo
   *     los sin Mandante; string: ese Mandante.
   * @return {Promise<Object[]>} Registros con CAMPOS_RESUMEN.
   */
  async listEntre(desde, hasta, mandanteId) {
    let q = db.collection(COLLECTION);
    if (mandanteId !== undefined) q = q.where("mandanteId", "==", mandanteId);
    const snap = await q.where("createdAt", ">=", desde)
        .where("createdAt", "<", hasta)
        .select(...CAMPOS_RESUMEN).get();
    return snap.docs.map((d) => d.data());
  }

  /**
   * Costos desde una fecha (todos los Mandantes: el límite de gasto es
   * global).
   * @param {Date} desde Inicio (>=).
   * @return {Promise<Object[]>} [{costoUsd, createdAt}].
   */
  async listCostosDesde(desde) {
    const snap = await db.collection(COLLECTION)
        .where("createdAt", ">=", desde)
        .select("costoUsd", "createdAt").get();
    return snap.docs.map((d) => d.data());
  }
}

module.exports = new ConsumoIARepository();
module.exports.COLLECTION = COLLECTION;
