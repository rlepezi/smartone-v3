const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "mandantes";

// Campos que siguen en documentos antiguos pero el código ya no lee ni
// escribe (el antiguo "Nombre Identificador", reemplazado por el nombre a
// mostrar de utils/mandanteDisplay.js). La migración
// scripts/migrarNombreIdentificadorMandante.js no los borra; se excluyen
// acá para que ninguna respuesta de la API los exponga.
const CAMPOS_LEGADOS = ["nombre"];

/**
 * Convierte un documento de Firestore en la entidad Mandante, sin los
 * campos legados.
 * @param {FirebaseFirestore.DocumentSnapshot} doc Documento existente.
 * @return {object} El mandante con su id.
 */
function aEntidad(doc) {
  const data = {...doc.data()};
  CAMPOS_LEGADOS.forEach((campo) => delete data[campo]);
  return {id: doc.id, ...data};
}

/**
 * Acceso a datos de Firestore para el recurso Mandante.
 */
class MandanteRepository {
  /**
   * Obtiene un mandante por su ID de documento.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El mandante o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return aEntidad(doc);
  }

  /**
   * Busca un mandante por su RUT normalizado.
   * @param {string} rutNormalized RUT ya normalizado.
   * @return {Promise<object|null>} El mandante o null si no existe.
   */
  async getByRut(rutNormalized) {
    const snapshot = await db
        .collection(COLLECTION)
        .where("rut", "==", rutNormalized)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    return aEntidad(snapshot.docs[0]);
  }

  /**
   * Lista mandantes, opcionalmente filtrados por estado.
   * @param {{estado: string}} filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de mandantes.
   */
  async list({estado} = {}) {
    let query = db.collection(COLLECTION);

    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map(aEntidad);
  }

  /**
   * Crea un nuevo mandante.
   * @param {object} data Datos del mandante.
   * @return {Promise<object>} El mandante creado.
   */
  async create(data) {
    // ID autogenerado por Firestore
    const docRef = db.collection(COLLECTION).doc();

    const mandanteData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(mandanteData);
    return {id: docRef.id, ...mandanteData};
  }

  /**
   * Actualiza un mandante existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El mandante actualizado.
   */
  async update(id, data) {
    const docRef = db.collection(COLLECTION).doc(id);

    const updateData = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Prevenir sobreescritura accidental de createdAt
    delete updateData.createdAt;
    delete updateData.id;

    await docRef.update(updateData);
    return this.getById(id);
  }

  /**
   * Actualiza únicamente el estado de un mandante.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El mandante actualizado.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }

  /**
   * Obtiene varios documentos por ID en lecturas por lote (db.getAll). Los
   * IDs inexistentes se omiten.
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
}

module.exports = new MandanteRepository();
