const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "usuarios";

/**
 * Acceso a datos de Firestore para el recurso Usuario.
 * El ID del documento es siempre el UID de Firebase Auth.
 */
class UsuarioRepository {
  /**
   * Obtiene un usuario por su UID.
   * @param {string} uid UID del usuario (Auth + Firestore).
   * @return {Promise<object|null>} El usuario o null si no existe.
   */
  async getById(uid) {
    const doc = await db.collection(COLLECTION).doc(uid).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Lista usuarios, opcionalmente filtrados por mandante y/o estado.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de usuarios.
   */
  async list({mandanteId, estado} = {}) {
    let query = db.collection(COLLECTION);

    if (mandanteId) {
      query = query.where("mandanteId", "==", mandanteId);
    }
    if (estado) {
      query = query.where("estado", "==", estado);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  }

  /**
   * Lista los correos de los usuarios con un rol dado (p. ej. superadmin),
   * para notificaciones automáticas. Filtra los que no tengan email.
   * @param {string} rol Rol a buscar.
   * @return {Promise<string[]>} Correos electrónicos.
   */
  async listarCorreosPorRol(rol) {
    const snapshot = await db.collection(COLLECTION)
        .where("rol", "==", rol).get();
    return snapshot.docs
        .map((doc) => doc.data().email)
        .filter((email) => typeof email === "string" && email.includes("@"));
  }

  /**
   * Crea el documento de un usuario usando el UID de Auth como ID.
   * @param {string} uid UID del usuario en Firebase Auth.
   * @param {object} data Datos del usuario.
   * @return {Promise<object>} El usuario creado.
   */
  async create(uid, data) {
    const docRef = db.collection(COLLECTION).doc(uid);

    const usuarioData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(usuarioData);
    return {id: uid, ...usuarioData};
  }

  /**
   * Actualiza un usuario existente.
   * @param {string} uid UID del usuario.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El usuario actualizado.
   */
  async update(uid, data) {
    const docRef = db.collection(COLLECTION).doc(uid);

    const updateData = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Prevenir sobreescritura accidental de createdAt/id
    delete updateData.createdAt;
    delete updateData.id;

    await docRef.update(updateData);
    return this.getById(uid);
  }

  /**
   * Actualiza únicamente el estado de un usuario.
   * @param {string} uid UID del usuario.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El usuario actualizado.
   */
  async setEstado(uid, estado) {
    return this.update(uid, {estado});
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

module.exports = new UsuarioRepository();
