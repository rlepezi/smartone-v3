const carpetaEmpresaRepository =
    require("../repositories/carpetaEmpresaRepository");
const fuenteDocumentalRepository =
    require("../repositories/fuenteDocumentalRepository");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const empresaMandanteRepository =
    require("../repositories/empresaMandanteRepository");
const expedienteService = require("./expedienteService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {
  validarCarpetaEmpresa, mensajeCarpetaNoCoincide,
} = require("../utils/carpetaEmpresa");
const {
  idCarpeta, validarRutaCarpeta, validarUrlCarpeta, aplicarCambiosMapeo,
  validarAsignaciones,
} = require("../utils/carpetasEmpresa");
const {validarRutaRelativa} = require("../utils/repositorioDocumental");
const {fuenteActiva, aPublica} = require("../utils/fuentesDocumentales");
const {
  calcularEstadoMapeo, avanceMapeo, entradasMapeo,
} = require("../utils/carpetaExpediente");
const {aFecha} = require("../utils/vencimientos");

// Crear o vincular Carpetas de empresa y editar su mapeo. mandante_admin es
// el rol que hoy crea acreditaciones (además de superadmin).
const ROLES_EDITAN = ["superadmin", "evaluador", "mandante_admin"];
// Listado: pestaña Fuentes documentales (superadmin y mandante_admin) y
// Mapeo documental (superadmin y evaluador).
const ROLES_LISTAN = ["superadmin", "mandante_admin", "evaluador"];
// Mapeo documental (registrar carpetas, requerimientos asignables): solo
// superadmin y evaluador.
const ROLES_MAPEO = ["superadmin", "evaluador"];
const ROLES_MANDANTE = ["mandante_admin", "mandante_lector"];

const aISO = (v) => aFecha(v)?.toISOString() || null;
const nombreEmpresa = (e) => e?.razonSocial || e?.nombreFantasia || "otra " +
    "empresa";

/**
 * Carpetas de empresa: cada subcarpeta de la fuente documental del Mandante
 * representa a UNA empresa en UN proyecto, y guarda su mapeo documental
 * (carpeta del personal, de maquinarias y qué carpeta o archivo cumple cada
 * requerimiento). Una carpeta se vincula a un solo expediente activo; al
 * desvincularla conserva su mapeo para reutilizarla.
 */
class CarpetaEmpresaService {
  /**
   * Exige uno de los roles.
   * @param {Object} actor Usuario autenticado.
   * @param {string[]} roles Roles.
   * @param {string} accion Qué se intenta (para el mensaje).
   */
  _exigirRol(actor, roles, accion) {
    if (!roles.includes(actor.rol)) {
      throw new AppError(403, `No tiene permisos para ${accion}.`);
    }
  }

  /**
   * Mandante accesible: los roles del Mandante solo el suyo.
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @return {string} mandanteId.
   */
  _mandante(actor, mandanteId) {
    if (ROLES_MANDANTE.includes(actor.rol)) {
      if (mandanteId && mandanteId !== actor.mandanteId) {
        throw new AppError(403, "No tiene acceso a este Mandante.");
      }
      return actor.mandanteId;
    }
    if (!mandanteId) throw new AppError(400, "Falta el Mandante.");
    return mandanteId;
  }

  /**
   * Autor de un cambio.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{uid: string, nombre: string}>} Autor.
   */
  async _autor(actor) {
    const u = await usuarioRepository.getById(actor.uid).catch(() => null);
    const nombre = u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() : "";
    return {uid: actor.uid, nombre: nombre || actor.email || actor.uid};
  }

  /**
   * Forma pública de una carpeta (fechas ISO).
   * @param {?Object} c Carpeta.
   * @return {?Object} Carpeta.
   */
  publica(c) {
    if (!c) return null;
    const mapeo = {};
    Object.entries(c.mapeo || {}).forEach(([id, lista]) => {
      mapeo[id] = (lista || []).map((e) => ({...e,
        confirmadoAt: aISO(e.confirmadoAt)}));
    });
    return {
      id: c.id, mandanteId: c.mandanteId, fuenteId: c.fuenteId, ruta: c.ruta,
      url: c.url || null, empresaId: c.empresaId, proyectoId: c.proyectoId,
      expedienteId: c.expedienteId || null,
      carpetaPersonas: c.carpetaPersonas || null,
      carpetaRecursos: c.carpetaRecursos || null, mapeo,
      estadoMapeo: c.estadoMapeo || "sin_mapear", estado: c.estado,
      analizadaAt: aISO(c.analizadaAt), createdAt: aISO(c.createdAt),
      updatedAt: aISO(c.updatedAt), createdBy: c.createdBy || null,
      updatedBy: c.updatedBy || null,
    };
  }

  /**
   * Fuente activa del Mandante, o error si no tiene.
   * @param {string} mandanteId Mandante.
   * @return {Promise<Object>} Fuente.
   */
  async _fuenteActiva(mandanteId) {
    const fuente = fuenteActiva(await fuenteDocumentalRepository.list(
        mandanteId));
    if (!fuente) {
      throw new AppError(409, "Configure la fuente documental del " +
          "Mandante (Inteligencia Artificial → Fuentes documentales).",
      {codigo: "SIN_FUENTE"});
    }
    return fuente;
  }

  /**
   * IDs de los requerimientos de nivel Empresa del expediente (sus
   * instancias activas: los que le aplican).
   * @param {string} expedienteId Expediente.
   * @return {Promise<string[]>} IDs.
   */
  async _idsEmpresaDeExpediente(expedienteId) {
    const instancias = await expedienteRequerimientoRepository
        .listByExpediente(expedienteId, "activo");
    return [...new Set(instancias.filter((i) => i.tipoEntidad === "empresa")
        .map((i) => i.requerimientoId))];
  }

  /**
   * Requerimientos que el mapeo de la carpeta puede (y debe) cubrir: con
   * expediente, los de nivel Empresa que le aplican; sin expediente, todos
   * los activos de entidad Empresa del Mandante. Y = su total.
   * @param {Object} carpeta Carpeta de empresa.
   * @return {Promise<{conExpediente: boolean, requerimientos: Object[]}>}
   *     Lista ordenada [{id, nombre, nombreCorto, orden}].
   */
  async _asignables(carpeta) {
    const reqs = carpeta.expedienteId ?
      await requerimientoRepository.getByIds(
          await this._idsEmpresaDeExpediente(carpeta.expedienteId)) :
      await requerimientoRepository.list({mandanteId: carpeta.mandanteId,
        estado: "activo", tipoEntidad: "empresa"});
    return {
      conExpediente: Boolean(carpeta.expedienteId),
      requerimientos: (reqs || []).filter((r) => r.tipoEntidad === "empresa")
          .map((r) => ({id: r.id, nombre: r.nombre,
            nombreCorto: r.nombreCorto || null, orden: r.orden ?? null}))
          .sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) ||
            (a.nombreCorto || a.nombre).localeCompare(
                b.nombreCorto || b.nombre, "es")),
    };
  }

  /**
   * Carpetas de empresa de una fuente (o del Mandante), con empresa,
   * proyecto y expediente para mostrar.
   * @param {{mandanteId: ?string, fuenteId: ?string}} filtros Filtros.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object[]>} Carpetas.
   */
  async listar({mandanteId, fuenteId}, actor) {
    this._exigirRol(actor, ROLES_LISTAN, "ver las carpetas de empresa");
    const id = this._mandante(actor, mandanteId);
    const carpetas = await carpetaEmpresaRepository.list({mandanteId: id,
      fuenteId: fuenteId || null});
    const [empresas, proyectos, expedientes] = await Promise.all([
      empresaRepository.getByIds([...new Set(carpetas.map((c) =>
        c.empresaId).filter(Boolean))]),
      proyectoRepository.getByIds([...new Set(carpetas.map((c) =>
        c.proyectoId).filter(Boolean))]),
      expedienteRepository.getByIds([...new Set(carpetas.map((c) =>
        c.expedienteId).filter(Boolean))]),
    ]);
    const porId = (lista) => new Map((lista || []).map((x) => [x.id, x]));
    const [e, p, x] = [porId(empresas), porId(proyectos), porId(expedientes)];
    // Avance "X de Y": sin expediente, Y son los requerimientos de Empresa
    // del Mandante (una lectura); con expediente, los que le aplican.
    const idsMandante = carpetas.some((c) => !c.expedienteId) ?
      ((await requerimientoRepository.list({mandanteId: id, estado: "activo",
        tipoEntidad: "empresa"})) || []).map((r) => r.id) : [];
    const idsExpediente = new Map(await Promise.all(carpetas
        .filter((c) => c.expedienteId).map(async (c) => [c.expedienteId,
          await this._idsEmpresaDeExpediente(c.expedienteId)])));
    return carpetas.map((c) => ({
      ...this.publica(c),
      avance: avanceMapeo(c.mapeo, c.expedienteId ?
        idsExpediente.get(c.expedienteId) : idsMandante),
      empresaNombre: e.get(c.empresaId)?.razonSocial || null,
      proyectoNombre: p.get(c.proyectoId)?.nombre || null,
      proyectoCodigo: p.get(c.proyectoId)?.codigo || null,
      expedienteEstado: x.get(c.expedienteId)?.estado || null,
    })).sort((a, b) => a.ruta.localeCompare(b.ruta, "es", {numeric: true}));
  }

  /**
   * Carpeta del expediente para el resolvedor (con su fuente), o nulls.
   * @param {Object} expediente Expediente.
   * @return {Promise<{carpetaEmpresa: ?Object, fuente: ?Object}>} Datos.
   */
  async deExpediente(expediente) {
    const id = expediente?.repositorioDocumental?.carpetaEmpresaId || null;
    if (!id) return {carpetaEmpresa: null, fuente: null};
    const carpetaEmpresa = await carpetaEmpresaRepository.getById(id);
    const fuente = carpetaEmpresa ? aPublica(await fuenteDocumentalRepository
        .getById(carpetaEmpresa.fuenteId)) : null;
    return {carpetaEmpresa, fuente};
  }

  /**
   * Ruta (local) o URL (SharePoint) de la carpeta dentro de la fuente, y
   * validación estricta contra la Empresa.
   * @param {Object} fuente Fuente activa.
   * @param {{ruta: ?string, url: ?string}} payload Datos.
   * @param {Object} empresa Empresa.
   * @return {{ruta: string, url: ?string}} Carpeta.
   */
  _carpetaPedida(fuente, payload, empresa) {
    let ruta;
    let url = null;
    if (fuente.tipo === "sharepoint") {
      const v = validarUrlCarpeta(payload?.url, fuente.config?.siteUrl);
      if (!v.ok) throw new AppError(400, v.error);
      ({ruta, url} = v);
    } else {
      const v = validarRutaCarpeta(payload?.ruta);
      if (!v.ok) throw new AppError(400, v.error);
      ruta = v.valor;
    }
    const v = validarCarpetaEmpresa(ruta, empresa);
    if (!v.valida) {
      throw new AppError(400, mensajeCarpetaNoCoincide(ruta, empresa,
          v.terminosBuscados));
    }
    return {ruta, url};
  }

  /**
   * Rechaza una carpeta ya existente que no se puede usar: es de otra
   * empresa, de otro proyecto (si ya tiene uno), o la usa otro expediente
   * activo.
   * @param {Object} entrada Datos.
   * @param {?Object} entrada.actual Carpeta existente (o null).
   * @param {?Object} entrada.otroExpediente Expediente que hoy la usa.
   * @param {string} entrada.ruta Ruta.
   * @param {Object} entrada.empresa Empresa pedida.
   * @param {?string} entrada.proyectoId Proyecto pedido (sin él, no se
   *     compara: Nueva Acreditación elige la carpeta antes que el proyecto).
   * @return {Promise<void>}
   */
  async _exigirDisponible({actual, otroExpediente, ruta, empresa,
    proyectoId}) {
    if (!actual) return;
    const proyectoNombre = async (pid) =>
      (await proyectoRepository.getById(pid).catch(() => null))?.nombre ||
        "otro proyecto";
    if (actual.empresaId !== empresa.id) {
      const emp = await empresaRepository.getById(actual.empresaId)
          .catch(() => null);
      throw new AppError(400, `La carpeta «${ruta}» está registrada como ` +
          `${nombreEmpresa(emp)}: no es de ${nombreEmpresa(empresa)}.`);
    }
    // Registrada sin proyecto (Mapeo documental): toma el del expediente al
    // vincularla. Con otro proyecto, se rechaza.
    if (proyectoId && actual.proyectoId && actual.proyectoId !== proyectoId) {
      throw new AppError(400, `La carpeta «${ruta}» corresponde a ` +
          `${nombreEmpresa(empresa)} en ` +
          `${await proyectoNombre(actual.proyectoId)}. Cada proyecto usa su ` +
          "propia carpeta.");
    }
    if (otroExpediente && otroExpediente.estado !== "cerrado") {
      throw new AppError(400, `La carpeta «${ruta}» ya está vinculada al ` +
          `expediente de ${nombreEmpresa(empresa)} en ` +
          `${await proyectoNombre(otroExpediente.proyectoId)}`);
    }
  }

  /**
   * Verifica, SIN escribir, si una carpeta de la fuente puede usarse para
   * la empresa en el proyecto (Nueva Acreditación, paso 1: el expediente
   * aún no existe). Mismas reglas que vincular.
   * @param {{mandanteId: string, empresaId: string, proyectoId: ?string,
   *     ruta: ?string, url: ?string}} payload Datos (proyectoId opcional).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{ruta: string, url: ?string, existente: boolean,
   *     estadoMapeo: ?string}>} Carpeta disponible.
   */
  async verificar(payload, actor) {
    this._exigirRol(actor, ROLES_EDITAN, "vincular carpetas de empresa");
    const mandanteId = this._mandante(actor, payload?.mandanteId);
    const fuente = await this._fuenteActiva(mandanteId);
    const empresa = await empresaRepository.getById(
        String(payload?.empresaId || ""));
    if (!empresa) throw new AppError(404, "Empresa no encontrada.");
    const proyectoId = payload?.proyectoId ? String(payload.proyectoId) : null;
    const {ruta, url} = this._carpetaPedida(fuente, payload, empresa);
    const actual = await carpetaEmpresaRepository.getById(
        idCarpeta(fuente.id, ruta));
    const otroExpediente = actual?.expedienteId ?
      await expedienteRepository.getById(actual.expedienteId)
          .catch(() => null) : null;
    await this._exigirDisponible({actual, otroExpediente, ruta, empresa,
      proyectoId});
    return {ruta, url, existente: Boolean(actual),
      estadoMapeo: actual?.estadoMapeo || null};
  }

  /**
   * Vincula al expediente la Carpeta de empresa de esa ruta (local) o URL
   * (SharePoint) dentro de la fuente activa del Mandante: find-or-create,
   * validación estricta contra la Empresa, una sola carpeta por expediente
   * activo y carpetas distintas por proyecto.
   * @param {{expedienteId: string, ruta: ?string, url: ?string}} payload
   *     Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Carpeta vinculada.
   */
  async vincular(payload, actor) {
    this._exigirRol(actor, ROLES_EDITAN, "vincular carpetas de empresa");
    const expedienteId = String(payload?.expedienteId || "");
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El expediente está cerrado.");
    }
    const fuente = await this._fuenteActiva(expediente.mandanteId);
    const empresa = await empresaRepository.getById(expediente.empresaId);
    if (!empresa) throw new AppError(404, "Empresa no encontrada.");
    const {ruta, url} = this._carpetaPedida(fuente, payload, empresa);
    const autor = await this._autor(actor);
    const id = idCarpeta(fuente.id, ruta);
    const r = await carpetaEmpresaRepository.vincular({
      id, expedienteId, autor,
      nueva: {mandanteId: expediente.mandanteId, fuenteId: fuente.id, ruta,
        url, empresaId: expediente.empresaId,
        proyectoId: expediente.proyectoId, carpetaPersonas: null,
        carpetaRecursos: null, mapeo: {}, estadoMapeo: "sin_mapear",
        analizadaAt: null},
      validar: ({actual, otroExpediente}) => this._exigirDisponible({
        actual, otroExpediente, ruta, empresa,
        proyectoId: expediente.proyectoId}),
    });
    const estadoMapeo = calcularEstadoMapeo(r.carpeta.mapeo,
        await this._idsEmpresaDeExpediente(expedienteId));
    const carpeta = estadoMapeo !== r.carpeta.estadoMapeo ?
      await carpetaEmpresaRepository.update(id, {estadoMapeo}) : r.carpeta;
    await bitacoraLogger.registrarEvento({
      mandanteId: expediente.mandanteId, entidad: "expediente",
      entidadId: expedienteId, accion: "carpeta_empresa_vinculada", actor,
      detalle: {carpetaEmpresaId: id, ruta, fuenteId: fuente.id,
        creada: r.creada, carpetaAnteriorId: r.anteriorId},
    });
    if (r.creada) {
      await bitacoraLogger.registrarEvento({
        mandanteId: expediente.mandanteId, entidad: "carpetasEmpresa",
        entidadId: id, accion: "creado", actor,
        detalle: {ruta, fuenteId: fuente.id, empresaId: expediente.empresaId,
          proyectoId: expediente.proyectoId},
      });
    }
    return this.publica(carpeta);
  }

  /**
   * Edita la carpeta del personal, la de maquinarias y el mapeo
   * ({requerimientoId: [{ruta, tipo}] | null}; origen "manual").
   * @param {string} id Carpeta.
   * @param {Object} payload {carpetaPersonas?, carpetaRecursos?, mapeo?}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Carpeta actualizada.
   */
  async actualizar(id, payload, actor) {
    this._exigirRol(actor, ROLES_EDITAN, "editar carpetas de empresa");
    const carpeta = await carpetaEmpresaRepository.getById(String(id || ""));
    if (!carpeta) throw new AppError(404, "Carpeta de empresa no encontrada.");
    if (carpeta.expedienteId) {
      const exp = await expedienteService.getExpedienteById(
          carpeta.expedienteId, actor);
      if (exp.estado === "cerrado") {
        throw new AppError(409, "El expediente está cerrado.");
      }
    } else {
      this._mandante(actor, carpeta.mandanteId);
    }
    const p = payload || {};
    const cambios = {};
    for (const campo of ["carpetaPersonas", "carpetaRecursos"]) {
      if (p[campo] === undefined) continue;
      const r = validarRutaRelativa(p[campo]);
      if (!r.ok) throw new AppError(400, r.error);
      if (r.valor !== (carpeta[campo] || null)) cambios[campo] = r.valor;
    }
    const {requerimientos} = await this._asignables(carpeta);
    const nombres = new Map(requerimientos.map((r) =>
      [r.id, r.nombreCorto || r.nombre]));
    if (p.mapeo !== undefined) {
      const m = aplicarCambiosMapeo(p.mapeo, carpeta.mapeo,
          {uid: actor.uid, ahora: new Date()});
      if (!m.ok) throw new AppError(400, m.error);
      // Solo se asignan requerimientos de Empresa de esta carpeta (quitar
      // siempre se puede).
      const ajeno = Object.entries(p.mapeo).find(([rid, v]) =>
        Array.isArray(v) && v.length && !nombres.has(rid));
      if (ajeno) {
        throw new AppError(400, "Solo se asignan requerimientos de nivel " +
            "Empresa que aplican a esta carpeta.");
      }
      cambios.mapeo = m.valor;
    }
    const final = {
      mapeo: cambios.mapeo || carpeta.mapeo || {},
      carpetaPersonas: "carpetaPersonas" in cambios ? cambios.carpetaPersonas :
        carpeta.carpetaPersonas || null,
      carpetaRecursos: "carpetaRecursos" in cambios ? cambios.carpetaRecursos :
        carpeta.carpetaRecursos || null,
    };
    if (Object.keys(cambios).length) {
      const error = validarAsignaciones(final,
          (rid) => nombres.get(rid) || "otro requerimiento");
      if (error) throw new AppError(400, error);
    }
    if (cambios.mapeo) {
      cambios.estadoMapeo = calcularEstadoMapeo(cambios.mapeo,
          requerimientos.map((r) => r.id));
    }
    if (!Object.keys(cambios).length) return this.publica(carpeta);
    // Detalle para la Bitácora, ANTES de guardar: cada requerimiento
    // cambiado con sus rutas antes y después (quitar deja el anterior).
    const requerimientosCambiados = cambios.mapeo ? Object.keys(p.mapeo)
        .map((rid) => ({requerimientoId: rid,
          anterior: entradasMapeo((carpeta.mapeo || {})[rid])
              .map((e) => e.ruta),
          nuevo: entradasMapeo(cambios.mapeo[rid]).map((e) => e.ruta)}))
        .filter((c) => JSON.stringify(c.anterior) !==
          JSON.stringify(c.nuevo)) : null;
    const anteriores = {carpetaPersonas: carpeta.carpetaPersonas || null,
      carpetaRecursos: carpeta.carpetaRecursos || null};
    const actualizada = await carpetaEmpresaRepository.update(carpeta.id,
        {...cambios, updatedBy: await this._autor(actor)});
    await bitacoraLogger.registrarEvento({
      mandanteId: carpeta.mandanteId, entidad: "carpetasEmpresa",
      entidadId: carpeta.id, accion: "actualizado", actor,
      detalle: {
        expedienteId: carpeta.expedienteId || null,
        ...Object.fromEntries(["carpetaPersonas", "carpetaRecursos"]
            .filter((c) => c in cambios)
            .map((c) => [c, {anterior: anteriores[c], nuevo: cambios[c]}])),
        ...(requerimientosCambiados ?
          {requerimientos: requerimientosCambiados} : {}),
      },
    });
    return this.publica(actualizada);
  }

  /**
   * Registra una subcarpeta de la fuente local como Carpeta de empresa, sin
   * proyecto ni expediente (Mapeo documental): validación estricta contra la
   * Empresa, que debe estar asociada al Mandante; find-or-create (registrar
   * de nuevo la misma carpeta para la misma empresa no duplica).
   * @param {{mandanteId: string, ruta: string, empresaId: string}} payload
   *     Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Carpeta registrada.
   */
  async registrar(payload, actor) {
    this._exigirRol(actor, ROLES_MAPEO, "registrar carpetas de empresa");
    const mandanteId = this._mandante(actor, payload?.mandanteId);
    const fuente = await this._fuenteActiva(mandanteId);
    if (fuente.tipo !== "local") {
      throw new AppError(409, "El registro de carpetas de SharePoint estará " +
          "disponible cuando se conecte Microsoft Graph.");
    }
    const v = validarRutaCarpeta(payload?.ruta);
    if (!v.ok) throw new AppError(400, v.error);
    const ruta = v.valor;
    const empresaId = String(payload?.empresaId || "");
    const [empresa, delMandante] = await Promise.all([
      empresaRepository.getById(empresaId),
      empresaMandanteRepository.empresaIdsActivas(mandanteId),
    ]);
    if (!empresa || !(delMandante || []).includes(empresaId)) {
      throw new AppError(400, "La empresa no está asociada a este Mandante.");
    }
    const coincide = validarCarpetaEmpresa(ruta, empresa);
    if (!coincide.valida) {
      throw new AppError(400, mensajeCarpetaNoCoincide(ruta, empresa,
          coincide.terminosBuscados));
    }
    const id = idCarpeta(fuente.id, ruta);
    const autor = await this._autor(actor);
    const r = await carpetaEmpresaRepository.crear(id, {mandanteId,
      fuenteId: fuente.id, ruta, url: null, empresaId, proyectoId: null,
      expedienteId: null, carpetaPersonas: null, carpetaRecursos: null,
      mapeo: {}, estadoMapeo: "sin_mapear", analizadaAt: null, estado: "activa",
      createdBy: autor, updatedBy: autor});
    if (!r.creada && r.carpeta.empresaId !== empresaId) {
      const otra = await empresaRepository.getById(r.carpeta.empresaId)
          .catch(() => null);
      throw new AppError(400, `La carpeta «${ruta}» ya está registrada como ` +
          `${nombreEmpresa(otra)}.`);
    }
    if (r.creada) {
      await bitacoraLogger.registrarEvento({
        mandanteId, entidad: "carpetasEmpresa", entidadId: id,
        accion: "registrada", actor,
        detalle: {ruta, fuenteId: fuente.id, empresaId},
      });
    }
    return {...this.publica(r.carpeta), empresaNombre: empresa.razonSocial};
  }

  /**
   * Requerimientos asignables de una carpeta (Mapeo documental) y su total
   * (Y del avance "X de Y").
   * @param {string} id Carpeta.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{conExpediente: boolean, requerimientos: Object[],
   *     total: number}>} Lista.
   */
  async requerimientosAsignables(id, actor) {
    this._exigirRol(actor, ROLES_MAPEO, "ver el mapeo documental");
    const carpeta = await carpetaEmpresaRepository.getById(String(id || ""));
    if (!carpeta) throw new AppError(404, "Carpeta de empresa no encontrada.");
    this._mandante(actor, carpeta.mandanteId);
    const r = await this._asignables(carpeta);
    return {...r, total: r.requerimientos.length};
  }

  /**
   * Desvincula la carpeta del expediente: la carpeta queda libre (no se
   * inactiva: conserva su mapeo para reutilizarla).
   * @param {string} expedienteId Expediente.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{carpetaEmpresaId: ?string}>} La que tenía.
   */
  async desvincular(expedienteId, actor) {
    this._exigirRol(actor, ROLES_EDITAN, "desvincular la carpeta");
    const expediente = await expedienteService.getExpedienteById(
        String(expedienteId || ""), actor);
    if (expediente.estado === "cerrado") {
      throw new AppError(409, "El expediente está cerrado.");
    }
    const id = await carpetaEmpresaRepository.desvincular(expediente.id,
        await this._autor(actor));
    if (id) {
      await bitacoraLogger.registrarEvento({
        mandanteId: expediente.mandanteId, entidad: "expediente",
        entidadId: expediente.id, accion: "carpeta_empresa_desvinculada",
        actor, detalle: {carpetaEmpresaId: id},
      });
    }
    return {carpetaEmpresaId: id};
  }
}

module.exports = new CarpetaEmpresaService();
module.exports.ROLES_EDITAN = ROLES_EDITAN;
module.exports.ROLES_MAPEO = ROLES_MAPEO;
