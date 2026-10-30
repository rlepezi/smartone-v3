const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");

const db = admin.firestore();
const COLLECTION = "proyectos";
// Contador del correlativo de código por Mandante y año (doc
// `${mandanteId}_${anio}`). Se crea con el primer Proyecto de ese par.
const CONTADORES = "contadoresProyecto";

/**
 * Código de Proyecto: PRJ-AAAA-NNN (el correlativo crece a 4 dígitos si
 * hace falta).
 * @param {number} anio Año de creación.
 * @param {number} correlativo Correlativo.
 * @return {string} Código.
 */
const formatearCodigo = (anio, correlativo) =>
  `PRJ-${anio}-${String(correlativo).padStart(3, "0")}`;

/**
 * Acceso a datos de Firestore para el recurso Proyecto.
 */
class ProyectoRepository {
  /**
   * Obtiene un proyecto por su ID.
   * @param {string} id ID del documento.
   * @return {Promise<object|null>} El proyecto o null si no existe.
   */
  async getById(id) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return {id: doc.id, ...doc.data()};
  }

  /**
   * Obtiene varios proyectos por ID en lecturas por lote (db.getAll), sin
   * una consulta por documento. Los IDs inexistentes se omiten.
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
   * Lista proyectos, opcionalmente filtrados por mandante y/o estado.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined)}}
   *     filtros Filtros de búsqueda.
   * @return {Promise<object[]>} Lista de proyectos.
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
   * Crea un nuevo proyecto.
   * @param {object} data Datos del proyecto.
   * @return {Promise<object>} El proyecto creado.
   */
  async create(data) {
    const docRef = db.collection(COLLECTION).doc();

    const proyectoData = {
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(proyectoData);
    return {id: docRef.id, ...proyectoData};
  }

  /**
   * Crea un proyecto asignándole el siguiente código de su Mandante y año,
   * en UNA transacción con el contador (contadoresProyecto). Si el contador
   * no existe todavía, parte del mayor correlativo ya usado por ese
   * Mandante en ese año. Dos creaciones simultáneas no pueden obtener el
   * mismo código: la transacción bloquea el contador y, si ambas intentan
   * crearlo, `create` falla con ALREADY_EXISTS en una de ellas (el servicio
   * reintenta).
   * @param {object} data Datos del proyecto (con mandanteId, sin código).
   * @param {number} anio Año de creación.
   * @return {Promise<object>} El proyecto creado, con su código.
   */
  async createConCodigo(data, anio) {
    const contadorRef = db.collection(CONTADORES)
        .doc(`${data.mandanteId}_${anio}`);
    const docRef = db.collection(COLLECTION).doc();
    const patron = new RegExp(`^PRJ-${anio}-(\\d+)$`);

    const proyectoData = await db.runTransaction(async (tx) => {
      const contador = await tx.get(contadorRef);
      let ultimo = 0;
      if (contador.exists) {
        ultimo = contador.data().ultimo || 0;
      } else {
        const existentes = await tx.get(db.collection(COLLECTION)
            .where("mandanteId", "==", data.mandanteId).select("codigo"));
        existentes.docs.forEach((d) => {
          const match = String(d.data().codigo || "").match(patron);
          if (match) ultimo = Math.max(ultimo, parseInt(match[1], 10));
        });
      }
      const siguiente = ultimo + 1;
      const datosContador = {
        mandanteId: data.mandanteId, anio, ultimo: siguiente,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (contador.exists) tx.update(contadorRef, datosContador);
      else tx.create(contadorRef, datosContador);

      const nuevo = {
        ...data,
        codigo: formatearCodigo(anio, siguiente),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(docRef, nuevo);
      return nuevo;
    });
    return {id: docRef.id, ...proyectoData};
  }

  /**
   * Actualiza un proyecto existente.
   * @param {string} id ID del documento.
   * @param {object} data Campos a actualizar.
   * @return {Promise<object|null>} El proyecto actualizado.
   */
  async update(id, data) {
    const docRef = db.collection(COLLECTION).doc(id);

    const updateData = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    delete updateData.createdAt;
    delete updateData.id;

    await docRef.update(updateData);
    return this.getById(id);
  }

  /**
   * Actualiza únicamente el estado de un proyecto.
   * @param {string} id ID del documento.
   * @param {string} estado Nuevo estado.
   * @return {Promise<object|null>} El proyecto actualizado.
   */
  async setEstado(id, estado) {
    return this.update(id, {estado});
  }
}

module.exports = new ProyectoRepository();
