const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const relacionRecursoRepository =
    require("../repositories/relacionRecursoRepository");
const recursoRepository = require("../repositories/recursoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const db = admin.firestore();

/**
 * Reglas de negocio para el recurso RelaciónRecurso (entidad 19, ver
 * decisions.md) — vincula un Recurso (maquinaria) con una Empresa.
 * Catálogo global, igual que Recurso y Empresa: sin mandanteId ni
 * alcance por actor. Calca exactamente el patrón de
 * relacionLaboralService.js, adaptado a que Recurso no tiene cargo/
 * tipoContrato/jornada — solo `tipoRelacion`.
 */
class RelacionRecursoService {
  /**
   * Convierte un valor (Firestore Timestamp, Date o string) a un objeto
   * Date de JavaScript.
   * @param {*} valor Valor a convertir.
   * @return {?Date} Fecha convertida, o null si el valor es nulo.
   */
  _aFecha(valor) {
    if (!valor) return null;
    if (typeof valor.toDate === "function") return valor.toDate();
    return new Date(valor);
  }

  /**
   * Parsea y valida una fecha recibida del cliente.
   * @param {*} valor Valor a parsear.
   * @param {string} nombreCampo Nombre del campo, para el mensaje de error.
   * @return {Date} Fecha parseada.
   */
  _parseFecha(valor, nombreCampo) {
    const fecha = new Date(valor);
    if (isNaN(fecha.getTime())) {
      throw new AppError(400, `${nombreCampo} no es una fecha válida.`);
    }
    return fecha;
  }

  /**
   * Valida el campo obligatorio común a crear/cambiar una relación de
   * recurso. No se valida contra un catálogo fijo (tipoRelacion es texto
   * libre, según el spec) — solo presencia.
   * @param {?string} tipoRelacion Valor a validar.
   * @return {void}
   */
  _validarTipoRelacion(tipoRelacion) {
    if (!tipoRelacion || !tipoRelacion.trim()) {
      throw new AppError(400, "El campo 'tipoRelacion' es requerido.");
    }
  }

  /**
   * Obtiene una relación de recurso por su ID.
   * @param {string} id ID de la relación.
   * @return {Promise<Object>} La relación encontrada.
   */
  async getRelacionRecursoById(id) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de relación de recurso inválido.");
    }
    const relacion = await relacionRecursoRepository.getById(id);
    if (!relacion) {
      throw new AppError(404, "Relación de recurso no encontrada.");
    }
    return relacion;
  }

  /**
   * Lista TODAS las relaciones de un Recurso (cualquier estado), más
   * recientes primero — para el bloque "Historial de Empresas" de la
   * ficha de Recurso.
   * @param {string} recursoId ID del Recurso.
   * @return {Promise<Object[]>} Lista de relaciones.
   */
  async listarPorRecurso(recursoId) {
    if (!recursoId) {
      throw new AppError(400, "recursoId es obligatorio.");
    }
    const relaciones = await relacionRecursoRepository.listByRecurso(
        recursoId,
    );
    return relaciones.sort(
        (a, b) => this._aFecha(b.fechaInicio) - this._aFecha(a.fechaInicio),
    );
  }

  /**
   * Crea la relación INICIAL de un Recurso recién creado. Uso exclusivo
   * desde recursoService.crearRecurso (y el script de migración): no
   * valida "una sola activa" contra otras relaciones porque el Recurso
   * es nuevo y no puede tener ninguna todavía. Solo `empresaId` es
   * obligatorio — `tipoRelacion` queda null si no viene (decisión
   * "completar después": el alta rápida no lo pide; se completa
   * editando la Maquinaria/RelaciónRecurso más adelante). No usa
   * _validarTipoRelacion, que sigue siendo estricta para cambiarEmpresa.
   * @param {string} recursoId ID del Recurso ya creado.
   * @param {Object} payload Datos de la relación inicial.
   * @return {Promise<Object>} La relación creada.
   */
  async crearRelacionInicial(recursoId, payload) {
    const {empresaId, tipoRelacion, fechaInicio} = payload;
    const fechaInicioDate = fechaInicio ?
        this._parseFecha(fechaInicio, "fechaInicio") : new Date();

    return relacionRecursoRepository.create({
      recursoId,
      empresaId,
      tipoRelacion: tipoRelacion ? tipoRelacion.trim() : null,
      fechaInicio: fechaInicioDate,
      fechaTermino: null,
      estado: "activa",
    });
  }

  /**
   * Cambia la Empresa activa de un Recurso: en una única transacción de
   * Firestore, cierra la RelaciónRecurso activa actual (si existe,
   * `estado: "finalizada"`, `fechaTermino: ahora`) y crea la nueva
   * relación activa, actualizando el denormalizado de Recurso
   * (`empresaId`/`empresaActivaId`). RN-122 queda garantizado por
   * construcción: la transacción nunca deja más de una relación "activa"
   * a la vez para este Recurso.
   * @param {string} recursoId ID del Recurso.
   * @param {Object} payload Datos de la nueva relación.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La nueva relación, ya activa.
   */
  async cambiarEmpresa(recursoId, payload, actor) {
    const recurso = await recursoRepository.getById(recursoId);
    if (!recurso) {
      throw new AppError(404, "Recurso no encontrado.");
    }

    const {empresaId, tipoRelacion, fechaInicio} = payload;
    if (!empresaId) {
      throw new AppError(400, "empresaId es obligatorio.");
    }
    this._validarTipoRelacion(tipoRelacion);
    if (!fechaInicio) {
      throw new AppError(400, "fechaInicio es obligatorio.");
    }
    const fechaInicioDate = this._parseFecha(fechaInicio, "fechaInicio");

    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa) {
      throw new AppError(400, "La Empresa indicada no existe.");
    }
    if (empresa.estado !== "activo") {
      throw new AppError(400, "La Empresa indicada no está activa.");
    }

    const tipoRelacionTrim = tipoRelacion.trim();
    const nuevaRef = db.collection(relacionRecursoRepository.COLLECTION).doc();
    const recursoRef = db.collection("recursos").doc(recursoId);

    const empresaAnteriorId = recurso.empresaId || null;
    let relacionAnteriorId = null;

    await db.runTransaction(async (transaction) => {
      const activaQuery = db
          .collection(relacionRecursoRepository.COLLECTION)
          .where("recursoId", "==", recursoId)
          .where("estado", "==", "activa")
          .limit(1);
      const activaSnapshot = await transaction.get(activaQuery);

      if (!activaSnapshot.empty) {
        const activaDoc = activaSnapshot.docs[0];
        relacionAnteriorId = activaDoc.id;
        transaction.update(activaDoc.ref, {
          estado: "finalizada",
          fechaTermino: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      transaction.set(nuevaRef, {
        recursoId,
        empresaId,
        tipoRelacion: tipoRelacionTrim,
        fechaInicio: fechaInicioDate,
        fechaTermino: null,
        estado: "activa",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(recursoRef, {
        empresaId,
        empresaActivaId: empresaId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Recurso es catálogo global (sin mandanteId) — mismo criterio que
    // Persona: el evento queda registrado igual, aunque los roles con
    // alcance forzado por mandante (mandante_admin/lector) no lo verán en
    // su feed de bitácora filtrado por mandanteId.
    await bitacoraLogger.registrarEvento({
      mandanteId: null,
      entidad: "recurso",
      entidadId: recursoId,
      accion: "cambio_empresa",
      actor,
      detalle: {
        empresaAnteriorId,
        empresaNuevaId: empresaId,
        relacionRecursoAnteriorId: relacionAnteriorId,
        relacionRecursoNuevaId: nuevaRef.id,
      },
    });

    return relacionRecursoRepository.getById(nuevaRef.id);
  }
}

module.exports = new RelacionRecursoService();
