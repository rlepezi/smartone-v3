const {FieldValue} = require("firebase-admin/firestore");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const reglaIARepository = require("../repositories/reglaIARepository");
const requerimientoReglaRepository =
    require("../repositories/requerimientoReglaRepository");
const pruebaReglaIARepository =
    require("../repositories/pruebaReglaIARepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const aiConfigService = require("./aiConfigService");
const modeloReglasIAService = require("./modeloReglasIAService");
const costoService = require("./costoService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {aFecha} = require("../utils/vencimientos");
const AppError = require("../utils/AppError");
const {
  ENTIDADES, conDefaults, disponibleParaIA,
} = require("../reglasIA/tiposDocumentales");
const {
  estadoIADe, estadoTrasCambio, errorTransicion,
} = require("../reglasIA/estadoIA");
const {snapshotRegla, aplicarReglas} = require("../reglasIA/prueba");
const {calcularResultadoPropuesto} = require("../reglasIA/resultado");
const {validarParametros} = require("../reglasIA/verificaciones");
const {aFechaIso} = require("../reglasIA/verificaciones/comunes");

const SEVERIDADES = ["bloqueante", "advertencia"];
const ETIQUETA_ENTIDAD = {persona: "Persona", empresa: "Empresa",
  recurso: "Maquinaria"};
const MIMES_PRUEBA = ["image/jpeg", "image/png", "image/webp",
  "application/pdf"];
// Límites de "Probar reglas": el mismo tope por archivo que el motor de
// carpetas, y un total que en base64 (~4/3) queda bajo los 25 MB del parser
// JSON de la API.
const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;
const MAX_BYTES_TOTAL = 15 * 1024 * 1024;
const MAX_ARCHIVOS = 6;
const ESTADOS_PRUEBA = ["en_definicion", "en_prueba"];
const CAMPOS_CONTEXTO = ["rut", "nombre", "patente", "rutEmpresa",
  "fechaEvaluacion", "fechaTerminoProyecto"];
const ULTIMAS_PRUEBAS = 5;

const aISO = (v) => aFecha(v)?.toISOString() || null;
const ms = (v) => aFecha(v)?.getTime() || 0;

/**
 * Reglas de revisión IA de un requerimiento (solo superadmin): tipo
 * documental, vínculos con la biblioteca (severidad, parámetros, orden),
 * estado IA y "Probar reglas". Nada se borra; todo cambio queda en la
 * Bitácora del requerimiento.
 */
class RequerimientoReglaIAService {
  /**
   * Exige superadmin (además de la ruta).
   * @param {Object} actor Usuario autenticado.
   */
  _exigirSuperadmin(actor) {
    if (actor?.rol !== "superadmin") {
      throw new AppError(403, "Solo un superadmin configura las reglas IA " +
          "de un requerimiento.");
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
   * Requerimiento existente (o 404).
   * @param {string} id ID.
   * @return {Promise<Object>} Requerimiento.
   */
  async _requerimiento(id) {
    const r = await requerimientoRepository.getById(id);
    if (!r) throw new AppError(404, "Requerimiento no encontrado.");
    return r;
  }

  /**
   * Tipo documental del requerimiento (con defaults), o null.
   * @param {Object} req Requerimiento.
   * @return {Promise<?Object>} Tipo.
   */
  async _tipo(req) {
    if (!req.tipoDocumentalId) return null;
    const t = await tipoDocumentalRepository.getById(req.tipoDocumentalId);
    return t ? conDefaults(t) : null;
  }

  /**
   * Vínculos del requerimiento con su regla y su snapshot.
   * @param {string} id ID del requerimiento.
   * @return {Promise<Array<{vinculo: Object, regla: ?Object,
   *     snapshot: ?Object}>>} Vínculos.
   */
  async _vinculos(id) {
    const vinculos = await requerimientoReglaRepository.listByRequerimiento(id);
    const reglas = await reglaIARepository.getByIds(
        vinculos.map((v) => v.reglaId));
    const porId = new Map(reglas.map((r) => [r.id, r]));
    return vinculos.map((vinculo) => {
      const regla = porId.get(vinculo.reglaId) || null;
      return {vinculo, regla,
        snapshot: regla ? snapshotRegla(vinculo, regla) : null};
    });
  }

  /**
   * Error si el tipo no extrae algún campo que la regla necesita.
   * @param {Object} snapshot Regla aplicada (snapshotRegla).
   * @param {?Object} tipo Tipo documental.
   * @return {?string} Mensaje o null.
   */
  _errorCampos(snapshot, tipo) {
    if (!tipo) return null;
    const claves = new Set(tipo.campos.map((c) => c.clave));
    const falta = snapshot.camposRequeridos.find((c) => !claves.has(c));
    return falta ? `La regla ${snapshot.nombre} requiere el campo ${falta}, ` +
      `que el tipo ${tipo.nombre} no extrae` : null;
  }

  /**
   * Alertas de un vínculo (regla inactiva, entidad o campos incompatibles,
   * parámetros inválidos).
   * @param {Object} item {vinculo, regla, snapshot}.
   * @param {Object} req Requerimiento.
   * @param {?Object} tipo Tipo documental.
   * @return {Array<string>} Alertas.
   */
  _alertas({regla, snapshot}, req, tipo) {
    if (!regla) return ["La regla ya no existe en la biblioteca."];
    const alertas = [];
    if (regla.estado !== "activa") {
      alertas.push("La regla está inactiva en la biblioteca.");
    }
    if (!(regla.entidades || []).includes(req.tipoEntidad)) {
      alertas.push("La regla no aplica a " +
          `${ETIQUETA_ENTIDAD[req.tipoEntidad]}.`);
    }
    if (snapshot.error) alertas.push(snapshot.error);
    const campos = this._errorCampos(snapshot, tipo);
    if (campos) alertas.push(`${campos}.`);
    return alertas;
  }

  /**
   * Vínculos que se aplican al probar: activos, con la regla activa.
   * @param {Array<Object>} items Vínculos (_vinculos).
   * @return {Array<Object>} Los aplicables.
   */
  _aplicables(items) {
    return items.filter((i) => i.vinculo.activa && i.regla &&
      i.regla.estado === "activa");
  }

  /**
   * ¿La última prueba es posterior al último cambio de reglas o vínculos?
   * @param {Object} req Requerimiento.
   * @param {?Object} ultima Última prueba sin error.
   * @return {boolean} true si está vigente.
   */
  _pruebaVigente(req, ultima) {
    return Boolean(ultima) &&
      ms(ultima.createdAt) >= ms(req.reglasIAActualizadasAt);
  }

  /**
   * Registra un cambio de tipo, reglas o vínculos: marca la fecha del
   * cambio, ajusta el estado IA (sin_reglas → en_definicion; habilitado →
   * en_definicion) y deja el evento en la Bitácora.
   * @param {Object} req Requerimiento.
   * @param {Object} actor Usuario autenticado.
   * @param {string} accion Acción para la Bitácora.
   * @param {Object} detalle Detalle.
   * @param {Object} [extra] Otros campos del requerimiento a guardar.
   * @return {Promise<?string>} Aviso para el usuario, o null.
   */
  async _registrarCambio(req, actor, accion, detalle, extra = {}) {
    const anterior = estadoIADe(req);
    let {estado, aviso} = estadoTrasCambio(anterior);
    if (extra.tipoDocumentalId === null && estado === "en_prueba") {
      estado = "en_definicion";
    }
    await requerimientoRepository.update(req.id, {...extra, estadoIA: estado,
      reglasIAActualizadasAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid});
    await bitacoraLogger.registrarEvento({
      mandanteId: req.mandanteId || null, entidad: "requerimiento",
      entidadId: req.id, accion, actor,
      detalle: {...detalle, ...(estado !== anterior ?
        {estadoIAAnterior: anterior, estadoIANuevo: estado} : {})},
    });
    return aviso;
  }

  /**
   * Overrides del vínculo validados contra la verificación de la regla. Solo
   * se guardan los valores que difieren del default de la regla.
   * @param {Object} regla Regla.
   * @param {*} parametros Parámetros recibidos.
   * @return {Object} Overrides.
   */
  _parametros(regla, parametros) {
    if (regla.tipo !== "deterministica") return {};
    const entrada = parametros && typeof parametros === "object" ?
      parametros : {};
    const base = regla.parametros || {};
    const p = validarParametros(regla.verificacion, {...base, ...entrada});
    if (!p.ok) throw new AppError(400, p.error);
    const overrides = {};
    Object.entries(p.valor).forEach(([k, v]) => {
      if (JSON.stringify(v) !== JSON.stringify(base[k])) overrides[k] = v;
    });
    return overrides;
  }

  /**
   * Severidad válida.
   * @param {*} valor Valor recibido.
   * @return {string} Severidad.
   */
  _severidad(valor) {
    const s = valor || "bloqueante";
    if (!SEVERIDADES.includes(s)) {
      throw new AppError(400, "Severidad no válida: use bloqueante o " +
          "advertencia.");
    }
    return s;
  }

  /**
   * Forma pública de una prueba.
   * @param {Object} p Prueba.
   * @return {Object} Prueba.
   */
  _pruebaPublica(p) {
    return {...p, createdAt: aISO(p.createdAt)};
  }

  /**
   * Configuración IA completa de un requerimiento.
   * @param {string} id ID del requerimiento.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {requerimiento, tipo, tiposDisponibles,
   *     vinculos, pruebas, pruebaVigente, transiciones}.
   */
  async obtener(id, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    const [tipo, items, tipos, pruebas] = await Promise.all([
      this._tipo(req), this._vinculos(id), tipoDocumentalRepository.list(),
      pruebaReglaIARepository.listByRequerimiento(id, ULTIMAS_PRUEBAS),
    ]);
    const estadoIA = estadoIADe(req);
    const vinculos = items.map((i) => ({
      ...i.vinculo, createdAt: aISO(i.vinculo.createdAt),
      updatedAt: aISO(i.vinculo.updatedAt),
      regla: i.regla ? {id: i.regla.id, nombre: i.regla.nombre,
        descripcion: i.regla.descripcion || null, tipo: i.regla.tipo,
        verificacion: i.regla.verificacion || null,
        instruccionIA: i.regla.instruccionIA || null,
        parametros: i.regla.parametros || {}, entidades: i.regla.entidades,
        estado: i.regla.estado, version: i.regla.version} : null,
      parametrosEfectivos: i.snapshot?.parametros || {},
      camposRequeridos: i.snapshot?.camposRequeridos || [],
      alertas: this._alertas(i, req, tipo),
    }));
    const aplicables = this._aplicables(items);
    const ultima = pruebas.find((p) => !p.error) || null;
    const condiciones = {
      tieneTipo: Boolean(tipo), reglasActivas: aplicables.length,
      pruebaVigente: this._pruebaVigente(req, ultima),
    };
    const transiciones = {};
    ["en_definicion", "en_prueba", "habilitado"].forEach((destino) => {
      transiciones[destino] = errorTransicion(estadoIA, destino, condiciones);
    });
    return {
      requerimiento: {id: req.id, nombre: req.nombre,
        nombreCorto: req.nombreCorto || null, tipoEntidad: req.tipoEntidad,
        mandanteId: req.mandanteId || null, estadoIA,
        tipoDocumentalId: req.tipoDocumentalId || null,
        reglasIAActualizadasAt: aISO(req.reglasIAActualizadasAt)},
      tipo: tipo ? {id: tipo.id, codigo: tipo.codigo, nombre: tipo.nombre,
        estadoIA: tipo.estadoIA, entidades: tipo.entidades,
        campos: tipo.campos} : null,
      tiposDisponibles: tipos.filter((t) =>
        disponibleParaIA(t, req.tipoEntidad)).map((t) => {
        const c = conDefaults(t);
        return {id: c.id, codigo: c.codigo, nombre: c.nombre,
          estadoIA: c.estadoIA, campos: c.campos};
      }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      vinculos,
      pruebas: pruebas.map((p) => this._pruebaPublica(p)),
      pruebaVigente: condiciones.pruebaVigente,
      transiciones,
    };
  }

  /**
   * Asigna (o quita, con null) el tipo documental. Los vínculos activos
   * deben poder usarlo: el tipo debe extraer los campos de sus reglas.
   * @param {string} id ID del requerimiento.
   * @param {?string} tipoDocumentalId Tipo, o null.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada (+ aviso).
   */
  async asignarTipo(id, tipoDocumentalId, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    const nuevoId = tipoDocumentalId ? String(tipoDocumentalId) : null;
    if ((req.tipoDocumentalId || null) === nuevoId) {
      return this.obtener(id, actor);
    }
    let tipo = null;
    if (nuevoId) {
      const t = await tipoDocumentalRepository.getById(nuevoId);
      if (!t) throw new AppError(400, "El tipo documental no existe.");
      if (!disponibleParaIA(t, req.tipoEntidad)) {
        throw new AppError(400, `El tipo ${t.nombre} no está disponible ` +
            `para ${ETIQUETA_ENTIDAD[req.tipoEntidad]}.`);
      }
      tipo = conDefaults(t);
      const errores = this._aplicables(await this._vinculos(id))
          .map((i) => this._errorCampos(i.snapshot, tipo)).filter(Boolean);
      if (errores.length) throw new AppError(400, `${errores.join(". ")}.`);
    }
    const aviso = await this._registrarCambio(req, actor,
        "tipo_documental_ia", {
          tipoAnterior: req.tipoDocumentalId || null, tipoNuevo: nuevoId,
          tipoNombre: tipo?.nombre || null,
        }, {tipoDocumentalId: nuevoId});
    return {...await this.obtener(id, actor), aviso};
  }

  /**
   * Vincula una regla de la biblioteca (al final de la lista).
   * @param {string} id ID del requerimiento.
   * @param {Object} payload {reglaId, severidad, parametros}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada (+ aviso).
   */
  async agregarRegla(id, payload, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    const regla = await reglaIARepository.getById(String(payload?.reglaId ||
        ""));
    if (!regla) throw new AppError(404, "Regla no encontrada.");
    const items = await this._vinculos(id);
    const tipo = await this._tipo(req);
    const vinculo = await this._crearVinculo(req, regla, items, tipo, {
      severidad: this._severidad(payload.severidad),
      parametros: this._parametros(regla, payload.parametros),
      activa: true,
    }, actor);
    const aviso = await this._registrarCambio(req, actor, "regla_ia_vinculada",
        {vinculoId: vinculo.id, reglaId: regla.id, reglaNombre: regla.nombre,
          version: regla.version, severidad: vinculo.severidad,
          parametros: vinculo.parametros});
    return {...await this.obtener(id, actor), aviso};
  }

  /**
   * Valida y crea un vínculo.
   * @param {Object} req Requerimiento.
   * @param {Object} regla Regla.
   * @param {Array<Object>} items Vínculos actuales.
   * @param {?Object} tipo Tipo documental.
   * @param {Object} datos {severidad, parametros, activa}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Vínculo creado.
   */
  async _crearVinculo(req, regla, items, tipo, datos, actor) {
    if (regla.estado !== "activa") {
      throw new AppError(400, `La regla ${regla.nombre} está inactiva.`);
    }
    if (!(regla.entidades || []).includes(req.tipoEntidad)) {
      throw new AppError(400, `La regla ${regla.nombre} no aplica a ` +
          `${ETIQUETA_ENTIDAD[req.tipoEntidad]}.`);
    }
    if (items.some((i) => i.vinculo.reglaId === regla.id)) {
      throw new AppError(409, `La regla ${regla.nombre} ya está en este ` +
          "requerimiento.");
    }
    const errorCampos = this._errorCampos(
        snapshotRegla({id: null, ...datos}, regla), tipo);
    if (errorCampos) throw new AppError(400, `${errorCampos}.`);
    const orden = items.reduce((m, i) => Math.max(m, i.vinculo.orden ?? 0),
        0) + 1;
    return requerimientoReglaRepository.create({
      requerimientoId: req.id, reglaId: regla.id, orden, ...datos,
      createdBy: actor.uid, updatedBy: actor.uid,
    });
  }

  /**
   * Vínculo del requerimiento (o 404).
   * @param {string} id ID del requerimiento.
   * @param {string} vinculoId ID del vínculo.
   * @return {Promise<Object>} Vínculo.
   */
  async _vinculo(id, vinculoId) {
    const v = await requerimientoReglaRepository.getById(vinculoId);
    if (!v || v.requerimientoId !== id || v.quitada) {
      throw new AppError(404, "La regla no está en este requerimiento.");
    }
    return v;
  }

  /**
   * Edita severidad, parámetros o activa de un vínculo.
   * @param {string} id ID del requerimiento.
   * @param {string} vinculoId ID del vínculo.
   * @param {Object} payload {severidad, parametros, activa}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada (+ aviso).
   */
  async actualizarVinculo(id, vinculoId, payload, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    const vinculo = await this._vinculo(id, vinculoId);
    const regla = await reglaIARepository.getById(vinculo.reglaId);
    if (!regla) throw new AppError(409, "La regla ya no existe.");
    const entrada = payload || {};
    const cambios = {};
    if (entrada.severidad !== undefined) {
      cambios.severidad = this._severidad(entrada.severidad);
    }
    if (entrada.parametros !== undefined) {
      cambios.parametros = this._parametros(regla, entrada.parametros);
    }
    if (entrada.activa !== undefined) cambios.activa = Boolean(entrada.activa);
    const final = {...vinculo, ...cambios};
    if (final.activa) {
      if (regla.estado !== "activa") {
        throw new AppError(400, `La regla ${regla.nombre} está inactiva en ` +
            "la biblioteca.");
      }
      const errorCampos = this._errorCampos(snapshotRegla(final, regla),
          await this._tipo(req));
      if (errorCampos) throw new AppError(400, `${errorCampos}.`);
    }
    const editados = Object.keys(cambios).filter((k) =>
      JSON.stringify(cambios[k]) !== JSON.stringify(vinculo[k] ?? null));
    if (!editados.length) return this.obtener(id, actor);
    await requerimientoReglaRepository.update(vinculoId,
        {...cambios, updatedBy: actor.uid});
    const detalle = {vinculoId, reglaId: regla.id, reglaNombre: regla.nombre};
    editados.forEach((k) => {
      detalle[k] = {anterior: vinculo[k] ?? null, nuevo: cambios[k]};
    });
    const aviso = await this._registrarCambio(req, actor,
        "regla_ia_actualizada", detalle);
    return {...await this.obtener(id, actor), aviso};
  }

  /**
   * Quita una regla del requerimiento (el vínculo queda inactivo y
   * "quitado"; no se borra).
   * @param {string} id ID del requerimiento.
   * @param {string} vinculoId ID del vínculo.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada (+ aviso).
   */
  async quitarVinculo(id, vinculoId, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    const vinculo = await this._vinculo(id, vinculoId);
    const regla = await reglaIARepository.getById(vinculo.reglaId);
    await requerimientoReglaRepository.update(vinculoId, {activa: false,
      quitada: true, quitadaAt: FieldValue.serverTimestamp(),
      quitadaBy: actor.uid, updatedBy: actor.uid});
    const aviso = await this._registrarCambio(req, actor, "regla_ia_quitada",
        {vinculoId, reglaId: vinculo.reglaId,
          reglaNombre: regla?.nombre || null});
    return {...await this.obtener(id, actor), aviso};
  }

  /**
   * Reordena las reglas del requerimiento.
   * @param {string} id ID del requerimiento.
   * @param {Array<string>} ids IDs de los vínculos en el nuevo orden (todos).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada.
   */
  async ordenar(id, ids, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    const actuales = await requerimientoReglaRepository.listByRequerimiento(id);
    const lista = Array.isArray(ids) ? ids.map(String) : [];
    const mismos = lista.length === actuales.length &&
      new Set(lista).size === lista.length &&
      actuales.every((v) => lista.includes(v.id));
    if (!mismos) {
      throw new AppError(400, "El orden debe incluir todas las reglas del " +
          "requerimiento, una vez cada una.");
    }
    await requerimientoReglaRepository.ordenar(
        lista.map((v, i) => ({id: v, orden: i + 1})), {updatedBy: actor.uid});
    // El orden no cambia el resultado: no exige volver a probar.
    await bitacoraLogger.registrarEvento({
      mandanteId: req.mandanteId || null, entidad: "requerimiento",
      entidadId: id, accion: "reglas_ia_ordenadas", actor,
      detalle: {orden: lista},
    });
    return this.obtener(id, actor);
  }

  /**
   * Copia las reglas de otro requerimiento (severidad, parámetros y activa).
   * Omite las que ya están, las inactivas y las incompatibles.
   * @param {string} id ID del requerimiento destino.
   * @param {string} origenId ID del requerimiento origen.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración (+ copiadas, omitidas, aviso).
   */
  async copiarDe(id, origenId, actor) {
    this._exigirSuperadmin(actor);
    if (!origenId || String(origenId) === id) {
      throw new AppError(400, "Elija otro requerimiento como origen.");
    }
    const req = await this._requerimiento(id);
    const origen = await this._requerimiento(String(origenId));
    const [items, origenItems, tipo] = await Promise.all([
      this._vinculos(id), this._vinculos(origen.id), this._tipo(req)]);
    const copiadas = [];
    const omitidas = [];
    for (const {vinculo, regla} of origenItems) {
      if (!regla) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const nuevo = await this._crearVinculo(req, regla, items, tipo, {
          severidad: vinculo.severidad, parametros: vinculo.parametros || {},
          activa: Boolean(vinculo.activa),
        }, actor);
        items.push({vinculo: nuevo, regla});
        copiadas.push(regla.nombre);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        omitidas.push({nombre: regla.nombre, motivo: error.message});
      }
    }
    let aviso = null;
    if (copiadas.length) {
      aviso = await this._registrarCambio(req, actor, "reglas_ia_copiadas",
          {origenId: origen.id, origenNombre: origen.nombre, copiadas,
            omitidas: omitidas.map((o) => o.nombre)});
    }
    return {...await this.obtener(id, actor), copiadas, omitidas, aviso};
  }

  /**
   * Transición manual del estado IA.
   * @param {string} id ID del requerimiento.
   * @param {string} destino Estado pedido.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada.
   */
  async cambiarEstadoIA(id, destino, actor) {
    this._exigirSuperadmin(actor);
    const config = await this.obtener(id, actor);
    const actual = config.requerimiento.estadoIA;
    const error = errorTransicion(actual, destino, {
      tieneTipo: Boolean(config.tipo),
      reglasActivas: config.vinculos.filter((v) => v.activa &&
        v.regla?.estado === "activa").length,
      pruebaVigente: config.pruebaVigente,
    });
    if (error) throw new AppError(409, error);
    if (destino === "en_prueba") {
      const conAlerta = config.vinculos.find((v) => v.activa &&
        v.alertas.length);
      if (conAlerta) {
        throw new AppError(409, `Corrija las alertas de la regla ` +
            `${conAlerta.regla?.nombre || ""} antes de pasar a En prueba.`);
      }
    }
    await requerimientoRepository.update(id, {estadoIA: destino,
      updatedBy: actor.uid});
    await bitacoraLogger.registrarEvento({
      mandanteId: config.requerimiento.mandanteId, entidad: "requerimiento",
      entidadId: id, accion: "transicion_estado_ia", actor,
      detalle: {estadoIAAnterior: actual, estadoIANuevo: destino},
    });
    return this.obtener(id, actor);
  }

  /**
   * Una regla de la biblioteca cambió (nueva versión o estado): los
   * requerimientos que la usan quedan con el cambio registrado (habilitado
   * vuelve a En definición y todos deben probarse de nuevo).
   * @param {string} reglaId ID de la regla.
   * @param {Object} actor Usuario autenticado.
   * @param {Object} detalle Qué cambió.
   * @return {Promise<{afectados: number, vuelvenADefinicion: number}>}
   *     Resumen.
   */
  async registrarCambioDeRegla(reglaId, actor, detalle) {
    const vinculos = await requerimientoReglaRepository
        .listActivosByRegla(reglaId);
    const reqs = await requerimientoRepository.getByIds(
        vinculos.map((v) => v.requerimientoId));
    let vuelven = 0;
    for (const req of reqs) {
      if (estadoIADe(req) === "habilitado") vuelven++;
      // eslint-disable-next-line no-await-in-loop
      await this._registrarCambio(req, actor, "regla_ia_modificada",
          {reglaId, ...detalle});
    }
    return {afectados: reqs.length, vuelvenADefinicion: vuelven};
  }

  /**
   * Contexto de la prueba (lo ingresa el usuario o viene de una persona o
   * recurso). Fechas en AAAA-MM-DD o dd/mm/aaaa.
   * @param {*} entrada Contexto recibido.
   * @return {Object} Contexto normalizado.
   */
  _contexto(entrada) {
    const ctx = {};
    const e = entrada && typeof entrada === "object" ? entrada : {};
    CAMPOS_CONTEXTO.forEach((k) => {
      const v = e[k] === undefined || e[k] === null ? "" :
        String(e[k]).trim().slice(0, 200);
      if (!v) return;
      if (k.startsWith("fecha")) {
        const iso = aFechaIso(v);
        if (!iso) {
          throw new AppError(400, `Fecha no válida en ${k}: use dd/mm/aaaa.`);
        }
        ctx[k] = iso;
      } else {
        ctx[k] = v;
      }
    });
    return ctx;
  }

  /**
   * Archivos de la prueba (1 o más del mismo sujeto: anverso y reverso).
   * @param {*} archivos [{nombre, rutaRelativa, mime, contenidoBase64}].
   * @return {Array<Object>} Piezas con buffer y metadatos.
   */
  _piezas(archivos) {
    if (!Array.isArray(archivos) || !archivos.length) {
      throw new AppError(400, "Adjunte al menos un archivo.");
    }
    if (archivos.length > MAX_ARCHIVOS) {
      throw new AppError(400, `Máximo ${MAX_ARCHIVOS} archivos por prueba.`);
    }
    let total = 0;
    return archivos.map((a) => {
      const nombre = String(a?.nombre || "").trim().slice(0, 300);
      if (!nombre) throw new AppError(400, "Falta el nombre del archivo.");
      if (!MIMES_PRUEBA.includes(a.mime)) {
        throw new AppError(400, `Formato no soportado en ${nombre}: use ` +
            "PDF, JPG, PNG, WebP o Word .docx.");
      }
      const buffer = Buffer.from(String(a.contenidoBase64 || ""), "base64");
      if (!buffer.length) throw new AppError(400, `${nombre} está vacío.`);
      if (buffer.length > MAX_BYTES_ARCHIVO) {
        throw new AppError(413, `${nombre} supera los 10 MB.`);
      }
      total += buffer.length;
      if (total > MAX_BYTES_TOTAL) {
        throw new AppError(413, "Los archivos suman más de 15 MB; pruebe " +
            "con menos archivos.");
      }
      return {buffer, mime: a.mime, nombre,
        rutaRelativa: a.rutaRelativa ?
          String(a.rutaRelativa).slice(0, 1000) : null,
        parte: Number.isInteger(a.parte) ? a.parte : null,
        tamanoBytes: buffer.length,
        ultimaModificacion: a.ultimaModificacion ?
          String(a.ultimaModificacion).slice(0, 40) : null};
    });
  }

  /**
   * Ejecuta las reglas de un requerimiento sobre unos archivos (lo comparten
   * "Probar reglas" y "Revisar con IA"): una llamada al modelo (campos del
   * tipo + interpretativas), las determinísticas con el contexto y el
   * resultado propuesto. Si el modelo responde mal tras reintentar, avisa a
   * `alFallar` (para registrar el costo) y relanza el error.
   * @param {Object} req Requerimiento.
   * @param {Array<Object>} piezas Archivos (_piezas).
   * @param {Object} contexto Contexto normalizado.
   * @param {Function} alFallar ({snapshot, tipo, modelo, tokensEntrada,
   *     tokensSalida, costoEstimado, mensaje}) => Promise.
   * @return {Promise<Object>} {tipo, snapshot, modelo, umbralConfianza,
   *     camposExtraidos, resultadosReglas, resultadoPropuesto, tokensEntrada,
   *     tokensSalida, costoEstimado, intentos, latenciaMs}.
   */
  async ejecutarReglas(req, piezas, contexto, alFallar) {
    const tipo = await this._tipo(req);
    if (!tipo) throw new AppError(409, "Asigne primero un tipo documental.");
    if (!tipo.campos.length) {
      throw new AppError(409, `El tipo ${tipo.nombre} no tiene campos ` +
          "definidos.");
    }
    const aplicables = this._aplicables(await this._vinculos(req.id));
    if (!aplicables.length) {
      throw new AppError(409, "Agregue al menos una regla activa.");
    }
    const params = await aiConfigService.obtenerParametros();
    const modelo = tipo.modeloPreferido || params.modeloPorDefecto;
    if (costoService.faltanPrecios(params.preciosPorModelo, modelo)) {
      throw new AppError(409, aiConfigService.MENSAJE_SIN_PRECIOS ||
          "Configura los precios del modelo.");
    }
    await aiConfigService.validarLimiteMensual();
    const snapshot = aplicables.map((i) => i.snapshot);
    const interpretativas = snapshot.filter((r) =>
      r.tipo === "interpretativa");
    const costo = (e, s) => costoService.calcular(params.preciosPorModelo,
        modelo, e, s);
    let respuesta;
    try {
      respuesta = await modeloReglasIAService.evaluar({piezas, tipo,
        campos: tipo.campos, interpretativas, modelo});
    } catch (error) {
      if (error.tokens) {
        const {tokensEntrada, tokensSalida} = error.tokens;
        await alFallar({snapshot, tipo, modelo, tokensEntrada, tokensSalida,
          costoEstimado: costo(tokensEntrada, tokensSalida),
          mensaje: error.message});
      }
      throw error;
    }
    const resultadosReglas = aplicarReglas(snapshot,
        respuesta.camposExtraidos, respuesta.interpretativas, contexto);
    return {
      tipo, snapshot, modelo, umbralConfianza: params.umbralConfianzaReglas,
      camposExtraidos: respuesta.camposExtraidos, resultadosReglas,
      resultadoPropuesto: calcularResultadoPropuesto(resultadosReglas,
          {umbralConfianza: params.umbralConfianzaReglas}),
      tokensEntrada: respuesta.tokensEntrada,
      tokensSalida: respuesta.tokensSalida,
      costoEstimado: costo(respuesta.tokensEntrada, respuesta.tokensSalida),
      intentos: respuesta.intentos, latenciaMs: respuesta.latenciaMs,
    };
  }

  /**
   * "Probar reglas": una llamada al modelo con los archivos (extrae los
   * campos del tipo y juzga las interpretativas), luego las determinísticas
   * con el contexto, y el resultado propuesto. Se guarda en pruebasReglasIA
   * con tokens y costo; los archivos no se guardan.
   * @param {string} id ID del requerimiento.
   * @param {Object} payload {archivos, contexto}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Prueba guardada.
   */
  async probar(id, payload, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    if (!ESTADOS_PRUEBA.includes(estadoIADe(req))) {
      throw new AppError(409, "Las reglas se prueban en En definición o En " +
          "prueba.");
    }
    const contexto = this._contexto(payload?.contexto);
    const piezas = this._piezas(payload?.archivos);
    const nombreActor = await this._nombre(actor);
    const base = {
      requerimientoId: id, mandanteId: req.mandanteId || null,
      archivoNombre: piezas.map((p) => p.nombre).join(" + ").slice(0, 500),
      rutaRelativa: piezas[0].rutaRelativa,
      archivos: this._metaArchivos(piezas), contextoUsado: contexto,
      createdBy: actor.uid, createdByNombre: nombreActor,
    };
    // Una respuesta inválida igual consumió tokens: queda registrada (con su
    // costo) pero no cuenta como prueba para habilitar.
    const r = await this.ejecutarReglas(req, piezas, contexto, (f) =>
      pruebaReglaIARepository.create({...base, tipoDocumentalId: f.tipo.id,
        tipoDocumentalNombre: f.tipo.nombre, reglasSnapshot: f.snapshot,
        modelo: f.modelo, error: f.mensaje, camposExtraidos: null,
        resultadosReglas: [], resultadoPropuesto: null,
        tokensEntrada: f.tokensEntrada, tokensSalida: f.tokensSalida,
        costoEstimado: f.costoEstimado}));
    const prueba = await pruebaReglaIARepository.create({...base,
      tipoDocumentalId: r.tipo.id, tipoDocumentalNombre: r.tipo.nombre,
      reglasSnapshot: r.snapshot, modelo: r.modelo,
      umbralConfianza: r.umbralConfianza, error: null,
      camposExtraidos: r.camposExtraidos, resultadosReglas: r.resultadosReglas,
      resultadoPropuesto: r.resultadoPropuesto, tokensEntrada: r.tokensEntrada,
      tokensSalida: r.tokensSalida, costoEstimado: r.costoEstimado,
      intentos: r.intentos, latenciaMs: r.latenciaMs});
    await bitacoraLogger.registrarEvento({
      mandanteId: req.mandanteId || null, entidad: "requerimiento",
      entidadId: id, accion: "prueba_reglas_ia", actor,
      detalle: {pruebaId: prueba.id, resultado: r.resultadoPropuesto.resultado,
        archivos: piezas.length, costoEstimado: prueba.costoEstimado},
    });
    return this._pruebaPublica(prueba);
  }

  /**
   * Metadatos de los archivos (sin contenido).
   * @param {Array<Object>} piezas Piezas (_piezas).
   * @return {Array<Object>} [{nombre, rutaRelativa, mime, parte,
   *     tamanoBytes, ultimaModificacion}].
   */
  _metaArchivos(piezas) {
    return piezas.map((p) => ({nombre: p.nombre, rutaRelativa: p.rutaRelativa,
      mime: p.mime, parte: p.parte, tamanoBytes: p.tamanoBytes,
      ultimaModificacion: p.ultimaModificacion}));
  }

  /**
   * Últimas pruebas del requerimiento.
   * @param {string} id ID del requerimiento.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Array<Object>>} Pruebas.
   */
  async listarPruebas(id, actor) {
    this._exigirSuperadmin(actor);
    await this._requerimiento(id);
    return (await pruebaReglaIARepository.listByRequerimiento(id, 20))
        .map((p) => this._pruebaPublica(p));
  }

  /**
   * Clases de licencia aceptadas por requerimiento, desde su regla
   * "clases_aceptadas" activa (para LC-04 del motor de carpetas).
   * @param {Array<string>} ids IDs de requerimientos.
   * @return {Promise<Map<string, Array<string>>>} requerimientoId → clases.
   */
  async clasesAceptadasPorRequerimiento(ids) {
    const unicos = [...new Set((ids || []).filter(Boolean))];
    const salida = new Map();
    const porReq = await Promise.all(unicos.map((id) => this._vinculos(id)));
    unicos.forEach((id, i) => {
      const clases = this._aplicables(porReq[i])
          .filter((x) => x.snapshot.verificacion === "clases_aceptadas" &&
            !x.snapshot.error)
          .flatMap((x) => x.snapshot.parametros.clases || []);
      if (clases.length) salida.set(id, [...new Set(clases)]);
    });
    return salida;
  }

  /**
   * Cobertura: requerimientos activos y cuántos tienen IA habilitada, por
   * entidad.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {entidad: {total, habilitados}}.
   */
  async cobertura(actor) {
    this._exigirSuperadmin(actor);
    const reqs = await requerimientoRepository.listActivosResumenIA();
    const salida = {};
    ENTIDADES.forEach((e) => {
      const deEntidad = reqs.filter((r) => r.tipoEntidad === e);
      salida[e] = {total: deEntidad.length,
        habilitados: deEntidad.filter((r) =>
          estadoIADe(r) === "habilitado").length};
    });
    return salida;
  }
}

module.exports = new RequerimientoReglaIAService();
module.exports.MAX_BYTES_ARCHIVO = MAX_BYTES_ARCHIVO;
module.exports.MAX_ARCHIVOS = MAX_ARCHIVOS;
