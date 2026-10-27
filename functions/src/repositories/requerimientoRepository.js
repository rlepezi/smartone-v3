const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const {COLECCION_INDICE} = require("../utils/nombreRequerimiento");

const db = admin.firestore();
const COLLECTION = "requerimientos";

/**
 * Acceso a datos de Firestore para el recurso Requerimiento. Cada
 * Requerimiento pertenece a un Mandante (`mandanteId`). La unicidad del
 * nombre se sostiene con el índice `requerimientosNombre`
 * (utils/nombreRequerimiento.js).
 */
class RequerimientoRepository {
  /**
   * Obtiene un requerimiento por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El requerimiento o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Requerimientos asociados a un tipo documental (Validación con IA), de
   * todos los Mandantes.
   * @param {string} tipoDocumentalId Tipo documental.
   * @return {Promise<object[]>} Requerimientos.
   */
  async listByTipoDocumental(tipoDocumentalId) {
    const snap = await db.collection(COLLECTION)
        .where("tipoDocumentalId", "==", tipoDocumentalId).get();
    return snap.docs.map((d) => ({id: d.id, ...d.data()}));
  }

  /**
   * Obtiene varios requerimientos por ID en lecturas por lote (db.getAll).
   * Los IDs inexistentes se omiten.
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
   * Referencia para un Requerimiento nuevo (su ID se conoce antes de
   * escribirlo, para armar sus vínculos en la misma transacción).
   * @return {FirebaseFirestore.DocumentReference} Referencia nueva.
   */
  nuevaRef() {
    return db.collection(COLLECTION).doc();
  }

  /**
   * Referencia a un Requerimiento existente.
   * @param {string} id ID del documento.
   * @return {FirebaseFirestore.DocumentReference} Referencia.
   */
  ref(id) {
    return db.collection(COLLECTION).doc(id);
  }

  /**
   * Lista los requerimientos de un Mandante, opcionalmente filtrados por
   * tipo de entidad y/o estado.
   * @param {{mandanteId: string, estado: (string|undefined), tipoEntidad:
   *     (string|undefined)}} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de requerimientos.
   */
  async list({mandanteId, estado, tipoEntidad} = {}) {
    let query = db.collection(COLLECTION)
        .where("mandanteId", "==", mandanteId);

    if (tipoEntidad) {
      query = query.where("tipoEntidad", "==", tipoEntidad);
    }
    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Actualiza campos sueltos (estado IA y tipo documental de las reglas de
   * revisión; no toca el nombre ni sus vínculos de perfil).
   * @param {string} id ID del documento.
   * @param {Object} cambios Campos.
   * @return {Promise<object>} Requerimiento actualizado.
   */
  async update(id, cambios) {
    await db.collection(COLLECTION).doc(id)
        .update({...cambios, updatedAt: FieldValue.serverTimestamp()});
    return this.getById(id);
  }

  /**
   * Requerimientos activos de todos los Mandantes, solo con su entidad y
   * estado IA (cobertura de las reglas de revisión).
   * @return {Promise<object[]>} Lista de {id, tipoEntidad, estadoIA}.
   */
  async listActivosResumenIA() {
    const snapshot = await db.collection(COLLECTION)
        .where("estado", "==", "activo")
        .select("tipoEntidad", "estadoIA")
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Requerimientos activos de un Mandante, solo con su tipo de entidad
   * (para contar a qué Perfiles de Recurso aplica cada vínculo).
   * @param {string} mandanteId ID del Mandante.
   * @return {Promise<object[]>} Lista de {id, tipoEntidad}.
   */
  async listActivosAplicacion(mandanteId) {
    const snapshot = await db.collection(COLLECTION)
        .where("mandanteId", "==", mandanteId)
        .where("estado", "==", "activo")
        .select("tipoEntidad")
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Guarda un Requerimiento junto con su índice de nombre y sus vínculos en
   * UNA transacción: o se escribe todo, o nada.
   * - `claveTomar`: clave del índice que debe quedar a nombre de este
   *   Requerimiento; si la ocupa otro, falla con `codigo:
   *   "NOMBRE_DUPLICADO"` y no se escribe nada.
   * - `claveLiberar`: clave que deja de usar (renombre o desactivación);
   *   se borra solo si sigue a su nombre.
   * @param {{ref: FirebaseFirestore.DocumentReference, esNuevo: boolean,
   *     datos: Object, claveTomar: ?string, claveLiberar: ?string,
   *     escribirVinculos: (function(FirebaseFirestore.Transaction):
   *     void|undefined)}} operacion Datos de la operación.
   * @return {Promise<void>}
   */
  async guardarAtomico({
    ref, esNuevo, datos, claveTomar, claveLiberar, escribirVinculos,
  }) {
    const indice = db.collection(COLECCION_INDICE);
    const refTomar = claveTomar ? indice.doc(claveTomar) : null;
    const refLiberar = claveLiberar ? indice.doc(claveLiberar) : null;

    await db.runTransaction(async (tx) => {
      // Lecturas primero.
      const [docActual, docTomar, docLiberar] = await Promise.all([
        esNuevo ? null : tx.get(ref),
        refTomar ? tx.get(refTomar) : null,
        refLiberar ? tx.get(refLiberar) : null,
      ]);
      if (!esNuevo && !docActual.exists) {
        throw Object.assign(new Error("Requerimiento no encontrado."), {
          codigo: "NO_ENCONTRADO",
        });
      }
      if (docTomar?.exists && docTomar.data().requerimientoId !== ref.id) {
        throw Object.assign(new Error("Nombre de Requerimiento en uso."), {
          codigo: "NOMBRE_DUPLICADO",
        });
      }

      const ahora = FieldValue.serverTimestamp();
      if (docLiberar?.exists &&
          docLiberar.data().requerimientoId === ref.id) {
        tx.delete(refLiberar);
      }
      if (refTomar && !docTomar.exists) {
        tx.set(refTomar, {
          requerimientoId: ref.id,
          mandanteId: datos.mandanteId,
          tipoEntidad: datos.tipoEntidad,
          createdAt: ahora,
        });
      }
      if (esNuevo) {
        tx.set(ref, {...datos, createdAt: ahora, updatedAt: ahora});
      } else {
        tx.update(ref, {...datos, updatedAt: ahora});
      }
      if (escribirVinculos) escribirVinculos(tx);
    });
  }
}

module.exports = new RequerimientoRepository();
module.exports.COLLECTION = COLLECTION;
