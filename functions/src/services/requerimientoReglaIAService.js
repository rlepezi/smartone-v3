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
const registroConsumoIAService = require("./registroConsumoIAService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {aFecha} = require("../utils/vencimientos");
const AppError = require("../utils/AppError");
const {
  ENTIDADES, conDefaults, disponibleParaIA, validarCampos,
} = require("../reglasIA/tiposDocumentales");
const {
  estadoIADe, estadoTrasCambio, errorTransicion,
} = require("../reglasIA/estadoIA");
const {snapshotRegla, aplicarReglas} = require("../reglasIA/prueba");
const {calcularResultadoPropuesto} = require("../reglasIA/resultado");
const {validarParametros} = require("../reglasIA/verificaciones");
const {aFechaIso} = require("../reglasIA/verificaciones/comunes");
const {camposEfectivos} = require("../reglasIA/camposEfectivos");
const {tipoDeRequerimiento} = require("../utils/ubicacionRequerimiento");
const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");

const SEVERIDADES = ["bloqueante", "advertencia"];
const ETIQUETA_ENTIDAD = {persona: "Persona", empresa: "Empresa",
  recurso: "Maquinaria"};
// Los campos del tipo se suman a los de las reglas SOLO si el tipo sale del
// documento de la plantilla vinculado (no del guardado de respaldo).
const tipoDePlantilla = (tipo) => (tipo?.origen === "plantilla" ? tipo : null);
// Campos que la IA lee además de los de las reglas: los propios del
// requerimiento (copiados del tipo cuando un superadmin lo guarda) o, si aún
// no los tiene, los del tipo del documento de la plantilla (como hasta ahora).
const camposAdicionalesDe = (req, tipo) =>
  (Array.isArray(req.camposAdicionales) ? req.camposAdicionales :
    tipoDePlantilla(tipo)?.campos || []);
const soloCampo = ({clave, etiqueta, tipo}) => ({clave, etiqueta, tipo});
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
   * Catálogo de tipos y plantilla activa del Mandante, para resolver el tipo
   * de uno o varios requerimientos con una sola lectura.
   * @param {?string} mandanteId Mandante.
   * @return {Promise<{tipos: Object[], plantilla: ?Object}>} Datos.
   */
  async _datosTipo(mandanteId) {
    const [tipos, plantilla] = await Promise.all([
      tipoDocumentalRepository.list(),
      mandanteId ? plantillaEstructuraRepository.getActiva(mandanteId)
          .catch(() => null) : null,
    ]);
    return {tipos, plantilla};
  }

  /**
   * Tipo documental del requerimiento (con defaults y `origen`), o null. Sale
   * del documento de la plantilla activa vinculado a él (origen
   * "plantilla"); el guardado en el requerimiento es solo respaldo (origen
   * "guardado"). Sin ninguno, no tiene tipo (no es error).
   * @param {Object} req Requerimiento.
   * @param {?Object} [datos] _datosTipo ya leídos (varios requerimientos del
   *     mismo Mandante).
   * @return {Promise<?Object>} Tipo.
   */
  async _tipo(req, datos = null) {
    const {tipos, plantilla} = datos || await this._datosTipo(req.mandanteId);
    const {tipo, origen} = tipoDeRequerimiento({requerimiento: req, plantilla,
      tipoEntidad: req.tipoEntidad || "persona",
      tiposPorCodigo: new Map(tipos.map((t) => [t.codigo, t])),
      tipoGuardado: req.tipoDocumentalId ?
        tipos.find((t) => t.id === req.tipoDocumentalId) || null : null});
    return tipo ? {...conDefaults(tipo), origen} : null;
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
   * Alertas de un vínculo (regla inactiva, entidad incompatible, parámetros
   * inválidos). Los campos que la regla necesita no generan alerta: se
   * agregan solos a lo que la IA extrae (camposEfectivos).
   * @param {Object} item {vinculo, regla, snapshot}.
   * @param {Object} req Requerimiento.
   * @return {Array<string>} Alertas.
   */
  _alertas({regla, snapshot}, req) {
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
    const {estado, aviso} = estadoTrasCambio(anterior);
    const copia = extra.camposAdicionales === undefined ?
      await this.copiaCamposAdicionales(req) : null;
    if (copia) {
      extra = {...extra, camposAdicionales: copia};
      detalle = {...detalle,
        camposAdicionalesCopiados: copia.map((c) => c.clave)};
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
   * Campos adicionales a copiar del tipo al requerimiento al guardarlo: los
   * del tipo del documento de la plantilla, si el requerimiento aún no tiene
   * los suyos (así lo que la IA lee no cambia). null si no hay que copiar.
   * @param {Object} req Requerimiento.
   * @return {Promise<?Array<Object>>} Campos, o null.
   */
  async copiaCamposAdicionales(req) {
    if (Array.isArray(req.camposAdicionales)) return null;
    const campos = tipoDePlantilla(await this._tipo(req))?.campos || [];
    return campos.length ? campos.map(soloCampo) : null;
  }

  /**
   * Edita los campos adicionales que la IA lee en este requerimiento (además
   * de los que piden las reglas). Una lista vacía deja solo los de las reglas.
   * @param {string} id ID del requerimiento.
   * @param {*} campos [{clave, etiqueta, tipo}].
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada (+ aviso).
   */
  async asignarCamposAdicionales(id, campos, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    if (!Array.isArray(campos)) {
      throw new AppError(400, "Indique la lista de campos.");
    }
    let nuevos = [];
    if (campos.length) {
      const v = validarCampos(campos);
      if (!v.ok) throw new AppError(400, v.error);
      nuevos = v.valor.map(soloCampo);
    }
    const anteriores = camposAdicionalesDe(req, await this._tipo(req));
    if (Array.isArray(req.camposAdicionales) &&
        JSON.stringify(req.camposAdicionales) === JSON.stringify(nuevos)) {
      return this.obtener(id, actor);
    }
    const aviso = await this._registrarCambio(req, actor,
        "campos_adicionales_ia", {
          anteriores: anteriores.map((c) => c.clave),
          nuevos: nuevos.map((c) => c.clave),
        }, {camposAdicionales: nuevos});
    return {...await this.obtener(id, actor), aviso};
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
    const [datosTipo, items, pruebas] = await Promise.all([
      this._datosTipo(req.mandanteId), this._vinculos(id),
      pruebaReglaIARepository.listByRequerimiento(id, ULTIMAS_PRUEBAS),
    ]);
    const tipos = datosTipo.tipos;
    const tipo = await this._tipo(req, datosTipo);
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
      alertas: this._alertas(i, req),
    }));
    const aplicables = this._aplicables(items);
    const ultima = pruebas.find((p) => !p.error) || null;
    const condiciones = {
      reglasActivas: aplicables.length,
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
        modeloPreferidoIA: req.modeloPreferidoIA || null,
        reglasIAActualizadasAt: aISO(req.reglasIAActualizadasAt)},
      // Lo que la IA leerá al revisar: los campos de las reglas aplicables
      // (más los del tipo, si sale del documento de la plantilla).
      camposIA: camposEfectivos({campos: camposAdicionalesDe(req, tipo)},
          aplicables.map((i) => i.snapshot)),
      // Campos adicionales: propios (del requerimiento) o heredados del tipo.
      camposAdicionales: {propios: Array.isArray(req.camposAdicionales),
        campos: camposAdicionalesDe(req, tipo).map(soloCampo),
        tipoNombre: tipoDePlantilla(tipo)?.nombre || null},
      tipo: tipo ? {id: tipo.id, codigo: tipo.codigo, nombre: tipo.nombre,
        estadoIA: tipo.estadoIA, entidades: tipo.entidades,
        campos: tipo.campos, origen: tipo.origen} : null,
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
   * Asigna (o quita, con null) el tipo documental, que es OPCIONAL: sus
   * campos se suman a los que piden las reglas.
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
    }
    const aviso = await this._registrarCambio(req, actor,
        "tipo_documental_ia", {
          tipoAnterior: req.tipoDocumentalId || null, tipoNuevo: nuevoId,
          tipoNombre: tipo?.nombre || null,
        }, {tipoDocumentalId: nuevoId});
    return {...await this.obtener(id, actor), aviso};
  }

  /**
   * Modelo de IA del requerimiento (null = el del tipo, si hay, o el modelo
   * por defecto). Debe tener precios configurados.
   * @param {string} id ID del requerimiento.
   * @param {?string} modelo Modelo, o null.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Configuración actualizada (+ aviso).
   */
  async asignarModelo(id, modelo, actor) {
    this._exigirSuperadmin(actor);
    const req = await this._requerimiento(id);
    const nuevo = modelo ? String(modelo).trim() : null;
    if ((req.modeloPreferidoIA || null) === nuevo) {
      return this.obtener(id, actor);
    }
    if (nuevo) {
      const params = await aiConfigService.obtenerParametros();
      if (costoService.faltanPrecios(params.preciosPorModelo, nuevo)) {
        throw new AppError(400, `El modelo ${nuevo} no tiene precios ` +
            "configurados.");
      }
    }
    const aviso = await this._registrarCambio(req, actor, "modelo_ia", {
      modeloAnterior: req.modeloPreferidoIA || null, modeloNuevo: nuevo,
    }, {modeloPreferidoIA: nuevo});
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
    // "Documento legible": sin umbral indicado, parte del umbral del tipo.
    let parametros = payload.parametros;
    if (regla.verificacion === "documento_legible" &&
        parametros?.umbral === undefined &&
        typeof tipo?.umbralLegibilidad === "number") {
      parametros = {...(parametros || {}),
        umbral: Math.round(tipo.umbralLegibilidad * 100)};
    }
    const vinculo = await this._crearVinculo(req, regla, items, tipo, {
      severidad: this._severidad(payload.severidad),
      parametros: this._parametros(regla, parametros),
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
   *     tokensSalida, costoEstimado, precio, mensaje}) => Promise.
   * @return {Promise<Object>} {tipo, snapshot, modelo, umbralConfianza,
   *     camposExtraidos, resultadosReglas, resultadoPropuesto, tokensEntrada,
   *     tokensSalida, costoEstimado, precio, intentos, latenciaMs}. `precio`:
   *     el vigente del modelo, para el registro de consumo.
   */
  async ejecutarReglas(req, piezas, contexto, alFallar) {
    // El tipo documental es opcional: los campos salen de las reglas (más los
    // del tipo, si hay) y el documento esperado es el requerimiento.
    const tipo = await this._tipo(req);
    const aplicables = this._aplicables(await this._vinculos(req.id));
    if (!aplicables.length) {
      throw new AppError(409, "Agregue al menos una regla activa.");
    }
    const params = await aiConfigService.obtenerParametros();
    const modelo = req.modeloPreferidoIA || tipo?.modeloPreferido ||
      params.modeloPorDefecto;
    if (costoService.faltanPrecios(params.preciosPorModelo, modelo)) {
      throw new AppError(409, aiConfigService.MENSAJE_SIN_PRECIOS ||
          "Configura los precios del modelo.");
    }
    await aiConfigService.validarLimiteMensual();
    const snapshot = aplicables.map((i) => i.snapshot);
    const interpretativas = snapshot.filter((r) =>
      r.tipo === "interpretativa");
    const campos = camposEfectivos({campos: camposAdicionalesDe(req, tipo)},
        snapshot);
    const costo = (e, s) => costoService.calcular(params.preciosPorModelo,
        modelo, e, s);
    let respuesta;
    try {
      respuesta = await modeloReglasIAService.evaluar({piezas,
        tipo: {nombre: req.nombreCorto || req.nombre || tipo?.nombre},
        campos, interpretativas, modelo});
    } catch (error) {
      if (error.tokens) {
        const {tokensEntrada, tokensSalida} = error.tokens;
        await alFallar({snapshot, tipo, modelo, tokensEntrada, tokensSalida,
          costoEstimado: costo(tokensEntrada, tokensSalida),
          precio: costoService.precioDe(params.preciosPorModelo, modelo),
          mensaje: error.message});
      }
      throw error;
    }
    // La ruta del archivo (carpeta_presente) sale de las piezas, no del
    // contexto que envía el cliente.
    const resultadosReglas = aplicarReglas(snapshot,
        respuesta.camposExtraidos, respuesta.interpretativas,
        {...contexto, rutaArchivo: piezas[0]?.rutaRelativa || null});
    return {
      tipo, snapshot, modelo, umbralConfianza: params.umbralConfianzaReglas,
      camposSolicitados: campos,
      camposExtraidos: respuesta.camposExtraidos, resultadosReglas,
      resultadoPropuesto: calcularResultadoPropuesto(resultadosReglas,
          {umbralConfianza: params.umbralConfianzaReglas}),
      tokensEntrada: respuesta.tokensEntrada,
      tokensSalida: respuesta.tokensSalida,
      costoEstimado: costo(respuesta.tokensEntrada, respuesta.tokensSalida),
      precio: costoService.precioDe(params.preciosPorModelo, modelo),
      intentos: respuesta.intentos, latenciaMs: respuesta.latenciaMs,
    };
  }

  /**
   * Registra en consumosIA una llamada de ejecutarReglas ("Probar reglas" o
   * "Revisar con IA"), asociada al registro que dejó (prueba o revisión).
   * @param {Object} entrada Datos.
   * @param {string} entrada.origen Origen (registroConsumoIAService.ORIGENES).
   * @param {string} entrada.coleccion Colección del registro de origen.
   * @param {Object} entrada.registro Registro creado (prueba o revisión).
   * @param {Object} entrada.ejecucion Resultado de ejecutarReglas o datos de
   *     alFallar ({tipo, modelo, tokensEntrada, tokensSalida, precio}).
   * @param {Object} entrada.actor Usuario autenticado.
   * @return {Promise<void>}
   */
  async registrarConsumo({origen, coleccion, registro, ejecucion, actor}) {
    await registroConsumoIAService.registrar({
      mandanteId: registro.mandanteId || null, origen,
      expedienteId: registro.expedienteId || null,
      requerimientoId: registro.requerimientoId || null,
      tipoDocumentalId: ejecucion.tipo?.id || null,
      tipoDocumentalNombre: ejecucion.tipo?.nombre || null,
      modelo: ejecucion.modelo, tokensEntrada: ejecucion.tokensEntrada,
      tokensSalida: ejecucion.tokensSalida, precio: ejecucion.precio,
      createdBy: actor.uid, fuente: {coleccion, id: registro.id},
    });
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
    const consumo = (registro, ejecucion) => this.registrarConsumo({
      origen: registroConsumoIAService.ORIGENES.PRUEBA_REGLAS,
      coleccion: pruebaReglaIARepository.COLLECTION, registro, ejecucion,
      actor});
    const r = await this.ejecutarReglas(req, piezas, contexto, async (f) =>
      consumo(await pruebaReglaIARepository.create({...base,
        tipoDocumentalId: f.tipo?.id || null,
        tipoDocumentalNombre: f.tipo?.nombre || null,
        reglasSnapshot: f.snapshot,
        modelo: f.modelo, error: f.mensaje, camposExtraidos: null,
        resultadosReglas: [], resultadoPropuesto: null,
        tokensEntrada: f.tokensEntrada, tokensSalida: f.tokensSalida,
        costoEstimado: f.costoEstimado}), f));
    const prueba = await pruebaReglaIARepository.create({...base,
      tipoDocumentalId: r.tipo?.id || null,
      tipoDocumentalNombre: r.tipo?.nombre || null,
      camposSolicitados: r.camposSolicitados,
      reglasSnapshot: r.snapshot, modelo: r.modelo,
      umbralConfianza: r.umbralConfianza, error: null,
      camposExtraidos: r.camposExtraidos, resultadosReglas: r.resultadosReglas,
      resultadoPropuesto: r.resultadoPropuesto, tokensEntrada: r.tokensEntrada,
      tokensSalida: r.tokensSalida, costoEstimado: r.costoEstimado,
      intentos: r.intentos, latenciaMs: r.latenciaMs});
    await consumo(prueba, r);
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
