const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const relacionLaboralRepository =
    require("../repositories/relacionLaboralRepository");
const personaRepository = require("../repositories/personaRepository");
const empresaRepository = require("../repositories/empresaRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");

const db = admin.firestore();

/**
 * Reglas de negocio para el recurso RelaciónLaboral (entidad 17, ver
 * decisions.md) — vincula una Persona con una Empresa. Catálogo global,
 * igual que Persona y Empresa: sin mandanteId ni alcance por actor.
 */
class RelacionLaboralService {
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
   * Valida los campos obligatorios comunes a crear/cambiar una relación
   * laboral. No se valida contra un catálogo fijo (tipoRelacion/
   * tipoContrato/jornada son texto libre, según el spec) — solo presencia.
   * @param {{tipoRelacion: ?string, cargo: ?string,
   *     tipoContrato: ?string}} campos Campos a validar.
   * @return {void}
   */
  _validarCamposRelacion({tipoRelacion, cargo, tipoContrato}) {
    if (!tipoRelacion || !tipoRelacion.trim()) {
      throw new AppError(400, "El campo 'tipoRelacion' es requerido.");
    }
    if (!cargo || !cargo.trim()) {
      throw new AppError(400, "El campo 'cargo' es requerido.");
    }
    if (!tipoContrato || !tipoContrato.trim()) {
      throw new AppError(400, "El campo 'tipoContrato' es requerido.");
    }
  }

  /**
   * Validación reducida SOLO para la relación inicial de una Persona
   * recién creada desde el modal rápido "Nueva Persona" del wizard: ese
   * modal dejó de pedir Tipo de Relación/Tipo de Contrato ("completar
   * después" — decisión explícita), así que acá únicamente se exige
   * 'cargo' (Función). `cambiarEmpresa` sigue usando
   * `_validarCamposRelacion` sin cambios, con los 3 campos obligatorios.
   * @param {{cargo: ?string}} campos Campos a validar.
   * @return {void}
   */
  _validarCargoInicial({cargo}) {
    if (!cargo || !cargo.trim()) {
      throw new AppError(400, "El campo 'cargo' es requerido.");
    }
  }

  /**
   * Obtiene una relación laboral por su ID.
   * @param {string} id ID de la relación laboral.
   * @return {Promise<Object>} La relación laboral encontrada.
   */
  async getRelacionLaboralById(id) {
    if (!id || typeof id !== "string") {
      throw new AppError(400, "ID de relación laboral inválido.");
    }
    const relacion = await relacionLaboralRepository.getById(id);
    if (!relacion) {
      throw new AppError(404, "Relación laboral no encontrada.");
    }
    return relacion;
  }

  /**
   * Lista TODAS las relaciones laborales de una Persona (cualquier
   * estado), más recientes primero — para el bloque "Historial de
   * Empresas" de la ficha de Persona.
   * @param {string} personaId ID de la Persona.
   * @return {Promise<Object[]>} Lista de relaciones laborales.
   */
  async listarPorPersona(personaId) {
    if (!personaId) {
      throw new AppError(400, "personaId es obligatorio.");
    }
    const relaciones = await relacionLaboralRepository.listByPersona(
        personaId,
    );
    return relaciones.sort(
        (a, b) => this._aFecha(b.fechaInicio) - this._aFecha(a.fechaInicio),
    );
  }

  /**
   * Crea la relación laboral INICIAL de una Persona recién creada. Uso
   * exclusivo desde personaService.crearPersona (y el script de
   * migración): no valida "una sola activa" contra otras relaciones
   * porque la Persona es nueva y no puede tener ninguna todavía.
   * Solo 'cargo' es obligatorio (ver _validarCargoInicial) —
   * tipoRelacion/tipoContrato quedan null si no vienen, para completarse
   * después editando la Persona/RelaciónLaboral fuera del wizard.
   * @param {string} personaId ID de la Persona ya creada.
   * @param {Object} payload Datos de la relación laboral inicial.
   * @return {Promise<Object>} La relación laboral creada.
   */
  async crearRelacionInicial(personaId, payload) {
    const {
      empresaId, tipoRelacion, cargo, tipoContrato, jornada, fechaInicio,
    } = payload;
    this._validarCargoInicial({cargo});
    const fechaInicioDate = fechaInicio ?
        this._parseFecha(fechaInicio, "fechaInicio") : new Date();

    return relacionLaboralRepository.create({
      personaId,
      empresaId,
      tipoRelacion: tipoRelacion ? tipoRelacion.trim() : null,
      cargo: cargo.trim(),
      tipoContrato: tipoContrato ? tipoContrato.trim() : null,
      jornada: jornada ? jornada.trim() : null,
      fechaInicio: fechaInicioDate,
      fechaTermino: null,
      estado: "activa",
    });
  }

  /**
   * Cambia la Empresa activa de una Persona (RN-063): en una única
   * transacción de Firestore, cierra la relación laboral activa actual
   * (si existe, `estado: "finalizada"`, `fechaTermino: ahora`) y crea la
   * nueva relación activa, actualizando el denormalizado de Persona
   * (`empresaId`/`empresaActivaId`/`cargoActivo`). RN-041b queda
   * garantizado por construcción: la transacción nunca deja más de una
   * relación "activa" a la vez para esta Persona.
   * @param {string} personaId ID de la Persona.
   * @param {Object} payload Datos de la nueva relación laboral.
   * @param {Object} actor Usuario autenticado que ejecuta la acción.
   * @return {Promise<Object>} La nueva relación laboral, ya activa.
   */
  async cambiarEmpresa(personaId, payload, actor) {
    const persona = await personaRepository.getById(personaId);
    if (!persona) {
      throw new AppError(404, "Persona no encontrada.");
    }
    if (persona.anonimizada === true) {
      throw new AppError(
          409, "La Persona fue anonimizada: no admite cambios de Empresa.",
      );
    }

    const {
      empresaId, tipoRelacion, cargo, tipoContrato, jornada, fechaInicio,
    } = payload;
    if (!empresaId) {
      throw new AppError(400, "empresaId es obligatorio.");
    }
    this._validarCamposRelacion({tipoRelacion, cargo, tipoContrato});
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

    const cargoTrim = cargo.trim();
    const nuevaRef = db.collection(relacionLaboralRepository.COLLECTION).doc();
    const personaRef = db.collection("personas").doc(personaId);

    const empresaAnteriorId = persona.empresaId || null;
    const cargoAnterior = persona.cargoActivo || null;
    let relacionAnteriorId = null;

    await db.runTransaction(async (transaction) => {
      const activaQuery = db
          .collection(relacionLaboralRepository.COLLECTION)
          .where("personaId", "==", personaId)
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
        personaId,
        empresaId,
        tipoRelacion: tipoRelacion.trim(),
        cargo: cargoTrim,
        tipoContrato: tipoContrato.trim(),
        jornada: jornada ? jornada.trim() : null,
        fechaInicio: fechaInicioDate,
        fechaTermino: null,
        estado: "activa",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(personaRef, {
        empresaId,
        empresaActivaId: empresaId,
        cargoActivo: cargoTrim,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // Persona es catálogo global (sin mandanteId) — mismo criterio que
    // Requerimiento: el evento queda registrado igual, aunque los roles
    // con alcance forzado por mandante (mandante_admin/lector) no lo
    // verán en su feed de bitácora filtrado por mandanteId.
    await bitacoraLogger.registrarEvento({
      mandanteId: null,
      entidad: "persona",
      entidadId: personaId,
      accion: "cambio_empresa",
      actor,
      detalle: {
        empresaAnteriorId,
        empresaNuevaId: empresaId,
        cargoAnterior,
        cargoNuevo: cargoTrim,
        relacionLaboralAnteriorId: relacionAnteriorId,
        relacionLaboralNuevaId: nuevaRef.id,
      },
    });

    return relacionLaboralRepository.getById(nuevaRef.id);
  }
}

module.exports = new RelacionLaboralService();
