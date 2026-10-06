const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "evaluacionEvidencias";

// Límite de Firestore para el operador "in" en una sola query.
const LOTE_IN = 30;

/**
 * Acceso a datos de Firestore para el recurso Evaluación-Evidencia
 * (vincula una Evaluación con las Evidencias que la respaldan). Tabla de
 * vínculo puro, append-only: sus consultas son de igualdad, sin
 * orderBy, por lo que no requiere ningún índice compuesto.
 */
class EvaluacionEvidenciaRepository {
  /**
   * Lista los vínculos de una Evaluación específica.
   * @param {string} evaluacionId ID de la Evaluación.
   * @return {Promise<object[]>} Lista de vínculos.
   */
  async getByEvaluacion(evaluacionId) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("evaluacionId", "==", evaluacionId)
        .get();

    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Lista los vínculos de varias Evaluaciones a la vez (usado para
   * embeber qué Evidencias respaldan cada Evaluación de un Expediente
   * en una sola llamada). Trocea en lotes de 30 IDs, el máximo permitido
   * por Firestore para el operador "in".
   * @param {string[]} evaluacionIds IDs de las Evaluaciones.
   * @return {Promise<object[]>} Lista combinada de vínculos.
   */
  async getByEvaluacionIds(evaluacionIds) {
    if (!evaluacionIds || evaluacionIds.length === 0) return [];

    const lotes = [];
    for (let i = 0; i < evaluacionIds.length; i += LOTE_IN) {
      lotes.push(evaluacionIds.slice(i, i + LOTE_IN));
    }

    const resultados = await Promise.all(
        lotes.map((lote) =>
          db.collection(COLLECTION).where("evaluacionId", "in", lote).get(),
        ),
    );

    return resultados.flatMap((snapshot) =>
      snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()})),
    );
  }

  /**
   * Crea un nuevo vínculo.
   * @param {object} data Datos del vínculo.
   * @return {Promise<object>} El vínculo creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const vinculoData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(vinculoData);
    return {id: docRef.id, ...vinculoData};
  }
}

module.exports = new EvaluacionEvidenciaRepository();
