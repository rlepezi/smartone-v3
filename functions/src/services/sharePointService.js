const graphRepository = require("../repositories/graphRepository");
const fuenteDocumentalRepository =
    require("../repositories/fuenteDocumentalRepository");
const fuenteDocumentalService = require("./fuenteDocumentalService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {
  validarFuenteSharePoint, fuenteActiva,
} = require("../utils/fuentesDocumentales");

// Quiénes navegan la fuente (lectura): los mismos que consultan la fuente
// activa. Los roles del Mandante, solo el suyo; superadmin y evaluador, según
// su alcance actual (cualquier Mandante). Probar la conexión: quienes
// administran la fuente.
const ROLES_NAVEGAN = ["superadmin", "evaluador", "mandante_admin",
  "mandante_lector"];
const ROLES_ADMINISTRAN = ["superadmin", "mandante_admin"];
const ROLES_MANDANTE = ["mandante_admin", "mandante_lector"];

// Sitio, biblioteca y carpeta base resueltos por fuente (no cambian a menudo).
const VIGENCIA_CONTEXTO_MS = 10 * 60 * 1000;
const CAMPOS_ITEM = "id,name,size,lastModifiedDateTime,folder,file," +
  "parentReference,webUrl";
const EXTENSIONES_A_PDF = ["doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp", "rtf"];
// Límite del contenido servido por el backend (MB; configurable por entorno).
const maxBytesContenido = () =>
  (Number(process.env.SHAREPOINT_CONTENIDO_MAX_MB) || 25) * 1024 * 1024;

const SIN_ACCESO_SITIO = "La app no tiene acceso al sitio: falta conceder " +
  "Sites.Selected (con acceso a este sitio) o Sites.Read.All, con " +
  "consentimiento de administrador.";

/**
 * Ruta de un item relativa a la raíz de la biblioteca ("/A/B"), desde su
 * parentReference.path ("/drives/x/root:/A") y su nombre.
 * @param {Object} item Item de Graph.
 * @return {string} Ruta ("" para la raíz).
 */
function rutaEnBiblioteca(item) {
  const padre = item?.parentReference?.path;
  if (!padre) return "";
  const i = padre.indexOf("root:");
  const base = i >= 0 ? decodeURIComponent(padre.slice(i + 5)) : "";
  return `${base.replace(/\/+$/, "")}/${item.name}`;
}

/**
 * Item de Graph en la forma de SmartOne: driveId + itemId (estables al
 * renombrar) y nombre/ruta solo para mostrar.
 * @param {Object} item Item de Graph.
 * @param {Object} ctx Contexto ({driveId, base: {ruta}}).
 * @return {Object} Item.
 */
function aItem(item, ctx) {
  const ruta = rutaEnBiblioteca(item);
  const rutaRelativa = ctx.base.ruta && ruta.toLowerCase()
      .startsWith(`${ctx.base.ruta.toLowerCase()}/`) ?
    ruta.slice(ctx.base.ruta.length + 1) : ruta.replace(/^\//, "");
  return {
    id: item.id,
    driveId: item.parentReference?.driveId || ctx.driveId,
    nombre: item.name,
    tipo: item.folder ? "carpeta" : "archivo",
    tamano: item.folder ? null : Number(item.size || 0),
    hijos: item.folder ? Number(item.folder.childCount || 0) : null,
    modificado: item.lastModifiedDateTime || null,
    rutaRelativa: item.id === ctx.base.id ? "" : rutaRelativa,
    mime: item.file?.mimeType || null,
  };
}

/**
 * Segmentos de una ruta codificados para /root:/<ruta>.
 * @param {string} ruta Ruta.
 * @return {string} Ruta codificada.
 */
const codificarRuta = (ruta) => ruta.split("/").filter(Boolean)
    .map(encodeURIComponent).join("/");

/**
 * Conector SharePoint (Microsoft Graph, solo lectura) de la fuente documental
 * del Mandante. El control de acceso es de SmartOne (las credenciales son de
 * la app): rol y mandanteId del usuario en cada operación.
 */
class SharePointService {
  /**
   * Inicializa el cache de contextos resueltos.
   */
  constructor() {
    this.contextos = new Map();
  }

  /**
   * Mandante que el actor puede navegar.
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @param {string[]} roles Roles admitidos.
   * @return {string} mandanteId.
   */
  _mandante(actor, mandanteId, roles = ROLES_NAVEGAN) {
    if (!roles.includes(actor?.rol)) {
      throw new AppError(403, "No tiene permisos para ver la fuente " +
          "documental.");
    }
    const id = ROLES_MANDANTE.includes(actor.rol) ? actor.mandanteId :
      mandanteId;
    if (!id) throw new AppError(400, "Falta el Mandante.");
    if (mandanteId && id !== mandanteId) {
      throw new AppError(403, "No tiene acceso a este Mandante.");
    }
    return id;
  }

  /**
   * Fuente SharePoint activa del Mandante (con secretos: uso interno).
   * @param {string} mandanteId Mandante.
   * @return {Promise<Object>} Fuente.
   */
  async _fuente(mandanteId) {
    const fuente = fuenteActiva(await fuenteDocumentalRepository.list(
        mandanteId));
    if (!fuente || fuente.tipo !== "sharepoint") {
      throw new AppError(409, "El Mandante no tiene una fuente SharePoint " +
          "activa.", {codigo: "SIN_FUENTE_SHAREPOINT"});
    }
    return fuente;
  }

  /**
   * Credenciales de la fuente (el secret descifrado no sale de aquí).
   * @param {Object} fuente Fuente.
   * @return {Promise<Object>} {tenantId, clientId, clientSecret, config}.
   */
  async _credenciales(fuente) {
    const {config, clientSecret} =
        await fuenteDocumentalService.obtenerCredenciales(fuente.id);
    return {tenantId: config.tenantId, clientId: config.clientId,
      clientSecret, config};
  }

  /**
   * Resuelve el sitio desde su URL.
   * @param {string} token Token.
   * @param {string} siteUrl URL del sitio.
   * @return {Promise<Object>} Sitio.
   */
  async _sitio(token, siteUrl) {
    const u = new URL(siteUrl);
    return graphRepository.getJson(token,
        `/sites/${u.hostname}:${u.pathname.replace(/\/+$/, "")}` +
        "?$select=id,displayName,webUrl");
  }

  /**
   * Biblioteca por nombre (o por el último tramo de su URL: "Documentos" y
   * "Shared Documents" son la misma).
   * @param {string} token Token.
   * @param {string} siteId Sitio.
   * @param {string} nombre Biblioteca.
   * @return {Promise<{drive: ?Object, nombres: string[]}>} Resultado.
   */
  async _biblioteca(token, siteId, nombre) {
    const drives = await graphRepository.getTodos(token,
        `/sites/${siteId}/drives?$select=id,name,webUrl,driveType`);
    const buscado = String(nombre || "").trim().toLowerCase();
    const ultimo = (url) => decodeURIComponent(String(url || "")
        .replace(/\/+$/, "").split("/").pop() || "").toLowerCase();
    const drive = drives.find((d) => String(d.name).toLowerCase() === buscado ||
      ultimo(d.webUrl) === buscado) || null;
    return {drive, nombres: drives.map((d) => d.name)};
  }

  /**
   * Carpeta base dentro de la biblioteca (o su raíz).
   * @param {string} token Token.
   * @param {string} driveId Biblioteca.
   * @param {string} rutaBase "Acreditacion/" o "".
   * @return {Promise<Object>} Item.
   */
  async _carpetaBase(token, driveId, rutaBase) {
    const ruta = String(rutaBase || "").replace(/\/+$/, "");
    return graphRepository.getJson(token, ruta ?
      `/drives/${driveId}/root:/${codificarRuta(ruta)}?$select=${CAMPOS_ITEM}` :
      `/drives/${driveId}/root?$select=${CAMPOS_ITEM}`);
  }

  /**
   * Prueba la conexión paso a paso: credenciales, sitio, biblioteca, carpeta
   * base y lectura. Con los datos del formulario (antes de guardar) o los de
   * una fuente ya guardada (fuenteId; sin clientSecret usa el guardado). Si
   * se prueba la configuración guardada, deja su estado de conexión.
   * @param {Object} payload {mandanteId, fuenteId?, tenantId, clientId,
   *     clientSecret?, siteUrl, biblioteca, rutaBase}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{ok: boolean, pasos: Object[]}>} Diagnóstico.
   */
  async probarConexion(payload, actor) {
    const p = payload || {};
    const mandanteId = this._mandante(actor, p.mandanteId, ROLES_ADMINISTRAN);
    let guardada = null;
    if (p.fuenteId) {
      guardada = await fuenteDocumentalRepository.getById(String(p.fuenteId));
      if (!guardada || guardada.mandanteId !== mandanteId ||
          guardada.tipo !== "sharepoint") {
        throw new AppError(404, "Fuente documental no encontrada.");
      }
    }
    const conFormulario = Boolean(p.tenantId || p.siteUrl);
    const {config, clientSecret: secretFormulario} = conFormulario ?
      validarFuenteSharePoint({...p, nombre: p.nombre || "Prueba"},
          {esNueva: !guardada}) :
      {config: guardada?.config, clientSecret: null};
    if (!config) throw new AppError(400, "Faltan los datos de conexión.");
    const clientSecret = secretFormulario ||
      (guardada ? (await this._credenciales(guardada)).clientSecret : null);
    const c = {tenantId: config.tenantId, clientId: config.clientId,
      clientSecret};

    const pasos = [
      {clave: "credenciales", titulo: "Credenciales (Entra ID)"},
      {clave: "sitio", titulo: "Sitio"},
      {clave: "biblioteca", titulo: `Biblioteca «${config.biblioteca}»`},
      {clave: "carpetaBase", titulo: config.rutaBase ?
        `Carpeta base «${config.rutaBase.replace(/\/$/, "")}»` :
        "Carpeta base (raíz de la biblioteca)"},
      {clave: "lectura", titulo: "Lectura de la carpeta"},
    ].map((x) => ({...x, estado: "omitido", mensaje: null}));
    const paso = (clave) => pasos.find((x) => x.clave === clave);
    const ok = (clave, mensaje) => Object.assign(paso(clave),
        {estado: "ok", mensaje});
    const falla = (clave, mensaje) => Object.assign(paso(clave),
        {estado: "error", mensaje});
    const resultado = {sitioId: null, driveId: null};

    try {
      let token;
      try {
        graphRepository.olvidarToken(c);
        token = await graphRepository.token(c);
        ok("credenciales", "Token de aplicación obtenido.");
      } catch (e) {
        falla("credenciales", e.message);
        throw e;
      }
      let sitio;
      try {
        sitio = await this._sitio(token, config.siteUrl);
        resultado.sitioId = sitio.id;
        ok("sitio", `«${sitio.displayName || config.siteUrl}» encontrado.`);
      } catch (e) {
        falla("sitio", [401, 403].includes(e.status) ? SIN_ACCESO_SITIO :
          e.status === 404 ? `No existe el sitio ${config.siteUrl}.` :
          `No se pudo leer el sitio (${e.message}).`);
        throw e;
      }
      let drive;
      try {
        const r = await this._biblioteca(token, sitio.id, config.biblioteca);
        if (!r.drive) {
          falla("biblioteca", "No existe la biblioteca " +
            `«${config.biblioteca}» ` +
            "en el sitio." + (r.nombres.length ? ` Bibliotecas disponibles: ` +
            `${r.nombres.join(", ")}.` : ""));
          throw new Error("SIN_BIBLIOTECA");
        }
        drive = r.drive;
        resultado.driveId = drive.id;
        ok("biblioteca", `«${drive.name}» encontrada.`);
      } catch (e) {
        if (paso("biblioteca").estado !== "error") {
          falla("biblioteca", [401, 403].includes(e.status) ?
            SIN_ACCESO_SITIO : `No se pudo leer la biblioteca (${e.message}).`);
        }
        throw e;
      }
      let base;
      try {
        base = await this._carpetaBase(token, drive.id, config.rutaBase);
        if (!base.folder) {
          falla("carpetaBase", `«${config.rutaBase}» no es una carpeta.`);
          throw new Error("NO_ES_CARPETA");
        }
        ok("carpetaBase", config.rutaBase ? "Carpeta encontrada." :
          "Se usará la raíz de la biblioteca.");
      } catch (e) {
        if (paso("carpetaBase").estado !== "error") {
          falla("carpetaBase", e.status === 404 ? "No existe la carpeta " +
            `base «${config.rutaBase.replace(/\/$/, "")}» en la biblioteca ` +
            `«${drive.name}».` : [401, 403].includes(e.status) ?
            SIN_ACCESO_SITIO :
            `No se pudo leer la carpeta base (${e.message}).`);
        }
        throw e;
      }
      try {
        await graphRepository.getJson(token,
            `/drives/${drive.id}/items/${base.id}/children?$top=1&$select=id`);
        ok("lectura", `La carpeta tiene ${base.folder.childCount || 0} ` +
          "elementos.");
      } catch (e) {
        falla("lectura", [401, 403].includes(e.status) ? "La app ve la " +
          "carpeta pero no puede listar su contenido: revise el permiso " +
          "concedido al sitio (lectura)." :
          `No se pudo listar la carpeta (${e.message}).`);
        throw e;
      }
    } catch (e) {
      // El diagnóstico ya tiene el paso que falló; nada más que hacer.
    }

    const exito = pasos.every((x) => x.estado === "ok");
    // Probada la configuración guardada (sin cambios del formulario): su
    // estado de conexión y el sitio/biblioteca resueltos.
    const mismaConfig = guardada && !secretFormulario &&
      ["tenantId", "clientId", "siteUrl", "biblioteca", "rutaBase"]
          .every((k) => config[k] === guardada.config?.[k]);
    if (mismaConfig) {
      const error = pasos.find((x) => x.estado === "error");
      await fuenteDocumentalRepository.update(guardada.id, {
        estadoConexion: exito ? "conectada" : "error",
        ultimoErrorConexion: error ? error.mensaje : null,
        ultimaPruebaAt: new Date(),
        config: {...guardada.config, siteId: resultado.sitioId,
          driveId: resultado.driveId},
      });
      this.contextos.delete(guardada.id);
      await bitacoraLogger.registrarEvento({
        mandanteId, entidad: "fuentesDocumentales", entidadId: guardada.id,
        accion: "conexion_probada", actor,
        detalle: {ok: exito, paso: error?.clave || null},
      });
    }
    return {ok: exito, pasos, driveId: resultado.driveId};
  }

  /**
   * Token, biblioteca y carpeta base de la fuente activa del Mandante
   * (cacheados unos minutos por fuente).
   * @param {string} mandanteId Mandante.
   * @return {Promise<Object>} {fuente, c, token, driveId, base}.
   */
  async _contexto(mandanteId) {
    const fuente = await this._fuente(mandanteId);
    const c = await this._credenciales(fuente);
    const token = await graphRepository.token(c).catch((e) => {
      throw new AppError(502, `SharePoint: ${e.message}`,
          {codigo: "SHAREPOINT_CREDENCIALES"});
    });
    const firma = JSON.stringify(c.config);
    const guardado = this.contextos.get(fuente.id);
    if (guardado && guardado.firma === firma && guardado.expira > Date.now()) {
      return {fuente, c, token, driveId: guardado.driveId,
        base: guardado.base};
    }
    try {
      let driveId = c.config.driveId;
      if (!driveId) {
        const sitio = await this._sitio(token, c.config.siteUrl);
        const r = await this._biblioteca(token, sitio.id, c.config.biblioteca);
        if (!r.drive) {
          throw new AppError(409, `No existe la biblioteca ` +
              `«${c.config.biblioteca}» en el sitio. Pruebe la conexión.`);
        }
        driveId = r.drive.id;
      }
      const item = await this._carpetaBase(token, driveId, c.config.rutaBase);
      const base = {id: item.id, ruta: rutaEnBiblioteca(item)};
      this.contextos.set(fuente.id, {firma, driveId, base,
        expira: Date.now() + VIGENCIA_CONTEXTO_MS});
      return {fuente, c, token, driveId, base};
    } catch (e) {
      throw this._error(e, c);
    }
  }

  /**
   * Error de Graph → AppError con mensaje en español.
   * @param {Error} e Error.
   * @param {Object} c Credenciales (para olvidar un token rechazado).
   * @return {Error} Error.
   */
  _error(e, c) {
    if (e instanceof AppError) return e;
    if (e.status === 401) {
      graphRepository.olvidarToken(c);
      return new AppError(502, "SharePoint rechazó el acceso de la app. " +
          "Pruebe la conexión de la fuente.", {codigo: "SHAREPOINT_ACCESO"});
    }
    if (e.status === 403) {
      return new AppError(502, SIN_ACCESO_SITIO, {codigo: "SHAREPOINT_ACCESO"});
    }
    if (e.status === 404) {
      return new AppError(404, "La carpeta o el archivo ya no existe en " +
          "SharePoint.");
    }
    return new AppError(502, "No se pudo leer SharePoint. Intente " +
        "nuevamente.");
  }

  /**
   * Item dentro de la carpeta base (o 404: no se navega fuera de ella).
   * @param {Object} ctx Contexto.
   * @param {string} itemId Item.
   * @return {Promise<Object>} Item de Graph.
   */
  async _itemEnBase(ctx, itemId) {
    const item = await graphRepository.getJson(ctx.token,
        `/drives/${ctx.driveId}/items/${encodeURIComponent(itemId)}` +
        `?$select=${CAMPOS_ITEM}`).catch((e) => {
      throw this._error(e, ctx.c);
    });
    const ruta = rutaEnBiblioteca(item).toLowerCase();
    const dentro = item.id === ctx.base.id || !ctx.base.ruta ||
      ruta.startsWith(`${ctx.base.ruta.toLowerCase()}/`);
    if (!dentro) {
      throw new AppError(404, "La carpeta o el archivo no está en la " +
          "fuente documental del Mandante.");
    }
    return item;
  }

  /**
   * Carpetas y archivos de una carpeta (o de la carpeta base), con todas sus
   * páginas. Carpetas primero, por nombre.
   * @param {{mandanteId: ?string, itemId: ?string}} filtros Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{carpeta: Object, hijos: Object[]}>} Contenido.
   */
  async listarHijos({mandanteId, itemId}, actor) {
    const ctx = await this._contexto(this._mandante(actor, mandanteId));
    const carpeta = itemId ? await this._itemEnBase(ctx, String(itemId)) :
      {id: ctx.base.id, name: "", folder: {}};
    if (!carpeta.folder) throw new AppError(400, "No es una carpeta.");
    const hijos = await graphRepository.getTodos(ctx.token,
        `/drives/${ctx.driveId}/items/${carpeta.id}/children` +
        `?$select=${CAMPOS_ITEM}&$top=200`).catch((e) => {
      throw this._error(e, ctx.c);
    });
    const orden = (a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "carpeta" ?
      -1 : 1) || a.nombre.localeCompare(b.nombre, "es",
        {sensitivity: "base", numeric: true});
    return {
      carpeta: itemId ? aItem(carpeta, ctx) : {id: ctx.base.id,
        driveId: ctx.driveId, nombre: ctx.base.ruta.split("/").pop() || "",
        tipo: "carpeta", rutaRelativa: ""},
      hijos: hijos.map((h) => aItem(h, ctx)).sort(orden),
    };
  }

  /**
   * Metadatos de un item de la fuente.
   * @param {{mandanteId: ?string, itemId: string}} filtros Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Item.
   */
  async obtenerItem({mandanteId, itemId}, actor) {
    const ctx = await this._contexto(this._mandante(actor, mandanteId));
    return aItem(await this._itemEnBase(ctx, String(itemId || "")), ctx);
  }

  /**
   * Contenido de un archivo (para transmitirlo por el backend), con límite
   * de tamaño. formato "pdf": conversión de Graph para Office (vista previa).
   * @param {{mandanteId: ?string, itemId: string, formato: ?string}} datos
   *     Datos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{respuesta: Response, nombre: string, tipo: string}>}
   *     Respuesta de Graph con el flujo.
   */
  async contenido({mandanteId, itemId, formato}, actor) {
    const ctx = await this._contexto(this._mandante(actor, mandanteId));
    const item = await this._itemEnBase(ctx, String(itemId || ""));
    if (item.folder) throw new AppError(400, "Es una carpeta, no un archivo.");
    const ext = String(item.name).split(".").pop().toLowerCase();
    const aPdf = formato === "pdf";
    if (formato && !aPdf) throw new AppError(400, "Formato no soportado.");
    if (aPdf && !EXTENSIONES_A_PDF.includes(ext)) {
      throw new AppError(400, "Solo los documentos de Office se convierten " +
          "a PDF.");
    }
    const max = maxBytesContenido();
    if (Number(item.size || 0) > max) {
      throw new AppError(413, `El archivo supera el límite de ` +
          `${Math.round(max / 1024 / 1024)} MB para verlo desde SmartOne.`);
    }
    const respuesta = await graphRepository.get(ctx.token,
        `/drives/${ctx.driveId}/items/${item.id}/content` +
        (aPdf ? "?format=pdf" : ""));
    if (!respuesta.ok) {
      const e = new Error(`HTTP ${respuesta.status}`);
      e.status = respuesta.status;
      throw this._error(e, ctx.c);
    }
    return {
      respuesta,
      nombre: aPdf ? item.name.replace(/\.[^.]+$/, ".pdf") : item.name,
      tipo: aPdf ? "application/pdf" : item.file?.mimeType ||
        "application/octet-stream",
    };
  }
}

module.exports = new SharePointService();
module.exports.rutaEnBiblioteca = rutaEnBiblioteca;
