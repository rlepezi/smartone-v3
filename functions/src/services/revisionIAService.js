const sesionRevisionRepository =
    require("../repositories/sesionRevisionRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const resultadoRevisionRepository =
    require("../repositories/resultadoRevisionRepository");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const resultadoCompletitudRepository =
    require("../repositories/resultadoCompletitudRepository");
const empresaRepository = require("../repositories/empresaRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const empresaMandanteRepository =
    require("../repositories/empresaMandanteRepository");
const aiConfigService = require("./aiConfigService");
const costoService = require("./costoService");
const procesamientoService = require("./procesamientoService");
const consolidacionService = require("./consolidacionService");
const resolucionService = require("./resolucionService");
const estructuraRevisionService = require("./estructuraRevisionService");
const {MIMES_ACEPTADOS} = require("./extraccionIAService");
const usuarioRepository = require("../repositories/usuarioRepository");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");
const {inicioDiaSantiago} = require("../utils/fechaSantiago");
const {sumarDias} = require("../utils/reporteCalculos");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const configRevisionExpedienteRepository =
    require("../repositories/configRevisionExpedienteRepository");

// Roles acotados siempre a su propio Mandante.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];
// Tamaño máximo por archivo (ya redimensionado en el navegador). En base64
// pesa ~4/3: 10 MB quedan bajo el límite de 25 MB del parser JSON de la API.
const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;
const RE_HASH = /^[a-f0-9]{64}$/;
const MODOS = ["completitud", "completitud_ia"];
const FUENTES = ["carpeta_local", "sharepoint"];
const ESTADOS_SESION = ["en_proceso", "completada", "cancelada"];
const LIMITE_PAGINA = 20;
const ORIGENES = ["modulo", "expediente"];
const MAX_VUELTAS_ORIGEN = 5;
const LIMITE_PAGINA_MAXIMO = 50;

/**
 * Sesiones de Revisión IA: creación desde el plan de estructura
 * (completitud y, opcionalmente, validación con IA), envío de cada archivo,
 * consolidación por entidad, historial y resolución.
 */
class RevisionIAService {
  /**
   * Valida que el actor pueda operar en el Mandante y que exista.
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @return {Promise<string>} mandanteId validado.
   */
  async _mandante(actor, mandanteId) {
    if (!mandanteId) throw new AppError(400, "Falta el Mandante.");
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
        actor.mandanteId !== mandanteId) {
      throw new AppError(403, "No tiene acceso a este Mandante.");
    }
    const mandante = await mandanteRepository.getById(mandanteId);
    if (!mandante) throw new AppError(404, "Mandante no encontrado.");
    return mandanteId;
  }

  /**
   * Sesión accesible por el actor.
   * @param {string} id ID de la sesión.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Sesión.
   */
  async obtenerSesion(id, actor) {
    const sesion = await sesionRevisionRepository.getById(id);
    if (!sesion ||
        (ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
         actor.mandanteId !== sesion.mandanteId)) {
      throw new AppError(404, "Sesión de revisión no encontrada.");
    }
    return sesion;
  }

  /**
   * Costo estimado de un conjunto de archivos con el modelo por defecto.
   * @param {{mandanteId: string, archivos: Object[]}} payload Archivos
   *     ({mime, tamanoBytes, paginas?}).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{costoEstimadoUsd: number, modelo: string}>} Estimación.
   */
  async estimar({mandanteId, archivos}, actor) {
    await this._mandante(actor, mandanteId);
    if (!Array.isArray(archivos)) {
      throw new AppError(400, "'archivos' debe ser una lista.");
    }
    const {modeloPorDefecto: modelo, preciosPorModelo} =
        await aiConfigService.obtenerParametros();
    if (costoService.faltanPrecios(preciosPorModelo, modelo)) {
      return {
        costoEstimadoUsd: null, modelo, faltanPrecios: true,
        mensaje: aiConfigService.MENSAJE_SIN_PRECIOS,
      };
    }
    return {
      costoEstimadoUsd: costoService.estimar(preciosPorModelo, modelo,
          archivos),
      modelo,
      faltanPrecios: false,
    };
  }

  /**
   * Crea una sesión de revisión a partir del plan de estructura: persiste
   * la completitud (sin IA) y, en modo "completitud_ia", deja la sesión en
   * proceso con los archivos a enviar a la IA. Cada empresa detectada debe
   * venir con su enlace confirmado por el usuario (Empresa y Expediente, o
   * null = sin enlace).
   * @param {Object} payload {mandanteId, nombre?, carpetaRaizNombre, modo,
   *     arbol, calcesManuales, enlaces: {empresaCarpeta: {empresaId,
   *     expedienteId}}}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{sesion: Object, archivosIA: Object[]}>} Sesión y
   *     archivos que el navegador debe enviar.
   */
  async crearSesion(payload, actor) {
    const mandanteId = await this._mandante(actor, payload.mandanteId);
    const carpetaRaizNombre = String(payload.carpetaRaizNombre || "").trim();
    if (!carpetaRaizNombre || /[\\/:]/.test(carpetaRaizNombre)) {
      throw new AppError(400,
          "Falta el nombre de la carpeta (solo el nombre, sin ruta).");
    }
    if (!MODOS.includes(payload.modo)) {
      throw new AppError(400, `Modo no válido. Valores: ${MODOS.join(", ")}.`);
    }
    const conIA = payload.modo === "completitud_ia";
    const enlaces = payload.enlaces || {};
    // Carpeta libre: sin plantilla ni completitud, siempre con IA.
    const libre = payload.modoEstructura === "libre";
    if (libre && !conIA) {
      throw new AppError(400, "La revisión de carpeta libre requiere " +
          "validación IA.");
    }
    // Desde un Expediente: empresa y expediente fijos, solo sus personas y
    // los requerimientos habilitados (ver estructuraRevisionService).
    const expedienteId = payload.expedienteId ?
      String(payload.expedienteId) : null;
    const plan = await estructuraRevisionService.analizar({
      mandanteId, arbol: payload.arbol,
      calcesManuales: payload.calcesManuales || {}, enlaces,
      modoEstructura: libre ? "libre" : "plantilla",
      expedienteId, requerimientoIds: payload.requerimientoIds,
      omitirValidados: payload.omitirValidados === true,
    }, actor);
    if (!plan.tipoEstructura) throw new AppError(409, plan.advertencias[0]);
    if (expedienteId && conIA && !plan.empresas[0].archivosIA.length) {
      throw new AppError(409, "No hay documentos que enviar a la IA: revise " +
          "las personas sin carpeta o desmarque \"No volver a enviar " +
          "documentos ya validados\".");
    }
    if (libre && !plan.empresas[0].archivosIA.length) {
      throw new AppError(409, "La carpeta no tiene archivos que la IA " +
          "pueda leer (PDF, JPG, PNG, WebP o Word .docx de hasta 10 MB).");
    }
    if (!libre && !plan.alcance.resumen.documentosHabilitados) {
      throw new AppError(409, "No hay documentos habilitados en la " +
          "plantilla: la revisión no tendría nada que revisar.");
    }
    const empresasDetectadas = [];
    for (const e of plan.empresas) {
      if (!libre && !expedienteId &&
          !Object.prototype.hasOwnProperty.call(enlaces, e.empresaCarpeta)) {
        throw new AppError(400, `Confirme la Empresa y el Expediente de ` +
            `"${e.empresaCarpeta}".`);
      }
      // eslint-disable-next-line no-await-in-loop
      empresasDetectadas.push(await this._enlaceConfirmado(e, expedienteId ?
        {empresaId: e.enlaceSugerido.empresaId, expedienteId} :
        enlaces[e.empresaCarpeta], mandanteId));
    }

    let modelo = null;
    if (conIA) {
      await aiConfigService.obtenerApiKey();
      await aiConfigService.validarLimiteMensual();
      const parametros = await aiConfigService.obtenerParametros();
      modelo = parametros.modeloPorDefecto;
      if (costoService.faltanPrecios(parametros.preciosPorModelo, modelo)) {
        throw new AppError(409, aiConfigService.MENSAJE_SIN_PRECIOS);
      }
    }
    const archivosIA = conIA ? plan.empresas.flatMap((e) => e.archivosIA) : [];
    const enProceso = archivosIA.length > 0;
    const nombre = String(payload.nombre || "").trim() ||
        `${carpetaRaizNombre} ${new Date().toISOString().slice(0, 10)}`;
    const sesion = await sesionRevisionRepository.create({
      mandanteId,
      nombre,
      fuente: "carpeta_local",
      carpetaRaizNombre,
      modoEstructura: libre ? "libre" : "plantilla",
      origen: expedienteId ? "expediente" : "modulo",
      expedienteId,
      requerimientoIds: plan.expediente?.requerimientoIds || null,
      // Persona del Expediente calzada a cada carpeta: la consolidación la
      // contrasta con el RUN leído (conflicto_run si no coinciden).
      personasPorEntidad: plan.expediente?.personasPorEntidad || null,
      plantillaId: plan.plantilla?.plantillaId || null,
      plantillaVersion: plan.plantilla?.version || null,
      modo: payload.modo,
      empresasDetectadas,
      estado: enProceso ? "en_proceso" : "completada",
      modelo,
      totales: {
        carpetas: plan.empresas.reduce((s, e) => s + e.entidades.length, 0),
        archivos: archivosIA.length,
        procesados: 0,
        omitidos: conIA ? plan.empresas.reduce((s, e) =>
          s + e.archivosExcluidosIA.length, 0) : 0,
        errores: 0,
        cumple: 0,
        noCumple: 0,
        revisionHumana: 0,
      },
      costoEstimadoUsd: conIA ? plan.costoEstimadoUsd || 0 : 0,
      costoRealUsd: 0,
      createdBy: actor.uid,
      finalizadaAt: enProceso ? null : new Date(),
    });
    await resultadoCompletitudRepository.createMany(
        this._resultadosCompletitud(plan, empresasDetectadas, sesion));
    if (expedienteId) {
      await configRevisionExpedienteRepository.guardar(expedienteId, {
        ultimaSesionId: sesion.id,
        ...(enProceso ? {} : {ultimaValidacionAt: new Date()}),
      });
    }
    await bitacoraLogger.registrarEvento({
      mandanteId, entidad: "sesionesRevision", entidadId: sesion.id,
      accion: "creado", actor,
      detalle: {nombre, modo: payload.modo, modelo,
        empresas: empresasDetectadas.length, archivosIA: archivosIA.length},
    });
    return {sesion, archivosIA};
  }

  /**
   * Enlace confirmado de una empresa detectada: valida que la Empresa sea
   * del Mandante y el Expediente, de esa Empresa.
   * @param {Object} empresaPlan Empresa del plan.
   * @param {?Object} enlace {empresaId, expedienteId} (null = sin enlace).
   * @param {string} mandanteId Mandante.
   * @return {Promise<Object>} Empresa detectada para la sesión.
   */
  async _enlaceConfirmado(empresaPlan, enlace, mandanteId) {
    const empresaId = enlace?.empresaId || null;
    const expedienteId = empresaId ? enlace?.expedienteId || null : null;
    let empresaNombre = null;
    if (empresaId) {
      if (!(await empresaMandanteRepository.estaActiva(empresaId,
          mandanteId))) {
        throw new AppError(400, `La empresa elegida para ` +
            `"${empresaPlan.empresaCarpeta}" no pertenece al Mandante.`);
      }
      empresaNombre = (await empresaRepository.getById(empresaId))
          ?.razonSocial || null;
    }
    if (expedienteId) {
      const expediente = await expedienteRepository.getById(expedienteId);
      if (!expediente || expediente.empresaId !== empresaId ||
          expediente.mandanteId !== mandanteId) {
        throw new AppError(400, `El expediente elegido para ` +
            `"${empresaPlan.empresaCarpeta}" no es de esa empresa.`);
      }
    }
    return {
      empresaCarpeta: empresaPlan.empresaCarpeta,
      esSubcontrato: empresaPlan.esSubcontrato,
      nombreEmpresaDetectado: empresaPlan.nombreEmpresaDetectado,
      textoProyecto: empresaPlan.textoProyecto || null,
      empresaId, empresaNombre, expedienteId,
    };
  }

  /**
   * Resultados de completitud a persistir (uno por empresa × sección ×
   * entidad).
   * @param {Object} plan Plan de estructura.
   * @param {Object[]} empresasDetectadas Enlaces confirmados.
   * @param {Object} sesion Sesión.
   * @return {Object[]} Documentos.
   */
  _resultadosCompletitud(plan, empresasDetectadas, sesion) {
    const enlace = new Map(empresasDetectadas.map((e) =>
      [e.empresaCarpeta, e]));
    return plan.empresas.flatMap((e) => {
      const runPorEntidad = new Map(e.entidades.map((x) =>
        [x.entidadCarpeta, x.runCarpeta]));
      return e.secciones.map((r) => ({
        mandanteId: sesion.mandanteId,
        sesionId: sesion.id,
        empresaCarpeta: e.empresaCarpeta,
        esSubcontrato: e.esSubcontrato,
        empresaId: enlace.get(e.empresaCarpeta)?.empresaId || null,
        expedienteId: enlace.get(e.empresaCarpeta)?.expedienteId || null,
        seccionClave: r.seccionClave || null,
        seccionCarpeta: r.seccionCarpeta || null,
        calce: r.calce,
        entidadCarpeta: r.entidadCarpeta || null,
        entidadNombre: r.entidadNombre || null,
        entidadTipo: r.entidadTipo || null,
        entidadClave: r.entidadClave || null,
        entidadId: r.entidadId || null,
        runCarpeta: r.entidadCarpeta ?
            runPorEntidad.get(r.entidadCarpeta) || null : null,
        esperado: r.esperado || {},
        encontrado: r.encontrado || 0,
        documentosEncontrados: r.documentosEncontrados || [],
        documentosFaltantes: r.documentosFaltantes || [],
        documentosIgnorados: r.documentosIgnorados || [],
        archivosNoReconocidos: r.archivosNoReconocidos || [],
        calceArchivos: r.calceArchivos || [],
        advertencias: r.advertencias || [],
        estado: r.estado,
      }));
    });
  }

  /**
   * Procesa un archivo de una sesión.
   * @param {string} sesionId ID de la sesión.
   * @param {Object} payload {entidadClave, archivoMeta (con empresaCarpeta,
   *     seccionClave, entidadCarpeta, documentoClave,
   *     fechaEnNombreArchivo), contenidoBase64}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Procesamiento creado.
   */
  async procesarArchivo(sesionId, payload, actor) {
    const sesion = await this.obtenerSesion(sesionId, actor);
    if (sesion.estado !== "en_proceso") {
      throw new AppError(409, "La sesión no está en proceso.");
    }
    const entidadClave = String(payload.entidadClave || "").trim();
    const meta = payload.archivoMeta || {};
    if (!entidadClave || entidadClave.length > 500) {
      throw new AppError(400, "Falta la entidad del archivo.");
    }
    if (!MIMES_ACEPTADOS.includes(meta.mime)) {
      throw new AppError(400, `Formato no soportado: ${meta.mime}.`);
    }
    if (!RE_HASH.test(String(meta.hashSha256 || ""))) {
      throw new AppError(400, "Falta el hash SHA-256 del archivo.");
    }
    if (!meta.nombre || !meta.rutaRelativa) {
      throw new AppError(400, "Faltan el nombre o la ruta del archivo.");
    }
    const buffer = Buffer.from(String(payload.contenidoBase64 || ""),
        "base64");
    if (buffer.length === 0) throw new AppError(400, "El archivo está vacío.");
    if (buffer.length > MAX_BYTES_ARCHIVO) {
      throw new AppError(413, "El archivo supera los 10 MB.");
    }
    const texto = (v) => (v ? String(v).slice(0, 500) : null);
    return await procesamientoService.procesarDocumento({
      sesion,
      carpetaRelativa: entidadClave,
      archivoMeta: {
        rutaRelativa: String(meta.rutaRelativa),
        nombre: String(meta.nombre),
        mime: meta.mime,
        tamanoBytes: Math.max(parseInt(meta.tamanoBytes, 10) || 0, 0),
        hashSha256: meta.hashSha256,
        ultimaModificacion: meta.ultimaModificacion || null,
      },
      contexto: {
        empresaCarpeta: texto(meta.empresaCarpeta),
        seccionClave: texto(meta.seccionClave),
        entidadCarpeta: texto(meta.entidadCarpeta),
        documentoClave: texto(meta.documentoClave),
        fechaEnNombreArchivo: texto(meta.fechaEnNombreArchivo),
      },
      buffer,
    });
  }

  /**
   * Consolida una entidad (persona) de la sesión, al terminar sus archivos.
   * @param {string} sesionId ID de la sesión.
   * @param {{entidadClave: string}} payload Entidad.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {resultados, noNormalizados}.
   */
  async consolidar(sesionId, {entidadClave}, actor) {
    const sesion = await this.obtenerSesion(sesionId, actor);
    if (sesion.estado === "cancelada") {
      throw new AppError(409, "La sesión fue cancelada.");
    }
    const clave = String(entidadClave || "").trim();
    if (!clave) throw new AppError(400, "Falta la entidad.");
    const consolidado = await consolidacionService.consolidarEntidad({
      sesion, entidadClave: clave,
    });
    // Requerimientos en modo "automatico": lo que cumple todas las reglas
    // se acepta sin esperar al evaluador (ver resolucionService).
    return {
      ...consolidado,
      resultados: await resolucionService.aceptarAutomaticos(
          consolidado.resultados, actor,
      ),
    };
  }

  /**
   * Cierra la sesión: "completada" (con el costo real sumado desde sus
   * procesamientos) o "cancelada".
   * @param {string} sesionId ID de la sesión.
   * @param {string} estado "completada" | "cancelada".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Sesión actualizada.
   */
  async cerrar(sesionId, estado, actor) {
    const sesion = await this.obtenerSesion(sesionId, actor);
    if (sesion.estado !== "en_proceso") {
      throw new AppError(409, "La sesión ya no está en proceso.");
    }
    const cambios = {estado, finalizadaAt: new Date()};
    if (estado === "completada") {
      const procesamientos =
          await procesamientoIARepository.listBySesion(sesionId);
      cambios.costoRealUsd = Math.round(procesamientos
          .reduce((s, p) => s + (p.costoUsd || 0), 0) * 1000000) / 1000000;
    }
    const actualizada = await sesionRevisionRepository.update(sesionId,
        cambios);
    if (sesion.expedienteId && estado === "completada") {
      await configRevisionExpedienteRepository.guardar(sesion.expedienteId,
          {ultimaValidacionAt: new Date()});
    }
    await bitacoraLogger.registrarEvento({
      mandanteId: sesion.mandanteId, entidad: "sesionesRevision",
      entidadId: sesionId, accion: estado, actor,
      detalle: {totales: actualizada.totales,
        costoRealUsd: actualizada.costoRealUsd},
    });
    return actualizada;
  }

  /**
   * Historial de sesiones del alcance del actor, filtrado y paginado por
   * cursor. Agrega el nombre del Mandante y de quien la creó.
   * @param {Object} filtros {mandanteId, fuente, estado, desde, hasta
   *     (AAAA-MM-DD), cursor, limite}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{items: Object[], cursor: ?string}>} Página.
   */
  async listar(filtros = {}, actor) {
    const mandanteId = ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        actor.mandanteId : (filtros.mandanteId || null);
    const fuente = filtros.fuente || null;
    const estado = filtros.estado || null;
    if (fuente && !FUENTES.includes(fuente)) {
      throw new AppError(400, `Fuente no válida: ${fuente}.`);
    }
    if (estado && !ESTADOS_SESION.includes(estado)) {
      throw new AppError(400, `Estado no válido: ${estado}.`);
    }
    const fecha = (valor, campo) => {
      if (!valor) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new AppError(400, `${campo} debe tener el formato AAAA-MM-DD.`);
      }
      return valor;
    };
    const desde = fecha(filtros.desde, "desde");
    const hasta = fecha(filtros.hasta, "hasta");
    const limite = Math.min(Math.max(parseInt(filtros.limite, 10) ||
        LIMITE_PAGINA, 1), LIMITE_PAGINA_MAXIMO);
    const origen = filtros.origen || null;
    if (origen && !ORIGENES.includes(origen)) {
      throw new AppError(400, `Origen no válido: ${origen}.`);
    }
    // El origen se filtra en memoria (las sesiones anteriores no tienen el
    // campo y cuentan como "modulo"): se piden páginas hasta llenar la
    // pedida, con un tope de vueltas.
    const buscar = (cursor) => sesionRevisionRepository.buscar({
      mandanteId, fuente, estado,
      desde: desde ? inicioDiaSantiago(desde) : null,
      antesDe: hasta ? inicioDiaSantiago(sumarDias(hasta, 1)) : null,
      cursor, limite,
    });
    const delOrigen = (x) => !origen || (x.origen || "modulo") === origen;
    let pagina = await buscar(filtros.cursor || null);
    let items = pagina.items.filter(delOrigen);
    for (let vuelta = 0; origen && items.length < limite && pagina.cursor &&
        vuelta < MAX_VUELTAS_ORIGEN; vuelta++) {
      // eslint-disable-next-line no-await-in-loop
      pagina = await buscar(pagina.cursor);
      items = items.concat(pagina.items.filter(delOrigen));
    }
    pagina = {items: items.slice(0, limite),
      cursor: items.length > limite ? items[limite - 1].id : pagina.cursor};
    const expedienteIds = [...new Set(pagina.items.map((x) => x.expedienteId)
        .filter(Boolean))];
    const [mandantes, usuarios, expedientes] = await Promise.all([
      mandanteRepository.getByIds(pagina.items.map((x) => x.mandanteId)),
      usuarioRepository.getByIds(pagina.items.map((x) => x.createdBy)),
      Promise.all(expedienteIds.map((id) => expedienteRepository.getById(id))),
    ]);
    const empresasExp = await empresaRepository.getByIds(
        expedientes.filter(Boolean).map((x) => x.empresaId));
    const nombreEmpresa = new Map(empresasExp.map((e) =>
      [e.id, e.razonSocial]));
    const nombreExpediente = new Map(expedientes.filter(Boolean).map((x) =>
      [x.id, nombreEmpresa.get(x.empresaId) || x.id]));
    const nombreMandante = new Map(mandantes.map((m) =>
      [m.id, getMandanteDisplayName(m) || m.id]));
    const nombreUsuario = new Map(usuarios.map((u) =>
      [u.id, `${u.nombre || ""} ${u.apellido || ""}`.trim() || u.email]));
    return {
      items: pagina.items.map((x) => ({
        ...x,
        mandanteNombre: nombreMandante.get(x.mandanteId) || x.mandanteId,
        creadoPorNombre: nombreUsuario.get(x.createdBy) || null,
        origen: x.origen || "modulo",
        expedienteNombre: x.expedienteId ?
          nombreExpediente.get(x.expedienteId) || null : null,
      })),
      cursor: pagina.cursor,
    };
  }

  /**
   * Detalle de una sesión con sus resultados y procesamientos.
   * @param {string} sesionId ID de la sesión.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {sesion, resultados, procesamientos}.
   */
  async detalle(sesionId, actor) {
    const sesion = await this.obtenerSesion(sesionId, actor);
    const [resultados, procesamientos, completitud] = await Promise.all([
      resultadoRevisionRepository.listBySesion(sesionId),
      procesamientoIARepository.listBySesion(sesionId),
      resultadoCompletitudRepository.listBySesion(sesionId),
    ]);
    return {sesion, resultados, procesamientos, completitud};
  }

  /**
   * Resuelve un resultado (aceptar, corregir o descartar).
   * @param {string} resultadoId ID del resultado.
   * @param {Object} payload {accion, resultadoFinal?, observacion?}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Resolución.
   */
  async resolver(resultadoId, payload, actor) {
    const resultado = await resultadoRevisionRepository.getById(resultadoId);
    if (!resultado) throw new AppError(404, "Resultado no encontrado.");
    await this.obtenerSesion(resultado.sesionId, actor);
    return resolucionService.resolver(resultadoId, payload, actor);
  }

  /**
   * Tipos documentales activos (para el selector del Requerimiento).
   * @return {Promise<Object[]>} [{id, codigo, nombre, estadoIA}].
   */
  async listarTiposDocumentales() {
    return (await tipoDocumentalRepository.list())
        .filter((t) => t.estado === "activo")
        .map(({id, codigo, nombre, estadoIA}) => ({id, codigo, nombre,
          estadoIA}))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }
}

module.exports = new RevisionIAService();
