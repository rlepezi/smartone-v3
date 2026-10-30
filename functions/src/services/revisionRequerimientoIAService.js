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
const {motivoNoConfirmable} = require("../reglasIA/lote");

// "Revisar con IA" y confirmar o descartar: superadmin y evaluador. Los
// roles de Mandante no ven nada de esta funcionalidad.
const ROLES = ["superadmin", "evaluador"];
const ESTADOS = ["propuesta", "confirmada", "descartada"];
const ENTIDAD_BITACORA = "revisionesRequerimientoIA";
// Revisión en lote: máximo de requisitos por estimación y por confirmación.
const MAX_LOTE = 300;
const MAX_CONFIRMAR = 200;
const RE_LOTE = /^[A-Za-z0-9_-]{1,64}$/;

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
   * Pauta de validación de cada requerimiento del expediente, para el ícono
   * IA de la planilla y el panel "modo requerimiento": estado IA, tipo
   * documental y reglas ACTIVAS en su orden (con severidad, parámetros
   * efectivos e instrucción). Solo lectura: la ven todos los que leen el
   * expediente (las reglas también guían la revisión manual).
   * @param {string} expedienteId ID del expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{pautas: Object}>} {pautas: {requerimientoId: {estadoIA,
   *     tipo, reglas}}}.
   */
  async pautas(expedienteId, actor) {
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    const instancias = await expedienteRequerimientoRepository
        .listByExpediente(expedienteId, "activo");
    const reqs = await requerimientoRepository.getByIds(
        [...new Set(instancias.map((i) => i.requerimientoId))]);
    const pautas = {};
    // Tipo de cada requerimiento: el del documento de la plantilla vinculado
    // (catálogo y plantilla se leen una vez).
    const datosTipo = await requerimientoReglaIAService._datosTipo(
        expediente.mandanteId);
    await Promise.all(reqs.map(async (req) => {
      const [tipo, items] = await Promise.all([
        requerimientoReglaIAService._tipo(req, datosTipo),
        requerimientoReglaIAService._vinculos(req.id),
      ]);
      const reglas = requerimientoReglaIAService._aplicables(items)
          .map((i) => i.snapshot)
          .sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999))
          .map((s) => ({vinculoId: s.vinculoId, reglaId: s.reglaId,
            nombre: s.nombre, tipo: s.tipo, severidad: s.severidad,
            verificacion: s.verificacion, parametros: s.parametros || {},
            instruccionIA: s.instruccionIA || null}));
      pautas[req.id] = {
        estadoIA: estadoIADe(req),
        tipo: tipo ? {codigo: tipo.codigo, nombre: tipo.nombre} : null,
        reglas,
      };
    }));
    return {pautas};
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
    // Revisión en lote: solo con Carpeta de empresa (los expedientes con la
    // configuración anterior esperan la migración).
    const lote = payload?.lote === true;
    const loteId = lote ? String(payload?.loteId || "") : null;
    if (lote) {
      this._exigirCarpetaEmpresa(expediente);
      if (!RE_LOTE.test(loteId)) {
        throw new AppError(400, "Identificador de lote no válido.");
      }
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
      modo: lote ? "lote" : "individual", loteId,
      createdBy: actor.uid, createdByNombre: nombreActor,
      resueltaAt: null, resueltaBy: null,
    };
    // Si el modelo responde mal tras reintentar, el costo queda registrado
    // en una revisión descartada con el error.
    const consumo = (registro, ejecucion) =>
      requerimientoReglaIAService.registrarConsumo({
        origen: lote ? ORIGENES.REVISION_LOTE :
          ORIGENES.REVISION_REQUERIMIENTO,
        coleccion: revisionRepository.COLLECTION, registro, ejecucion,
        actor});
    const r = await requerimientoReglaIAService.ejecutarReglas(req, piezas,
        contexto, async (f) => consumo(await revisionRepository.create({...base,
          tipoDocumentalId: f.tipo?.id || null, reglasSnapshot: f.snapshot,
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
      tipoDocumentalId: r.tipo?.id || null,
      camposSolicitados: r.camposSolicitados, reglasSnapshot: r.snapshot,
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
        reemplazadas: anteriores.map((x) => x.id),
        ...(lote ? {modo: "lote", loteId} : {})},
    });
    return this._publica(revision);
  }

  /**
   * La revisión en lote exige que el expediente tenga Carpeta de empresa.
   * @param {Object} expediente Expediente.
   */
  _exigirCarpetaEmpresa(expediente) {
    if (!expediente?.repositorioDocumental?.carpetaEmpresaId) {
      throw new AppError(409, "La revisión en lote requiere que el " +
          "expediente tenga su Carpeta de empresa vinculada (pestaña " +
          "Documentación).");
    }
  }

  /**
   * Antes de ejecutar un lote: documentos por entidad, costo estimado y el
   * límite de gasto mensual. No llama a la IA ni escribe nada.
   * @param {string} expedienteId ID del expediente.
   * @param {Object} payload {items: [{expedienteRequerimientoId, archivos:
   *     [{mime, paginas?}]}]}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {documentos, archivos, porEntidad,
   *     costoEstimadoUsd, modelos, faltanPrecios, limiteMensualUsd,
   *     gastoMesUsd, disponibleUsd, alcanza}.
   */
  async estimarLote(expedienteId, payload, actor) {
    this._exigirRol(actor);
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    this._exigirCarpetaEmpresa(expediente);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length || items.length > MAX_LOTE) {
      throw new AppError(400, `Indique entre 1 y ${MAX_LOTE} requisitos.`);
    }
    const instancias = await expedienteRequerimientoRepository
        .listByExpediente(expedienteId, "activo");
    const porId = new Map(instancias.map((i) => [i.id, i]));
    const reqs = new Map((await requerimientoRepository.getByIds(
        [...new Set(instancias.map((i) => i.requerimientoId))]))
        .map((r) => [r.id, r]));
    // Diferidos: este servicio lo cargan módulos que no usan el lote.
    /* eslint-disable global-require */
    const aiConfigService = require("./aiConfigService");
    const costoService = require("./costoService");
    /* eslint-enable global-require */
    const [params, {gastoUsd}] = await Promise.all([
      aiConfigService.obtenerParametros(), aiConfigService.gastoMes()]);
    const porEntidad = {empresa: 0, persona: 0, recurso: 0};
    const modelos = new Set();
    const faltanPrecios = new Set();
    let costo = 0;
    let archivosTotal = 0;
    items.forEach((it) => {
      const instancia = porId.get(String(it?.expedienteRequerimientoId || ""));
      if (!instancia) {
        throw new AppError(400, "Un requisito no pertenece a este " +
            "expediente o no está activo.");
      }
      const req = reqs.get(instancia.requerimientoId);
      if (!req || estadoIADe(req) !== "habilitado") {
        throw new AppError(409, `«${instancia.nombreCorto ||
          instancia.nombre}» no tiene la revisión IA habilitada.`);
      }
      const archivos = (Array.isArray(it.archivos) ? it.archivos : [])
          .slice(0, requerimientoReglaIAService.MAX_ARCHIVOS)
          .map((a) => ({mime: String(a?.mime || ""),
            paginas: Number.isInteger(a?.paginas) && a.paginas > 0 ?
              Math.min(a.paginas, 200) : undefined}));
      if (!archivos.length) {
        throw new AppError(400, "Cada requisito necesita al menos un " +
            "archivo.");
      }
      const modelo = req.modeloPreferidoIA || params.modeloPorDefecto;
      modelos.add(modelo);
      if (costoService.faltanPrecios(params.preciosPorModelo, modelo)) {
        faltanPrecios.add(modelo);
      } else {
        costo += costoService.estimar(params.preciosPorModelo, modelo,
            archivos);
      }
      archivosTotal += archivos.length;
      const entidad = instancia.personaId ? "persona" :
        instancia.recursoId ? "recurso" : "empresa";
      porEntidad[entidad]++;
    });
    const limite = params.limiteGastoMensualUsd ?? null;
    const costoEstimadoUsd = Math.round(costo * 10000) / 10000;
    return {
      documentos: items.length, archivos: archivosTotal, porEntidad,
      costoEstimadoUsd, modelos: [...modelos],
      faltanPrecios: [...faltanPrecios],
      limiteMensualUsd: limite, gastoMesUsd: gastoUsd,
      disponibleUsd: limite === null ? null :
        Math.max(0, Math.round((limite - gastoUsd) * 10000) / 10000),
      alcanza: !faltanPrecios.size &&
        (limite === null || gastoUsd + costoEstimadoUsd <= limite),
    };
  }

  /**
   * Confirmación en bloque: cada propuesta se guarda como evaluación (igual
   * que "Aplicar propuesta" + "Guardar Evaluación"). Quedan fuera las que
   * requieren revisión manual, las que no traen la fecha de vencimiento
   * obligatoria y las de requisitos evaluados después de la propuesta.
   * @param {string} expedienteId ID del expediente.
   * @param {Array<string>} revisionIds Revisiones a confirmar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{aplicadas: Object[], omitidas: Object[],
   *     errores: Object[]}>} Detalle.
   */
  async confirmarLote(expedienteId, revisionIds, actor) {
    this._exigirRol(actor);
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El expediente está cerrado.");
    }
    const ids = [...new Set((Array.isArray(revisionIds) ? revisionIds : [])
        .map(String))];
    if (!ids.length || ids.length > MAX_CONFIRMAR) {
      throw new AppError(400, `Indique entre 1 y ${MAX_CONFIRMAR} ` +
          "propuestas.");
    }
    const evaluacionRepository =
        // eslint-disable-next-line global-require
        require("../repositories/evaluacionRepository");
    const [revisiones, instancias, evaluaciones] = await Promise.all([
      Promise.all(ids.map((id) => revisionRepository.getById(id))),
      expedienteRequerimientoRepository.listByExpediente(expedienteId,
          "activo"),
      evaluacionRepository.getByExpediente(expedienteId),
    ]);
    const instanciaPorId = new Map(instancias.map((i) => [i.id, i]));
    const vigente = new Map(evaluaciones.filter((e) => e.estado === "vigente")
        .map((e) => [e.expedienteRequerimientoId, e]));
    const aplicadas = [];
    const omitidas = [];
    const errores = [];
    for (const [i, r] of revisiones.entries()) {
      const motivo = motivoNoConfirmable(r, expedienteId,
          instanciaPorId.get(r?.expedienteRequerimientoId),
          vigente.get(r?.expedienteRequerimientoId));
      if (motivo) {
        omitidas.push({revisionId: ids[i], motivo});
        continue;
      }
      const p = r.propuestaEvaluacion;
      try {
        // eslint-disable-next-line no-await-in-loop
        const evaluacion = await evaluacionService.crearEvaluacion({
          expedienteRequerimientoId: r.expedienteRequerimientoId,
          resultado: p.resultado, observaciones: p.observaciones || null,
          fechaVencimiento: p.fechaVencimiento || null,
          revisionIAId: r.id}, actor);
        aplicadas.push({revisionId: r.id,
          evaluacionId: evaluacion?.id || null, resultado: p.resultado});
      } catch (error) {
        errores.push({revisionId: r.id,
          mensaje: error.message || "No se pudo guardar la evaluación."});
      }
    }
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId || null, entidad: "expediente",
      entidadId: expedienteId, accion: "revision_ia_confirmar_lote", actor,
      detalle: {aplicadas: aplicadas.length, omitidas: omitidas.length,
        errores: errores.length},
    });
    return {aplicadas, omitidas, errores};
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
