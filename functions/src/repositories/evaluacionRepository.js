const admin = require("firebase-admin");

const db = admin.firestore();
const COLLECTION = "evaluaciones";
// Campos que usa el panel de Reportes.
const CAMPOS_REPORTE = [
  "expedienteId", "expedienteRequerimientoId", "requerimientoId",
  "empresaId", "personaId", "recursoId", "resultado", "modalidad", "estado",
  "createdAt",
];

/**
 * Acceso a datos de Firestore para el recurso Evaluación. Colección
 * append-only: las escrituras (creación + versionamiento transaccional)
 * viven en el service, no acá — este repositorio solo expone lecturas.
 */
class EvaluacionRepository {
  /**
   * Obtiene una evaluación por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} La evaluación o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Obtiene todas las evaluaciones (vigentes e históricas) de un
   * Expediente. Una sola igualdad, sin orderBy: no requiere índice
   * compuesto — el filtro por estado y el orden por fecha se resuelven
   * en memoria en el service.
   * @param {string} expedienteId ID del Expediente.
   * @param {?{campo: string, valor: string}} [sujeto] Opcional: solo las
   *     de un sujeto (personaId / recursoId / empresaId).
   * @return {Promise<object[]>} Lista de evaluaciones del Expediente.
   */
  async getByExpediente(expedienteId, sujeto = null) {
    let query = db.collection(COLLECTION)
        .where("expedienteId", "==", expedienteId);
    if (sujeto) query = query.where(sujeto.campo, "==", sujeto.valor);
    const snapshot = await query.get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Obtiene todas las evaluaciones vigentes de una Persona, en cualquier
   * Expediente/Proyecto. Usado por acreditacionService para el motor de
   * reutilización documental al reemplazar una acreditación (el filtro
   * por `resultado`/`fechaVencimiento` se resuelve en memoria en el
   * service, igual que el resto de los filtros de esta colección).
   * @param {string} personaId ID de la Persona.
   * @return {Promise<object[]>} Lista de evaluaciones vigentes.
   */
  async getVigentesByPersona(personaId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("personaId", "==", personaId)
        .where("estado", "==", "vigente")
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Obtiene todas las evaluaciones vigentes de un Recurso, en cualquier
   * Expediente/Proyecto. Análoga a `getVigentesByPersona` pero para
   * maquinaria/vehículos.
   * @param {string} recursoId ID del Recurso.
   * @return {Promise<object[]>} Lista de evaluaciones vigentes.
   */
  async getVigentesByRecurso(recursoId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("recursoId", "==", recursoId)
        .where("estado", "==", "vigente")
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Obtiene todas las evaluaciones de un conjunto de Expedientes. Usado
   * por acreditacionService para ubicar Evaluaciones de nivel "empresa"
   * reutilizables (Evaluación no tiene `empresaId` propio, así que se
   * filtra primero por los Expedientes de la Empresa vía
   * `expedienteRepository.getByEmpresa`). Filtro `in` sobre un único
   * campo (sin combinarlo con otras igualdades) para no requerir índice
   * compuesto — el resto de los filtros (estado, personaId/recursoId
   * nulos, resultado, fechaVencimiento) se resuelve en memoria en el
   * service. Los ids se agrupan en lotes de 30 (límite de `in` en
   * Firestore).
   * @param {string[]} expedienteIds IDs de los Expedientes.
   * @return {Promise<object[]>} Lista de evaluaciones de esos Expedientes.
   */
  async getByExpedientesIds(expedienteIds) {
    if (!expedienteIds || expedienteIds.length === 0) return [];

    const lotes = [];
    for (let i = 0; i < expedienteIds.length; i += 30) {
      lotes.push(expedienteIds.slice(i, i + 30));
    }

    const snapshots = await Promise.all(
        lotes.map((lote) => db
            .collection(COLLECTION)
            .where("expedienteId", "in", lote)
            .get()),
    );

    const resultados = [];
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => {
        resultados.push({id: doc.id, ...doc.data()});
      });
    });
    return resultados;
  }

  /**
   * Obtiene todas las evaluaciones vigentes, opcionalmente acotadas a un
   * Mandante. Igualdad pura (1 o 2 campos), sin orderBy: no requiere
   * índice compuesto. Usado para vistas agregadas (p. ej. el Dashboard),
   * donde el orden no importa.
   * @param {{mandanteId: (string|undefined)}} filtros Filtros de
   *     búsqueda.
   * @return {Promise<object[]>} Lista de evaluaciones vigentes.
   */
  async getVigentes({mandanteId} = {}) {
    let query = db.collection(COLLECTION).where("estado", "==", "vigente");

    if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Evaluaciones creadas en un rango, opcionalmente de un Mandante (panel de
   * Reportes): una sola consulta, con índice (mandanteId, createdAt desc).
   * Solo trae los campos que usan los cálculos.
   * @param {{mandanteId: (string|undefined), desde: (Date|undefined),
   *     antesDe: (Date|undefined)}} filtros `desde` (>=) y `antesDe` (<).
   * @return {Promise<object[]>} Evaluaciones.
   */
  async listEnRango({mandanteId, desde, antesDe} = {}) {
    let query = db.collection(COLLECTION);
    if (mandanteId) query = query.where("mandanteId", "==", mandanteId);
    if (desde) query = query.where("createdAt", ">=", desde);
    if (antesDe) query = query.where("createdAt", "<", antesDe);
    const snapshot = await query.orderBy("createdAt", "desc")
        .select(...CAMPOS_REPORTE)
        .get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Evaluaciones de un conjunto de instancias creadas antes de una fecha
   * (para saber si una instancia ya tenía revisiones antes del período).
   * Lotes de 30 (límite de `in`), con índice (expedienteRequerimientoId,
   * createdAt).
   * @param {string[]} instanciaIds IDs de expedienteRequerimientos.
   * @param {Date} antesDe Límite (<).
   * @return {Promise<object[]>} Evaluaciones.
   */
  async listDeInstanciasAntesDe(instanciaIds, antesDe) {
    const unicos = [...new Set((instanciaIds || []).filter(Boolean))];
    const lotes = [];
    for (let i = 0; i < unicos.length; i += 30) {
      lotes.push(unicos.slice(i, i + 30));
    }
    const snapshots = await Promise.all(lotes.map((lote) => db
        .collection(COLLECTION)
        .where("expedienteRequerimientoId", "in", lote)
        .where("createdAt", "<", antesDe)
        .select(...CAMPOS_REPORTE)
        .get()));
    return snapshots.flatMap((snapshot) =>
      snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})));
  }
}

module.exports = new EvaluacionRepository();
module.exports.COLLECTION = COLLECTION;
