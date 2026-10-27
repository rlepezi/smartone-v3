const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "configuracionIA";
// Documento único de configuración. Punto de extensión futuro: un
// documento por Mandante (configuracionIA/{mandanteId}) como override del
// global; hoy solo existe "global".
const ID_GLOBAL = "global";

/**
 * Acceso a datos de la configuración de IA. Solo el backend la lee y la
 * escribe (Security Rules: sin acceso desde el cliente); contiene la API key
 * cifrada.
 */
class ConfiguracionIARepository {
  /**
   * Obtiene la configuración.
   * @param {string} [id] ID del documento ("global").
   * @return {Promise<?Object>} Configuración o null si no existe.
   */
  async get(id = ID_GLOBAL) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return doc.exists ? {id: doc.id, ...doc.data()} : null;
  }

  /**
   * Crea o actualiza campos de la configuración. Cada campo enviado se
   * reemplaza completo (un mapa como preciosPorModelo no se mezcla con el
   * anterior); los demás quedan como estaban.
   * @param {Object} data Campos a guardar.
   * @param {string} [id] ID del documento ("global").
   * @return {Promise<Object>} Configuración resultante.
   */
  async guardar(data, id = ID_GLOBAL) {
    await db.collection(COLLECTION).doc(id).set(
        {...data, updatedAt: FieldValue.serverTimestamp()},
        {mergeFields: [...Object.keys(data), "updatedAt"]},
    );
    return this.get(id);
  }
}

module.exports = new ConfiguracionIARepository();
module.exports.ID_GLOBAL = ID_GLOBAL;
