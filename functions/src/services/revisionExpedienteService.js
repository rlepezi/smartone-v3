const expedienteService = require("./expedienteService");
const configRepository =
    require("../repositories/configRevisionExpedienteRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const resultadoRevisionRepository =
    require("../repositories/resultadoRevisionRepository");
const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const sesionRevisionRepository =
    require("../repositories/sesionRevisionRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {aFecha, hoySantiago} = require("../utils/vencimientos");
const {
  similitudNombres, extraerNombreEmpresa,
} = require("../utils/estructuraCalce");
const {
  MOTIVOS_NO_ELEGIBLE, elegibilidadRequerimiento, calcularEstadoCelda,
  motivoFueraDeLote,
} = require("../utils/revisionExpediente");
const resolucionService = require("./resolucionService");
const AppError = require("../utils/AppError");

const FUENTES = ["carpeta_local"];
const MODOS_ESTRUCTURA = ["plantilla", "libre"];
const ROLES_EDITAN = ["superadmin", "evaluador", "mandante_admin"];
// Aceptar propuestas crea Evaluaciones: mismos roles que evaluan.
const ROLES_EVALUAN = ["superadmin", "evaluador"];
const MAX_LOTE = 200;
// Bajo esta similitud, la carpeta "no parece" de la Empresa del Expediente.
const UMBRAL_CARPETA_EMPRESA = 0.5;
const ORDEN_NIVEL = {empresa: 0, persona: 1, recurso: 2};

const aISO = (v) => aFecha(v)?.toISOString() || null;
const nombrePersona = (p) => `${p?.nombre || ""} ${p?.apellido || ""}`.trim();

/**
 * Revisiones IA dentro de un Expediente: configuración (carpeta y
 * requerimientos habilitados para IA), elegibilidad de cada requerimiento
 * y la matriz de estado sujeto × requerimiento. Usa el mismo motor que el
 * módulo independiente; acá solo se lee y se configura.
 */
class RevisionExpedienteService {
  /**
   * Similitud entre la carpeta y la Empresa del Expediente.
   * @param {?string} carpetaNombre Nombre de la carpeta.
   * @param {?Object} empresa Empresa.
   * @return {?{similitud: number, corresponde: boolean,
   *     nombreDetectado: string}} Coincidencia, o null sin carpeta.
   */
  _coincidenciaEmpresa(carpetaNombre, empresa) {
    if (!carpetaNombre || !empresa) return null;
    const {nombreEmpresa} = extraerNombreEmpresa(carpetaNombre);
    const similitud = Math.max(
        similitudNombres(nombreEmpresa, empresa.razonSocial),
        similitudNombres(nombreEmpresa, empresa.nombreFantasia),
    );
    return {similitud, corresponde: similitud >= UMBRAL_CARPETA_EMPRESA,
      nombreDetectado: nombreEmpresa};
  }

  /**
   * Requerimientos del Expediente (de sus instancias activas) con su
   * elegibilidad para IA.
   * @param {Object} expediente Expediente.
   * @param {?Object} config Configuración guardada.
   * @return {Promise<{requerimientos: Object[], instancias: Object[],
   *     plantilla: ?Object}>} Datos.
   */
  async _requerimientos(expediente, config) {
    const [instancias, tipos, plantilla] = await Promise.all([
      expedienteRequerimientoRepository.listByExpediente(expediente.id,
          "activo"),
      tipoDocumentalRepository.list(),
      plantillaEstructuraRepository.getActiva(expediente.mandanteId),
    ]);
    const catalogo = new Map((await requerimientoRepository.getByIds(
        [...new Set(instancias.map((i) => i.requerimientoId))],
    )).map((r) => [r.id, r]));
    const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
    const libre = config?.modoEstructura === "libre";
    const habilitados = new Set(config?.requerimientosIA || []);
    const porRequerimiento = new Map();
    instancias.forEach((i) => {
      if (!porRequerimiento.has(i.requerimientoId)) {
        porRequerimiento.set(i.requerimientoId, {
          requerimientoId: i.requerimientoId,
          nombre: i.nombreCorto || i.nombre,
          nombreCompleto: i.nombre,
          tipoEntidad: i.tipoEntidad,
          orden: i.orden ?? null,
          sujetos: 0,
        });
      }
      porRequerimiento.get(i.requerimientoId).sujetos++;
    });
    const requerimientos = [...porRequerimiento.values()].map((r) => {
      const requerimiento = catalogo.get(r.requerimientoId) || null;
      const tipo = requerimiento?.tipoDocumentalId ?
        tipoPorId.get(requerimiento.tipoDocumentalId) || null : null;
      const el = elegibilidadRequerimiento({requerimiento, tipo, plantilla,
        libre});
      return {
        ...r,
        modoValidacion: requerimiento?.modoValidacion || "manual",
        elegible: el.elegible,
        motivo: el.motivo,
        motivoTexto: el.motivo ? MOTIVOS_NO_ELEGIBLE[el.motivo] : null,
        tipo: el.tipo,
        documentoPlantilla: el.documentoPlantilla,
        habilitadoIA: el.elegible && habilitados.has(r.requerimientoId),
      };
    }).sort((a, b) =>
      (ORDEN_NIVEL[a.tipoEntidad] ?? 9) - (ORDEN_NIVEL[b.tipoEntidad] ?? 9) ||
      (a.orden ?? 999) - (b.orden ?? 999) ||
      a.nombre.localeCompare(b.nombre, "es"));
    return {requerimientos, instancias, plantilla};
  }

  /**
   * Configuración del Expediente con la elegibilidad de cada requerimiento.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {config, plantilla, empresa,
   *     coincidenciaEmpresa, requerimientos, resumen, puedeEditar}.
   */
  async obtenerConfig(expedienteId, actor) {
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    const [config, empresa] = await Promise.all([
      configRepository.get(expedienteId),
      empresaRepository.getById(expediente.empresaId),
    ]);
    const ultima = config?.ultimaSesionId ?
      await sesionRevisionRepository.getById(config.ultimaSesionId)
          .catch(() => null) : null;
    const {requerimientos, plantilla} =
        await this._requerimientos(expediente, config);
    return {
      config: config ? {
        fuente: config.fuente || "carpeta_local",
        carpetaNombre: config.carpetaNombre || null,
        modoEstructura: config.modoEstructura || "plantilla",
        plantillaId: config.plantillaId || null,
        requerimientosIA: config.requerimientosIA || [],
        ultimaSesionId: config.ultimaSesionId || null,
        ultimaValidacionAt: aISO(config.ultimaValidacionAt),
        updatedAt: aISO(config.updatedAt),
        updatedByNombre: config.updatedByNombre || null,
      } : null,
      // Última validación: costo estimado contra real y documentos.
      ultimaSesion: ultima ? {
        id: ultima.id, estado: ultima.estado, modo: ultima.modo,
        modelo: ultima.modelo || null,
        costoEstimadoUsd: ultima.costoEstimadoUsd ?? null,
        costoRealUsd: ultima.costoRealUsd ?? null,
        archivos: ultima.totales?.archivos || 0,
        procesados: ultima.totales?.procesados || 0,
        errores: ultima.totales?.errores || 0,
        createdAt: aISO(ultima.createdAt),
      } : null,
      plantilla: plantilla ? {id: plantilla.id, nombre: plantilla.nombre,
        version: plantilla.version} : null,
      empresa: empresa ? {id: empresa.id, razonSocial: empresa.razonSocial,
        nombreFantasia: empresa.nombreFantasia || null} : null,
      coincidenciaEmpresa: this._coincidenciaEmpresa(config?.carpetaNombre,
          empresa),
      requerimientos,
      resumen: {
        total: requerimientos.length,
        elegibles: requerimientos.filter((r) => r.elegible).length,
        habilitados: requerimientos.filter((r) => r.habilitadoIA).length,
      },
      puedeEditar: ROLES_EDITAN.includes(actor.rol) &&
          expediente.estado !== "cerrado",
    };
  }

  /**
   * Guarda la fuente, la carpeta (solo su nombre) y los requerimientos
   * habilitados para IA (solo elegibles). Deja el cambio en la Bitácora,
   * con aviso si la carpeta no parece de la Empresa del Expediente.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} payload {fuente, carpetaNombre, modoEstructura,
   *     requerimientosIA}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Igual que obtenerConfig.
   */
  async guardarConfig(expedienteId, payload, actor) {
    if (!ROLES_EDITAN.includes(actor.rol)) {
      throw new AppError(403, "No tiene permisos para configurar la " +
          "revisión IA del expediente.");
    }
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El expediente está cerrado.");
    }
    const previa = await configRepository.get(expedienteId);
    const fuente = payload?.fuente || previa?.fuente || "carpeta_local";
    if (!FUENTES.includes(fuente)) {
      throw new AppError(400, "La fuente indicada aún no está disponible.");
    }
    const modoEstructura = payload?.modoEstructura ||
        previa?.modoEstructura || "plantilla";
    if (!MODOS_ESTRUCTURA.includes(modoEstructura)) {
      throw new AppError(400, "Modo de estructura no válido.");
    }
    let carpetaNombre = previa?.carpetaNombre || null;
    if (payload && payload.carpetaNombre !== undefined) {
      carpetaNombre = payload.carpetaNombre === null ? null :
        String(payload.carpetaNombre).trim();
      if (carpetaNombre !== null &&
          (!carpetaNombre || carpetaNombre.length > 200 ||
           /[\\/:]/.test(carpetaNombre))) {
        throw new AppError(400,
            "Indique solo el nombre de la carpeta, sin ruta.");
      }
    }
    const config = {...previa, modoEstructura};
    const {requerimientos, plantilla} =
        await this._requerimientos(expediente, config);
    let requerimientosIA = previa?.requerimientosIA || [];
    if (payload && Array.isArray(payload.requerimientosIA)) {
      const porId = new Map(requerimientos.map((r) =>
        [r.requerimientoId, r]));
      const pedidos = [...new Set(payload.requerimientosIA.map(String))];
      const invalidos = pedidos.filter((id) => !porId.get(id)?.elegible);
      if (invalidos.length) {
        throw new AppError(400, "Solo se pueden habilitar requerimientos " +
            "elegibles para IA: " + invalidos.map((id) =>
          porId.get(id)?.nombre || id).join(", ") + ".");
      }
      requerimientosIA = pedidos;
    }
    const usuario = await usuarioRepository.getById(actor.uid)
        .catch(() => null);
    // Repositorio documental (pestaña Documentación): la carpeta local es
    // la misma; si cambió aquí, se refleja allá (una sola fuente).
    const nombreActor = usuario ? nombrePersona(usuario) :
      actor.email || actor.uid;
    const cambioCarpeta = carpetaNombre !== (previa?.carpetaNombre || null);
    const repoPrevio = previa?.repositorioDocumental || null;
    const repositorioDocumental = !cambioCarpeta ? repoPrevio :
      carpetaNombre ? {tipo: "local", etiqueta: carpetaNombre, url: null,
        mapeo: repoPrevio?.mapeo || null,
        updatedAt: new Date(), updatedBy: actor.uid,
        updatedByNombre: nombreActor} :
        repoPrevio?.tipo === "sharepoint" ? repoPrevio : null;
    await configRepository.guardar(expedienteId, {
      mandanteId: expediente.mandanteId,
      fuente, carpetaNombre, modoEstructura, repositorioDocumental,
      plantillaId: plantilla?.id || null,
      requerimientosIA,
      ultimaSesionId: previa?.ultimaSesionId || null,
      ultimaValidacionAt: previa?.ultimaValidacionAt || null,
      updatedBy: actor.uid,
      updatedByNombre: nombreActor,
    });
    const empresa = await empresaRepository.getById(expediente.empresaId);
    const coincidencia = carpetaNombre !== (previa?.carpetaNombre || null) ?
      this._coincidenciaEmpresa(carpetaNombre, empresa) : null;
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId,
      entidad: "expediente",
      entidadId: expedienteId,
      accion: "revision_ia_configurada",
      actor,
      detalle: {
        fuente, carpetaNombre, modoEstructura, requerimientosIA,
        ...(cambioCarpeta ? {carpetaAnterior: previa?.carpetaNombre || null} :
          {}),
        ...(coincidencia && !coincidencia.corresponde ? {
          advertencia: "carpeta_no_corresponde_empresa",
          similitud: Math.round(coincidencia.similitud * 100) / 100,
        } : {}),
      },
    });
    return this.obtenerConfig(expedienteId, actor);
  }

  /**
   * Propuesta pendiente más reciente por instancia, con los nombres de los
   * archivos de origen.
   * @param {string} expedienteId ID del Expediente.
   * @return {Promise<Map<string, Object>>} expedienteRequerimientoId →
   *     propuesta.
   */
  async _propuestasPorInstancia(expedienteId) {
    const resultados =
        await resultadoRevisionRepository.listPropuestosByExpediente(
            expedienteId);
    const procIds = [...new Set(resultados.flatMap((r) =>
      r.procesamientoIds || []))];
    const procesamientos = new Map((await Promise.all(procIds.map((id) =>
      procesamientoIARepository.getById(id)))).filter(Boolean)
        .map((p) => [p.id, p]));
    const salida = new Map();
    resultados.forEach((r) => {
      (r.enlaces || []).forEach((e) => {
        if (!e.requerido || e.expedienteId !== expedienteId ||
            !e.expedienteRequerimientoId) return;
        const previa = salida.get(e.expedienteRequerimientoId);
        if (previa && (aFecha(previa.createdAt)?.getTime() || 0) >=
            (aFecha(r.createdAt)?.getTime() || 0)) return;
        salida.set(e.expedienteRequerimientoId, {
          resultadoId: r.id,
          sesionId: r.sesionId,
          propuesta: r.propuesta,
          tipoDocumentalCodigo: r.tipoDocumentalCodigo,
          estadoEnlace: r.estadoEnlace,
          datosConsolidados: r.datosConsolidados || null,
          resultadoReglas: r.resultadoReglas || [],
          conflictos: r.conflictos || [],
          entidadCarpeta: r.entidadCarpeta || null,
          archivos: (r.procesamientoIds || []).map((id) =>
            procesamientos.get(id)?.archivoRef).filter(Boolean)
              .map((a) => ({nombre: a.nombre, rutaRelativa: a.rutaRelativa})),
          createdAt: aISO(r.createdAt),
        });
      });
    });
    return salida;
  }

  /**
   * Propuestas de IA sin resolver del Expediente, por instancia (para
   * mostrarlas en los requisitos de cada sujeto). Liviano: sin matriz.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} [{expedienteRequerimientoId, resultadoId,
   *     propuesta, estadoEnlace, reglasPendientes, createdAt}].
   */
  async propuestas(expedienteId, actor) {
    await expedienteService.getExpedienteById(expedienteId, actor);
    const porInstancia = await this._propuestasPorInstancia(expedienteId);
    return [...porInstancia.entries()].map(([id, p]) => ({
      expedienteRequerimientoId: id,
      resultadoId: p.resultadoId,
      propuesta: p.propuesta,
      estadoEnlace: p.estadoEnlace,
      // Por qué no se propuso "cumple": reglas que no cumplen o piden
      // revisión.
      reglasPendientes: p.resultadoReglas
          .filter((r) => ["no_cumple", "revision"].includes(r.resultado))
          .map((r) => ({regla: r.regla, resultado: r.resultado,
            detalle: r.detalle || null})),
      createdAt: p.createdAt,
    }));
  }

  /**
   * Matriz de estado del Expediente: filas (empresa, personas, recursos),
   * columnas (requerimientos) y celdas con estado, evaluación vigente,
   * propuesta pendiente e historial.
   * @param {string} expedienteId ID del Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {columnas, filas, contadores}.
   */
  async matriz(expedienteId, actor) {
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    const config = await configRepository.get(expedienteId);
    const [{requerimientos, instancias}, evaluaciones, propuestas,
      personasPart, recursosPart, empresa] = await Promise.all([
      this._requerimientos(expediente, config),
      evaluacionRepository.getByExpediente(expedienteId),
      this._propuestasPorInstancia(expedienteId),
      participacionPersonaRepository.list({
        participacionId: expediente.participacionId, estado: "activa"}),
      participacionRecursoRepository.list({
        participacionId: expediente.participacionId, estado: "activa"}),
      empresaRepository.getById(expediente.empresaId),
    ]);
    const personaIds = [...new Set([
      ...personasPart.map((p) => p.personaId),
      ...instancias.map((i) => i.personaId)].filter(Boolean))];
    const recursoIds = [...new Set([
      ...recursosPart.map((p) => p.recursoId),
      ...instancias.map((i) => i.recursoId)].filter(Boolean))];
    const [personas, recursos] = await Promise.all([
      personaRepository.getByIds(personaIds),
      recursoRepository.getByIds(recursoIds),
    ]);

    const hoy = hoySantiago();
    const porInstancia = new Map();
    evaluaciones.forEach((e) => {
      if (!porInstancia.has(e.expedienteRequerimientoId)) {
        porInstancia.set(e.expedienteRequerimientoId, []);
      }
      porInstancia.get(e.expedienteRequerimientoId).push(e);
    });
    const resumirEvaluacion = (e) => ({
      id: e.id, resultado: e.resultado, modalidad: e.modalidad || "manual",
      estado: e.estado, evaluadorNombre: e.evaluadorNombre || null,
      observaciones: e.observaciones || null,
      fechaVencimiento: aISO(e.fechaVencimiento), createdAt: aISO(e.createdAt),
      resultadoRevisionId: e.resultadoRevisionId || null,
    });

    const filas = new Map();
    const fila = (tipoEntidad, sujetoId, nombre, detalle) => {
      const clave = `${tipoEntidad}:${sujetoId}`;
      if (!filas.has(clave)) {
        filas.set(clave, {clave, tipoEntidad, sujetoId, nombre, detalle,
          celdas: {}});
      }
      return filas.get(clave);
    };
    const personaPorId = new Map(personas.map((p) => [p.id, p]));
    const recursoPorId = new Map(recursos.map((r) => [r.id, r]));
    const filaDe = (i) => {
      if (i.tipoEntidad === "empresa") {
        return fila("empresa", expediente.empresaId,
            empresa?.razonSocial || "Empresa", empresa?.rut || null);
      }
      if (i.personaId) {
        const p = personaPorId.get(i.personaId);
        return fila("persona", i.personaId, nombrePersona(p) || "Persona",
            p?.rut || null);
      }
      const r = recursoPorId.get(i.recursoId);
      return fila("recurso", i.recursoId, r?.nombre || "Recurso",
          r?.patente || null);
    };
    // Primero la empresa, luego las personas y recursos de la
    // Participación (aunque aún no tengan instancias).
    if (instancias.some((i) => i.tipoEntidad === "empresa")) {
      filaDe({tipoEntidad: "empresa"});
    }
    personas.forEach((p) => fila("persona", p.id, nombrePersona(p) ||
        "Persona", p.rut || null));
    recursos.forEach((r) => fila("recurso", r.id, r.nombre || "Recurso",
        r.patente || null));

    const contadores = {};
    instancias.forEach((i) => {
      const historial = (porInstancia.get(i.id) || [])
          .sort((a, b) => (aFecha(b.createdAt)?.getTime() || 0) -
              (aFecha(a.createdAt)?.getTime() || 0));
      const vigente = historial.find((e) => e.estado === "vigente") || null;
      const propuesta = propuestas.get(i.id) || null;
      const estado = calcularEstadoCelda({evaluacionVigente: vigente,
        propuestaPendiente: propuesta, hoy});
      contadores[estado.estado] = (contadores[estado.estado] || 0) + 1;
      filaDe(i).celdas[i.requerimientoId] = {
        expedienteRequerimientoId: i.id,
        ...estado,
        requiereVencimiento: Boolean(i.requiereVencimiento),
        fechaVencimiento: aISO(vigente?.fechaVencimiento),
        evaluacion: vigente ? resumirEvaluacion(vigente) : null,
        propuesta,
        historial: historial.map(resumirEvaluacion),
      };
    });

    return {
      columnas: requerimientos.map((r) => ({
        requerimientoId: r.requerimientoId, nombre: r.nombre,
        nombreCompleto: r.nombreCompleto, tipoEntidad: r.tipoEntidad,
        elegible: r.elegible, habilitadoIA: r.habilitadoIA,
      })),
      filas: [...filas.values()].sort((a, b) =>
        ORDEN_NIVEL[a.tipoEntidad] - ORDEN_NIVEL[b.tipoEntidad] ||
        a.nombre.localeCompare(b.nombre, "es")),
      contadores,
      hoy,
    };
  }

  /**
   * "Aceptar todas las propuestas que cumplen" de un Expediente: una por una
   * (cada una con el flujo normal de resolución), solo sus enlaces. Quedan
   * fuera las que no proponen cumple y las discrepancias.
   * @param {string} expedienteId ID del Expediente.
   * @param {string[]} resultadoIds Resultados a aceptar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{aceptados: string[], omitidos: Object[],
   *     errores: Object[]}>} Detalle.
   */
  async aceptarLote(expedienteId, resultadoIds, actor) {
    if (!ROLES_EVALUAN.includes(actor.rol)) {
      throw new AppError(403, "No tiene permisos para evaluar.");
    }
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El expediente está cerrado.");
    }
    const ids = [...new Set((Array.isArray(resultadoIds) ? resultadoIds :
      []).map(String))];
    if (!ids.length) throw new AppError(400, "No hay propuestas que aceptar.");
    if (ids.length > MAX_LOTE) {
      throw new AppError(400, `Máximo ${MAX_LOTE} propuestas por vez.`);
    }
    const [resultados, evaluaciones] = await Promise.all([
      Promise.all(ids.map((id) => resultadoRevisionRepository.getById(id))),
      evaluacionRepository.getByExpediente(expedienteId),
    ]);
    const vigentePorInstancia = new Map(evaluaciones
        .filter((e) => e.estado === "vigente")
        .map((e) => [e.expedienteRequerimientoId, e]));
    const aceptados = [];
    const omitidos = [];
    const errores = [];
    for (const [i, resultado] of resultados.entries()) {
      if (!resultado || resultado.mandanteId !== expediente.mandanteId) {
        omitidos.push({resultadoId: ids[i], motivo: "no_encontrado"});
        continue;
      }
      const motivo = motivoFueraDeLote(resultado, expedienteId,
          vigentePorInstancia);
      if (motivo) {
        omitidos.push({resultadoId: resultado.id, motivo});
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await resolucionService.resolver(resultado.id,
            {accion: "aceptar", expedienteId}, actor);
        aceptados.push(resultado.id);
      } catch (error) {
        errores.push({resultadoId: resultado.id,
          mensaje: error.message || "No se pudo aceptar."});
      }
    }
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId, entidad: "expediente",
      entidadId: expedienteId, accion: "revision_ia_aceptar_lote", actor,
      detalle: {aceptados: aceptados.length, omitidos: omitidos.length,
        errores: errores.length},
    });
    return {aceptados, omitidos, errores};
  }
}

module.exports = new RevisionExpedienteService();
