const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "bitacora";

/**
 * Acceso a datos de Firestore para la colección Bitácora (auditoría /
 * trazabilidad, RN-104/RN-120/RN-121). INMUTABLE: no existe `update` ni
 * `delete` — solo se crean registros nuevos, nunca se editan ni se
 * borran.
 */
class BitacoraRepository {
  /**
   * Crea un nuevo registro de bitácora.
   * @param {object} data Datos del evento.
   * @return {Promise<object>} El registro creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const bitacoraData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(bitacoraData);
    return {id: docRef.id, ...bitacoraData};
  }

  /**
   * Lista registros de bitácora. Si vienen `entidad` y `entidadId` juntos,
   * se usa esa combinación (historial completo de una entidad puntual) sin
   * considerar `mandanteId` en la consulta — el scope por Mandante para
   * ese caso se resuelve en el Service, en memoria, para no requerir un
   * índice compuesto de 4 campos que no existe. En caso contrario, filtra
   * por `mandanteId` (actividad reciente).
   * @param {{mandanteId: (string|undefined), entidad: (string|undefined),
   *     entidadId: (string|undefined), limit: (number|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de registros, más reciente primero.
   */
  async list({mandanteId, entidad, entidadId, limit} = {}) {
    let query = db.collection(COLLECTION);

    if (entidad && entidadId) {
      query = query
          .where("entidad", "==", entidad)
          .where("entidadId", "==", entidadId);
    } else if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
    }

    query = query.orderBy("createdAt", "desc");
    if (limit) {
      query = query.limit(Number(limit));
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Línea de tiempo de acciones de UN actor (usuario), paginada con
   * cursor — usada por `GET /usuarios/:id/actividad` (Fase C). Requiere
   * el índice compuesto `(actorUid asc, createdAt desc)` (y
   * `(actorUid asc, entidad asc, createdAt desc)` cuando se filtra por
   * `tipo`), agregados a `firestore.indexes.json`.
   * @param {string} actorUid UID del usuario cuya actividad se lista.
   * @param {{tipo: (string|undefined), cursor: (string|undefined),
   *     limit: (number|undefined)}} opciones `tipo` filtra por `entidad`.
   * @return {Promise<object[]>} Eventos, más reciente primero.
   */
  async listPorActor(actorUid, {tipo, cursor, limit = 20} = {}) {
    let query = db.collection(COLLECTION).where("actorUid", "==", actorUid);
    if (tipo) query = query.where("entidad", "==", tipo);
    query = query.orderBy("createdAt", "desc").limit(Number(limit));

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTION).doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Trae los eventos de VARIAS entidades a la vez (p. ej. un Proyecto, sus
   * Participaciones y sus Expedientes), combinados y ordenados por fecha
   * descendente. Ejecuta una consulta por referencia sobre el mismo par
   * entidad+entidadId (+ orderBy createdAt) que ya usa `list`, así reusa
   * su índice compuesto en vez de exigir uno nuevo para consultas `in`;
   * cada una se acota a `limit`, así que el costo es (#referencias x limit)
   * lecturas como máximo.
   * @param {{entidad: string, entidadId: string}[]} referencias Pares
   *     entidad/entidadId a consultar.
   * @param {{limit: (number|undefined)}} [opciones] `limit` del resultado
   *     final (y tope por referencia).
   * @return {Promise<object[]>} Eventos, más reciente primero.
   */
  async listPorReferencias(referencias, {limit} = {}) {
    if (!referencias || referencias.length === 0) return [];

    const porReferencia = await Promise.all(
        referencias.map(({entidad, entidadId}) =>
          this.list({entidad, entidadId, limit})),
    );

    const aMillis = (registro) =>
      registro.createdAt?.toMillis ? registro.createdAt.toMillis() : 0;

    const combinados = porReferencia
        .flat()
        .sort((a, b) => aMillis(b) - aMillis(a));

    return limit ? combinados.slice(0, Number(limit)) : combinados;
  }
}

module.exports = new BitacoraRepository();
