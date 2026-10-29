const {FieldValue} = require("firebase-admin/firestore");
const revisionRepository =
    require("../repositories/revisionRequerimientoIARepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const expedienteService = require("./expedienteService");
const evaluacionService = require("./evaluacionService");
const requerimientoReglaIAService = require("./requerimientoReglaIAService");
const {ORIGENES} = require("./registroConsumoIAService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {aFecha, hoySantiago} = require("../utils/vencimientos");
const AppError = require("../utils/AppError");
const {estadoIADe} = require("../reglasIA/estadoIA");
const {propuestaEvaluacion} = require("../reglasIA/propuesta");
const {RESULTADOS_PROPUESTOS} = require("../reglasIA/resultado");

// "Revisar con IA" y confirmar o descartar: superadmin y evaluador. Los
// roles de Mandante no ven nada de esta funcionalidad.
const ROLES = ["superadmin", "evaluador"];
const ESTADOS = ["propuesta", "confirmada", "descartada"];
const ENTIDAD_BITACORA = "revisionesRequerimientoIA";

const aISO = (v) => aFecha(v)?.toISOString() || null;
const fechaDe = (v) => aFecha(v)?.toISOString().slice(0, 10) || null;

/**
 * Revisión IA de un requisito del expediente con las reglas de su
 * requerimiento (solo requerimientos con IA habilitada). La IA propone; el
 * evaluador aplica la propuesta al formulario y guarda la evaluación como
 * siempre (la revisión pasa a "confirmada" en la misma transacción), o la
 * descarta.
 */
class RevisionRequerimientoIAService {
  /**
   * Exige superadmin o evaluador.
   * @param {Object} actor Usuario autenticado.
   */
  _exigirRol(actor) {
    if (!ROLES.includes(actor?.rol)) {
      throw new AppError(403, "Solo superadmin y evaluador usan la " +
          "revisión IA por requerimiento.");
    }
  }

  /**
   * Nombre del actor para auditoría.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<string>} Nombre.
   */
  async _nombre(actor) {
    const u = await usuarioRepository.getById(actor.uid).catch(() => null);
    return u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() :
      actor.email || actor.uid;
  }

  /**
   * Forma pública de una revisión.
   * @param {Object} r Revisión.
   * @return {Object} Revisión.
   */
  _publica(r) {
    return {...r, createdAt: aISO(r.createdAt),
      resueltaAt: aISO(r.resueltaAt)};
  }

  /**
   * Contexto automático: persona o recurso, empresa, proyecto y fecha de
   * evaluación (hoy en Santiago). El evaluador no ingresa nada.
   * @param {Object} expediente Expediente.
   * @param {Object} instancia Requisito del expediente.
   * @param {Object} req Requerimiento.
   * @return {Promise<Object>} Contexto.
   */
  async _contextoAuto(expediente, instancia, req) {
    const [persona, recurso, empresa, proyecto] = await Promise.all([
      instancia.personaId ? personaRepository.getById(instancia.personaId) :
        null,
      instancia.recursoId ? recursoRepository.getById(instancia.recursoId) :
        null,
      expediente.empresaId ? empresaRepository.getById(expediente.empresaId) :
        null,
      expediente.proyectoId ?
        proyectoRepository.getById(expediente.proyectoId) : null,
    ]);
    const ctx = {fechaEvaluacion: hoySantiago()};
    if (req.tipoEntidad === "empresa") {
      if (empresa?.rut) ctx.rut = empresa.rut;
    } else if (persona) {
      if (persona.rut) ctx.rut = persona.rut;
      const nombre = `${persona.nombre || ""} ${persona.apellido || ""}`
          .trim();
      if (nombre) ctx.nombre = nombre;
    }
    if (recurso?.patente) ctx.patente = recurso.patente;
    if (empresa?.rut) ctx.rutEmpresa = empresa.rut;
    const termino = fechaDe(proyecto?.fechaTerminoReprogramada) ||
      fechaDe(proyecto?.fechaTermino);
    if (termino) ctx.fechaTerminoProyecto = termino;
    return ctx;
  }

  /**
   * Estado para la planilla: qué requerimientos del expediente tienen la IA
   * habilitada y la última propuesta pendiente de cada requisito.
   * @param {string} expedienteId ID del expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{requerimientosHabilitados: Array<string>,
   *     propuestas: Array<Object>}>} Estado.
   */
  async estado(expedienteId, actor) {
    this._exigirRol(actor);
    await expedienteService.getExpedienteById(expedienteId, actor);
    const [instancias, revisiones] = await Promise.all([
      expedienteRequerimientoRepository.listByExpediente(expedienteId,
          "activo"),
      revisionRepository.listByExpediente(expedienteId),
    ]);
    const reqs = await requerimientoRepository.getByIds(
        instancias.map((i) => i.requerimientoId));
    const vistas = new Set();
    const propuestas = revisiones.filter((r) => {
      if (r.estado !== "propuesta" || vistas.has(r.expedienteRequerimientoId)) {
        return false;
      }
      vistas.add(r.expedienteRequerimientoId);
      return true;
    });
    return {
      requerimientosHabilitados: reqs.filter((r) =>
        estadoIADe(r) === "habilitado").map((r) => r.id),
      propuestas: propuestas.map((r) => this._publica(r)),
    };
  }

  /**
   * "Revisar con IA": una llamada al modelo con los archivos del sujeto
   * (anverso y reverso), las reglas vigentes del requerimiento (congeladas
   * en `reglasSnapshot`) y el contexto automático. Las propuestas anteriores
   * del mismo requisito quedan descartadas.
   * @param {string} expedienteId ID del expediente.
   * @param {Object} payload {expedienteRequerimientoId, archivos, origen}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Revisión creada.
   */
  async revisar(expedienteId, payload, actor) {
    this._exigirRol(actor);
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    const instancia = await expedienteRequerimientoRepository.getById(
        String(payload?.expedienteRequerimientoId || ""));
    if (!instancia || instancia.expedienteId !== expedienteId) {
      throw new AppError(404, "El requisito no pertenece a este expediente.");
    }
    evaluacionService.exigirInstanciaEvaluable(expediente, instancia);
    const req = await requerimientoRepository.getById(
        instancia.requerimientoId);
    if (!req || estadoIADe(req) !== "habilitado") {
      throw new AppError(409, "Este requerimiento no tiene la revisión IA " +
          "habilitada.");
    }
    const piezas = requerimientoReglaIAService._piezas(payload?.archivos);
    const contexto = await this._contextoAuto(expediente, instancia, req);
    const nombreActor = await this._nombre(actor);
    const archivos = requerimientoReglaIAService._metaArchivos(piezas);
    const origen = payload?.origen === "manual" ? "manual" : "carpeta_local";
    const base = {
      mandanteId: expediente.mandanteId || null, expedienteId,
      expedienteRequerimientoId: instancia.id,
      requerimientoId: instancia.requerimientoId,
      requerimientoNombre: req.nombreCorto || req.nombre,
      empresaId: instancia.empresaId || expediente.empresaId || null,
      personaId: instancia.personaId || null,
      recursoId: instancia.recursoId || null,
      archivo: {origen, rutaRelativa: archivos[0].rutaRelativa,
        nombre: archivos.map((a) => a.nombre).join(" + ").slice(0, 500),
        tamano: archivos.reduce((s, a) => s + a.tamanoBytes, 0),
        fechaModificacion: archivos[0].ultimaModificacion},
      archivos, contextoUsado: contexto, evaluacionId: null,
      createdBy: actor.uid, createdByNombre: nombreActor,
      resueltaAt: null, resueltaBy: null,
    };
    // Si el modelo responde mal tras reintentar, el costo queda registrado
    // en una revisión descartada con el error.
    const consumo = (registro, ejecucion) =>
      requerimientoReglaIAService.registrarConsumo({
        origen: ORIGENES.REVISION_REQUERIMIENTO,
        coleccion: revisionRepository.COLLECTION, registro, ejecucion,
        actor});
    const r = await requerimientoReglaIAService.ejecutarReglas(req, piezas,
        contexto, async (f) => consumo(await revisionRepository.create({...base,
          tipoDocumentalId: f.tipo.id, reglasSnapshot: f.snapshot,
          camposExtraidos: null, resultadosReglas: [],
          resultadoPropuesto: null, observacionesPropuestas: null,
          propuestaEvaluacion: null, modelo: f.modelo,
          tokensEntrada: f.tokensEntrada, tokensSalida: f.tokensSalida,
          costoEstimado: f.costoEstimado, estado: "descartada",
          error: f.mensaje, resueltaAt: FieldValue.serverTimestamp(),
          resueltaBy: actor.uid}), f));
    const propuesta = propuestaEvaluacion({
      resultadoPropuesto: r.resultadoPropuesto,
      resultadosReglas: r.resultadosReglas, camposExtraidos: r.camposExtraidos,
      requiereVencimiento: Boolean(instancia.requiereVencimiento),
      umbralConfianza: r.umbralConfianza,
    });
    const anteriores = (await revisionRepository.listByExpediente(expedienteId))
        .filter((x) => x.expedienteRequerimientoId === instancia.id &&
          x.estado === "propuesta");
    await Promise.all(anteriores.map((x) => revisionRepository.update(x.id, {
      estado: "descartada", motivoDescarte: "reemplazada",
      resueltaAt: FieldValue.serverTimestamp(), resueltaBy: actor.uid})));
    const revision = await revisionRepository.create({...base,
      tipoDocumentalId: r.tipo.id, reglasSnapshot: r.snapshot,
      camposExtraidos: r.camposExtraidos, resultadosReglas: r.resultadosReglas,
      resultadoPropuesto: r.resultadoPropuesto,
      observacionesPropuestas: propuesta.observaciones,
      propuestaEvaluacion: propuesta, umbralConfianza: r.umbralConfianza,
      modelo: r.modelo, tokensEntrada: r.tokensEntrada,
      tokensSalida: r.tokensSalida, costoEstimado: r.costoEstimado,
      intentos: r.intentos, latenciaMs: r.latenciaMs, estado: "propuesta",
      error: null});
    await consumo(revision, r);
    await bitacoraLogger.registrarEvento({
      mandanteId: base.mandanteId, entidad: ENTIDAD_BITACORA,
      entidadId: revision.id, accion: "creada", actor,
      detalle: {expedienteId, expedienteRequerimientoId: instancia.id,
        requerimientoId: instancia.requerimientoId,
        resultado: r.resultadoPropuesto.resultado,
        archivos: archivos.length, costoEstimado: r.costoEstimado,
        reemplazadas: anteriores.map((x) => x.id)},
    });
    return this._publica(revision);
  }

  /**
   * "Descartar": la propuesta queda descartada (no se borra).
   * @param {string} revisionId ID de la revisión.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Revisión actualizada.
   */
  async descartar(revisionId, actor) {
    this._exigirRol(actor);
    const revision = await revisionRepository.getById(revisionId);
    if (!revision) throw new AppError(404, "Revisión no encontrada.");
    await expedienteService.getExpedienteById(revision.expedienteId, actor);
    if (revision.estado !== "propuesta") {
      throw new AppError(409, "La revisión ya fue resuelta.");
    }
    const actualizada = await revisionRepository.update(revisionId, {
      estado: "descartada", motivoDescarte: "evaluador",
      resueltaAt: FieldValue.serverTimestamp(), resueltaBy: actor.uid});
    await bitacoraLogger.registrarEvento({
      mandanteId: revision.mandanteId, entidad: ENTIDAD_BITACORA,
      entidadId: revisionId, accion: "descartada", actor,
      detalle: {expedienteId: revision.expedienteId,
        expedienteRequerimientoId: revision.expedienteRequerimientoId},
    });
    return this._publica(actualizada);
  }

  /**
   * Revisiones del expediente, con filtros, el nombre del sujeto y quién
   * resolvió.
   * @param {string} expedienteId ID del expediente.
   * @param {Object} filtros {estado, resultado}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Array<Object>>} Revisiones.
   */
  async listar(expedienteId, filtros, actor) {
    this._exigirRol(actor);
    await expedienteService.getExpedienteById(expedienteId, actor);
    const {estado, resultado} = filtros || {};
    if (estado && !ESTADOS.includes(estado)) {
      throw new AppError(400, "Estado no válido.");
    }
    if (resultado && !RESULTADOS_PROPUESTOS.includes(resultado)) {
      throw new AppError(400, "Resultado no válido.");
    }
    const revisiones = (await revisionRepository.listByExpediente(
        expedienteId)).filter((r) => (!estado || r.estado === estado) &&
      (!resultado || r.resultadoPropuesto?.resultado === resultado));
    const [personas, recursos] = await Promise.all([
      personaRepository.getByIds(revisiones.map((r) => r.personaId)),
      recursoRepository.getByIds(revisiones.map((r) => r.recursoId)),
    ]);
    const nombrePersona = new Map(personas.map((p) => [p.id,
      `${p.nombre || ""} ${p.apellido || ""}`.trim()]));
    const nombreRecurso = new Map(recursos.map((x) => [x.id,
      [x.nombre, x.patente].filter(Boolean).join(" · ")]));
    return revisiones.map((r) => ({...this._publica(r),
      sujetoNombre: r.personaId ? nombrePersona.get(r.personaId) || null :
        r.recursoId ? nombreRecurso.get(r.recursoId) || null : "Empresa"}));
  }

  /**
   * Valida una revisión que se confirma al guardar una evaluación (lo usa
   * evaluacionService antes de su transacción).
   * @param {string} revisionId ID de la revisión.
   * @param {string} expedienteRequerimientoId Requisito evaluado.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Revisión.
   */
  async validarParaConfirmar(revisionId, expedienteRequerimientoId, actor) {
    this._exigirRol(actor);
    const revision = await revisionRepository.getById(String(revisionId));
    if (!revision ||
        revision.expedienteRequerimientoId !== expedienteRequerimientoId) {
      throw new AppError(400, "La revisión IA no corresponde a este " +
          "requisito.");
    }
    if (revision.estado !== "propuesta") {
      throw new AppError(409, "La revisión IA ya fue confirmada o " +
          "descartada; vuelva a revisar con IA o guarde sin propuesta.");
    }
    return revision;
  }
}

module.exports = new RevisionRequerimientoIAService();
module.exports.ESTADOS = ESTADOS;
