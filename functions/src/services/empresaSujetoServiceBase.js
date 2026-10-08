const admin = require("firebase-admin");
const {FieldValue} = require("firebase-admin/firestore");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {
  puedeVerEmpresa, puedeVerSujeto, filtrarRelacionesVisibles,
} = require("../utils/alcanceMandante");
const AppError = require("../utils/AppError");

const db = admin.firestore();
const ROLES_MANDANTE = ["mandante_admin", "mandante_lector"];

// Mensaje único cuando un rol de Mandante intenta terminar o cambiar una
// relación de alguien con asignaciones vigentes en proyectos de otro
// Mandante: no revela Mandante, Proyecto ni Empresa.
const MENSAJE_FUERA_DE_ALCANCE =
    "Tiene asignaciones vigentes fuera de su alcance: esta operación debe " +
    "gestionarla un administrador de la plataforma.";

/**
 * Reglas compartidas de empresaPersonas y empresaRecursos: la relación de
 * una Persona o un Recurso con una Empresa es la única fuente de verdad de
 * su "empresa actual" (y "cargo actual" de la Persona). Una sola relación
 * activa por sujeto; terminar fija fechaTermino y estado, sin borrado
 * físico, y el historial se conserva.
 *
 * Terminar o cambiar la relación cuando el sujeto tiene asignaciones
 * activas en proyectos con esa Empresa: responde 409
 * CONFIRMACION_REQUERIDA con la lista; con `confirmado: true` las
 * finaliza. Un rol de Mandante no puede hacerlo si alguna asignación es de
 * otro Mandante (403, sin revelar datos).
 */
class EmpresaSujetoService {
  /**
   * @param {"persona"|"recurso"} tipo Tipo de sujeto.
   * @param {Object} repo empresaPersonaRepository o empresaRecursoRepository.
   */
  constructor(tipo, repo) {
    this.tipo = tipo;
    this.repo = repo;
    this.campo = tipo === "persona" ? "personaId" : "recursoId";
    this.entidad = tipo === "persona" ? "persona" : "recurso";
    this.etiqueta = tipo === "persona" ? "Persona" : "Maquinaria";
  }

  /**
   * Servicio de asignaciones del sujeto (require diferido: evita ciclos).
   * @return {Object} participacionPersonaService o participacionRecursoService.
   */
  _asignaciones() {
    return this.tipo === "persona" ?
      require("./participacionPersonaService") :
      require("./participacionRecursoService");
  }

  /**
   * Repositorio del sujeto (require diferido: evita ciclos).
   * @return {Object} personaRepository o recursoRepository.
   */
  _sujetoRepo() {
    return this.tipo === "persona" ?
      require("../repositories/personaRepository") :
      require("../repositories/recursoRepository");
  }

  /**
   * Parsea y valida una fecha recibida del cliente.
   * @param {*} valor Valor.
   * @param {string} nombreCampo Campo, para el mensaje.
   * @return {Date} Fecha.
   */
  _parseFecha(valor, nombreCampo) {
    const fecha = new Date(valor);
    if (isNaN(fecha.getTime())) {
      throw new AppError(400, `${nombreCampo} no es una fecha válida.`);
    }
    return fecha;
  }

  /**
   * Campos de la relación según el tipo. `estricto` (cambio de empresa)
   * exige los campos completos; el alta inicial solo los mínimos.
   * @param {Object} payload Datos recibidos.
   * @param {boolean} estricto true para cambio de empresa.
   * @return {Object} Campos normalizados.
   */
  camposRelacion(payload, estricto) {
    const t = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
    if (this.tipo === "persona") {
      const campos = {
        tipoRelacion: t(payload.tipoRelacion),
        cargo: t(payload.cargo),
        tipoContrato: t(payload.tipoContrato),
        jornada: t(payload.jornada),
      };
      if (!campos.cargo) {
        throw new AppError(400, "El campo 'cargo' es requerido.");
      }
      if (estricto && (!campos.tipoRelacion || !campos.tipoContrato)) {
        throw new AppError(
            400, "Los campos 'tipoRelacion' y 'tipoContrato' son requeridos.",
        );
      }
      return campos;
    }
    const campos = {tipoRelacion: t(payload.tipoRelacion)};
    if (estricto && !campos.tipoRelacion) {
      throw new AppError(400, "El campo 'tipoRelacion' es requerido.");
    }
    return campos;
  }

  /**
   * Valida la Empresa destino: existe, está activa y está en el alcance
   * del actor.
   * @param {string} empresaId ID de la Empresa.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} La Empresa.
   */
  async validarEmpresa(empresaId, actor) {
    if (!empresaId) throw new AppError(400, "empresaId es obligatorio.");
    const empresa = await empresaRepository.getById(empresaId);
    if (!empresa || !(await puedeVerEmpresa(actor, empresaId))) {
      throw new AppError(400, "La Empresa indicada no existe.");
    }
    if (empresa.estado !== "activo") {
      throw new AppError(400, "La Empresa indicada no está activa.");
    }
    return empresa;
  }

  /**
   * Prepara, para escribir dentro de una transacción, una relación activa.
   * @param {string} sujetoId personaId o recursoId.
   * @param {string} empresaId ID de la Empresa.
   * @param {Object} campos Campos de la relación (ver camposRelacion).
   * @param {?Date} fechaInicio Fecha de inicio (por defecto ahora).
   * @return {{ref: Object, data: Object}} Alta lista para tx.set.
   */
  prepararAlta(sujetoId, empresaId, campos, fechaInicio) {
    return {
      ref: this.repo.coleccion().doc(),
      data: this.repo.datosAlta({
        [this.campo]: sujetoId,
        empresaId,
        ...campos,
        fechaInicio: fechaInicio || new Date(),
        fechaTermino: null,
        estado: "activa",
      }),
    };
  }

  /**
   * Historial de relaciones de un sujeto visible para el actor: los roles
   * de Mandante solo ven las de Empresas de su alcance. Cada relación trae
   * el nombre de la Empresa.
   * @param {string} sujetoId personaId o recursoId.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Relaciones, más recientes primero.
   */
  async listarPorSujeto(sujetoId, actor) {
    if (!(await puedeVerSujeto(actor, this.tipo, sujetoId))) {
      throw new AppError(404, `${this.etiqueta} no encontrada.`);
    }
    const visibles = await filtrarRelacionesVisibles(
        actor, await this.repo.listBySujeto(sujetoId),
    );
    return Promise.all(visibles.map(async (r) => ({
      ...r,
      empresaNombre: (await empresaRepository.getById(r.empresaId))
          ?.razonSocial || null,
    })));
  }

  /**
   * Relación activa del sujeto si el actor puede ver su Empresa; si es con
   * una Empresa fuera de su alcance, null (no se muestra empresa ni cargo).
   * @param {string} sujetoId personaId o recursoId.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<?Object>} Relación activa visible.
   */
  async relacionActualVisible(sujetoId, actor) {
    const activa = await this.repo.getActivaBySujeto(sujetoId);
    if (!activa) return null;
    return (await puedeVerEmpresa(actor, activa.empresaId)) ? activa : null;
  }

  /**
   * Asignaciones activas del sujeto en Proyectos con una Empresa, con el
   * nombre del Proyecto para la confirmación.
   * @param {string} sujetoId personaId o recursoId.
   * @param {string} empresaId ID de la Empresa.
   * @return {Promise<Object[]>} Documentos de asignación activos.
   */
  async _asignacionesConEmpresa(sujetoId, empresaId) {
    const docs = await this._asignaciones().repo.list({
      [this.campo]: sujetoId, empresaId, estado: "activa",
    });
    return docs;
  }

  /**
   * Regla F: un rol de Mandante no puede terminar ni cambiar la relación
   * si alguna asignación vigente es de otro Mandante.
   * @param {Object[]} asignaciones Asignaciones activas afectadas.
   * @param {Object} actor Usuario autenticado.
   * @return {void}
   */
  _verificarAlcanceAsignaciones(asignaciones, actor) {
    if (!ROLES_MANDANTE.includes(actor.rol)) return;
    if (asignaciones.some((a) => a.mandanteId !== actor.mandanteId)) {
      throw new AppError(403, MENSAJE_FUERA_DE_ALCANCE,
          {codigo: "FUERA_DE_ALCANCE"});
    }
  }

  /**
   * Exige confirmación explícita si hay asignaciones que se finalizarán o,
   * en un cambio de empresa, si se terminará una relación vigente. La
   * Empresa de esa relación solo se nombra si está en el alcance del actor.
   * @param {Object[]} asignaciones Asignaciones activas afectadas.
   * @param {boolean} confirmado Confirmación del cliente.
   * @param {string} accion Texto de la acción, para el mensaje.
   * @param {?Object} relacionActual Relación vigente que terminará (solo en
   *     cambio de empresa), o null.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<void>}
   */
  async _exigirConfirmacion(asignaciones, confirmado, accion,
      relacionActual = null, actor = null) {
    if (confirmado === true) return;
    if (asignaciones.length === 0 && !relacionActual) return;
    const proyectos = {};
    for (const a of asignaciones) {
      if (!(a.proyectoId in proyectos)) {
        // eslint-disable-next-line no-await-in-loop
        proyectos[a.proyectoId] =
            await proyectoRepository.getById(a.proyectoId);
      }
    }
    const porProyecto = [...new Set(asignaciones.map((a) => a.proyectoId))];
    const partes = [];
    let relacion;
    if (relacionActual) {
      const visible = await puedeVerEmpresa(actor, relacionActual.empresaId);
      const nombre = visible ?
          (await empresaRepository.getById(relacionActual.empresaId))
              ?.razonSocial || null :
          null;
      relacion = {
        empresaId: visible ? relacionActual.empresaId : null,
        empresaNombre: nombre,
        fueraDeAlcance: !visible,
      };
      partes.push(nombre ?
        `terminará su relación vigente con ${nombre}` :
        "terminará su relación vigente con otra empresa");
    }
    if (porProyecto.length > 0) {
      partes.push(`finalizará sus asignaciones activas en ` +
          `${porProyecto.length} proyecto(s)`);
    }
    throw new AppError(
        409,
        // Sin doble punto si la razón social termina en "." (ej. "Ltda.").
        `${accion} ${partes.join(" y ")}.`.replace(/\.\.$/, ".") +
        " Confirme para continuar.",
        {
          codigo: "CONFIRMACION_REQUERIDA",
          detalle: {
            ...(relacion ? {relacionActual: relacion} : {}),
            asignaciones: porProyecto.map((proyectoId) => ({
              proyectoId,
              proyectoNombre: proyectos[proyectoId]?.nombre || proyectoId,
              participacionId: asignaciones.find(
                  (a) => a.proyectoId === proyectoId,
              ).participacionId,
            })),
          },
        },
    );
  }

  /**
   * Cambia la Empresa del sujeto (o le crea su primera relación si no
   * tiene una activa): en una transacción finaliza la relación activa y
   * crea la nueva. Si hay una relación vigente (con cualquier Empresa) pide
   * confirmación avisando que terminará, sin nombrar la Empresa si está
   * fuera del alcance del actor; si además tenía asignaciones activas, las
   * lista y al confirmar las finaliza.
   * @param {string} sujetoId personaId o recursoId.
   * @param {Object} payload empresaId, campos de la relación, fechaInicio,
   *     confirmado.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} La nueva relación activa.
   */
  async cambiarEmpresa(sujetoId, payload, actor) {
    const {empresaId} = payload;
    // Sin exigir alcance sobre el sujeto: así un rol de Mandante puede
    // relacionar con su Empresa a una Persona ya registrada en otra
    // (identificación existente). Sí debe existir y no estar anonimizada.
    const sujeto = await this._sujetoRepo().getById(sujetoId);
    if (!sujeto || sujeto.anonimizada === true) {
      throw new AppError(404, `${this.etiqueta} no encontrada.`);
    }
    const empresa = await this.validarEmpresa(empresaId, actor);
    const campos = this.camposRelacion(payload, true);
    const fechaInicio = payload.fechaInicio ?
        this._parseFecha(payload.fechaInicio, "fechaInicio") : new Date();

    const actual = await this.repo.getActivaBySujeto(sujetoId);
    if (actual?.empresaId === empresaId) {
      throw new AppError(
          409,
          `La ${this.etiqueta} ya tiene una relación activa con esa ` +
          "Empresa.",
          {codigo: "RELACION_EXISTENTE"},
      );
    }
    const asignaciones = actual ?
        await this._asignacionesConEmpresa(sujetoId, actual.empresaId) : [];
    this._verificarAlcanceAsignaciones(asignaciones, actor);
    await this._exigirConfirmacion(asignaciones, payload.confirmado,
        "Cambiar de empresa", actual, actor);

    const alta = this.prepararAlta(sujetoId, empresaId, campos, fechaInicio);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(this.repo.queryActivaSujeto(sujetoId));
      snap.docs.forEach((d) => tx.update(d.ref, {
        estado: "finalizada",
        fechaTermino: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }));
      tx.set(alta.ref, alta.data);
    });
    await this._asignaciones().finalizarDocumentos(asignaciones, actor);

    await bitacoraLogger.registrarEvento({
      mandanteId: actor.mandanteId || null,
      entidad: this.entidad,
      entidadId: sujetoId,
      accion: "cambio_empresa",
      actor,
      detalle: {
        empresaAnteriorId: actual?.empresaId || null,
        empresaNuevaId: empresaId,
        empresaNuevaNombre: empresa.razonSocial,
        relacionAnteriorId: actual?.id || null,
        relacionNuevaId: alta.ref.id,
        asignacionesFinalizadas: asignaciones.length,
      },
    });
    return this.repo.getById(alta.ref.id);
  }

  /**
   * Termina la relación activa del sujeto (sin crear otra). Si tiene
   * asignaciones activas con esa Empresa, pide confirmación y al
   * confirmarla las finaliza.
   * @param {string} sujetoId personaId o recursoId.
   * @param {{confirmado: (boolean|undefined),
   *     fechaTermino: (string|undefined)}} payload Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} La relación terminada.
   */
  async terminarRelacion(sujetoId, payload, actor) {
    const actual = await this.repo.getActivaBySujeto(sujetoId);
    if (!actual || !(await puedeVerEmpresa(actor, actual.empresaId))) {
      throw new AppError(404, "No tiene una relación activa que terminar.");
    }
    const fechaTermino = payload?.fechaTermino ?
        this._parseFecha(payload.fechaTermino, "fechaTermino") : new Date();
    const asignaciones =
        await this._asignacionesConEmpresa(sujetoId, actual.empresaId);
    this._verificarAlcanceAsignaciones(asignaciones, actor);
    await this._exigirConfirmacion(asignaciones, payload?.confirmado,
        "Terminar la relación");

    const terminada = await this.repo.update(actual.id, {
      estado: "finalizada", fechaTermino,
    });
    await this._asignaciones().finalizarDocumentos(asignaciones, actor);
    await bitacoraLogger.registrarEvento({
      mandanteId: actor.mandanteId || null,
      entidad: this.entidad,
      entidadId: sujetoId,
      accion: "relacion_terminada",
      actor,
      detalle: {
        empresaId: actual.empresaId,
        relacionId: actual.id,
        asignacionesFinalizadas: asignaciones.length,
      },
    });
    return terminada;
  }
}

module.exports = EmpresaSujetoService;
module.exports.MENSAJE_FUERA_DE_ALCANCE = MENSAJE_FUERA_DE_ALCANCE;
