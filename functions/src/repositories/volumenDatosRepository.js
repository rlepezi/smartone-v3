const admin = require("firebase-admin");

const db = admin.firestore();

// Resumen ejecutivo del correo de respaldo: solo estas 8 colecciones
// (decisión confirmada con el usuario, para no sobrecargar el correo).
const COLECCIONES_RESUMEN = [
  "mandantes", "proyectos", "empresas", "personas", "recursos",
  "participaciones", "expedientes", "evaluaciones",
];

// Umbral a partir del cual una aggregation query se considera lenta y se
// deja constancia en logs (no bloquea ni falla nada, es solo diagnóstico).
const UMBRAL_LENTITUD_MS = 10000;

/**
 * Acceso a datos de Firestore para el snapshot de volumen de datos que
 * acompaña al correo de respaldo. Usa aggregation queries (`.count()`),
 * nunca lee los documentos completos de cada colección.
 */
class VolumenDatosRepository {
  /**
   * Cuenta los documentos de las colecciones del resumen ejecutivo.
   * @return {Promise<Object[]>} [{coleccion, total}], en el mismo orden
   *     que COLECCIONES_RESUMEN. `total` es null si la cuenta falló.
   */
  async contarColeccionesResumen() {
    return Promise.all(COLECCIONES_RESUMEN.map(async (coleccion) => {
      const inicio = Date.now();
      try {
        const snap = await db.collection(coleccion).count().get();
        const demora = Date.now() - inicio;
        if (demora > UMBRAL_LENTITUD_MS) {
          console.warn(
              `⚠️ Contar '${coleccion}' tardó ${demora}ms (> ` +
              `${UMBRAL_LENTITUD_MS}ms).`,
          );
        }
        return {coleccion, total: snap.data().count};
      } catch (error) {
        console.error(`⚠️ No se pudo contar '${coleccion}':`, error.message);
        return {coleccion, total: null};
      }
    }));
  }
}

module.exports = new VolumenDatosRepository();
