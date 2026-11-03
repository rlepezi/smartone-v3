const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const AppError = require("../utils/AppError");
const {
  validarPlantilla, validarCambioEstructura, nodosDe,
} = require("../utils/plantillaEstructura");
const {aliasLimpios} = require("../utils/aliasNodo");
const {
  aplicarHabilitacion, cambiosMasivos, calcularAlcance, calcularEstadoEfectivo,
} = require("../utils/alcanceValidacion");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const PLANTILLA_TRANSEMEL =
    require("../../config/plantillas/transemel-carpeta-arranque-v1.json");

// Solo superadmin administra la plantilla (Mapeo documental). Leer la activa:
// también evaluador, mandante_admin y mandante_lector (solo lectura).
const ROLES_ADMINISTRAN = ["superadmin"];
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Plantillas de Estructura de carpetas por Mandante (una activa). Describen
 * QUÉ se espera en la carpeta de arranque de cada empresa y CÓMO
 * reconocerlo (alias), no en qué número va.
 */
class PlantillaEstructuraService {
  /**
   * Mandante accesible por el actor.
   * @param {Object} actor Usuario autenticado.
   * @param {?string} mandanteId Mandante pedido.
   * @return {Promise<string>} mandanteId validado.
   */
  async _mandante(actor, mandanteId) {
    const id = ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        actor.mandanteId : mandanteId;
    if (!id) throw new AppError(400, "Falta el Mandante.");
    if (ROLES_ALCANCE_FORZADO.includes(actor.rol) && mandanteId &&
        mandanteId !== actor.mandanteId) {
      throw new AppError(403, "No tiene acceso a este Mandante.");
    }
    if (!(await mandanteRepository.getById(id))) {
      throw new AppError(404, "Mandante no encontrado.");
    }
    return id;
  }

  /**
   * Exige un rol que administra plantillas.
   * @param {Object} actor Usuario autenticado.
   */
  _exigirAdministra(actor) {
    if (!ROLES_ADMINISTRAN.includes(actor.rol)) {
      throw new AppError(403, "Solo un superadmin puede editar la plantilla.");
    }
  }

  /**
   * Guarda la copia de la versión vigente (auditoría). Si la versión
   * anterior no tenía copia (plantillas previas a este cambio), la guarda
   * también, para no perderla.
   * @param {string} id Plantilla.
   * @param {Object} plantilla Plantilla vigente.
   * @param {Object} autor {uid, nombre}.
   * @param {?Object} [previa] Plantilla anterior.
   * @return {Promise<void>}
   */
  async _versionar(id, plantilla, autor, previa = null) {
    if (previa && !(await plantillaEstructuraRepository.existeVersion(id,
        previa.version || 1))) {
      await plantillaEstructuraRepository.guardarVersion(id, previa,
          previa.updatedBy || null);
    }
    await plantillaEstructuraRepository.guardarVersion(id, plantilla, autor);
  }

  /**
   * Conserva el requerimientoId 1:1 de cada nodo (solo para el motor
   * anterior, hasta E7): el formulario ya no lo envía.
   * @param {Object} previa Plantilla vigente.
   * @param {Object} datos Plantilla validada.
   * @return {Object} datos con el requerimientoId anterior.
   */
  _conRequerimientoAnterior(previa, datos) {
    const sec = new Map((previa.secciones || []).map((x) => [x.clave, x]));
    return {...datos, secciones: datos.secciones.map((x) => {
      const antes = sec.get(x.clave);
      if (!antes) return x;
      const conservar = (lista) => (x[lista] || []).map((d) => {
        const previo = (antes[lista] || []).find((p) => p.clave === d.clave);
        return {...d, requerimientoId: d.requerimientoId ||
          previo?.requerimientoId || null};
      });
      return {...x, requerimientoId: x.requerimientoId ||
        antes.requerimientoId || null,
      archivosSeccion: conservar("archivosSeccion"),
      documentos: conservar("documentos")};
    })};
  }

  /**
   * Autor para mostrar.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{uid: string, nombre: string}>} Autor.
   */
  async _autor(actor) {
    const u = await usuarioRepository.getById(actor.uid).catch(() => null);
    const nombre = u ? `${u.nombre || ""} ${u.apellido || ""}`.trim() : "";
    return {uid: actor.uid, nombre: nombre || actor.email || actor.uid};
  }

  /**
   * Plantilla activa de un Mandante (o null).
   * @param {?string} mandanteId Mandante.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<?Object>} Plantilla.
   */
  async obtenerActiva(mandanteId, actor) {
    const id = await this._mandante(actor, mandanteId);
    return plantillaEstructuraRepository.getActiva(id);
  }

  /**
   * Importa una plantilla (la de Transemel v1 incluida en el código, o un
   * JSON del usuario) como la activa del Mandante.
   * @param {{mandanteId: string, origen: string, plantilla: ?Object}} payload
   *     origen "transemel" | "json".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla creada.
   */
  async importar({mandanteId, origen, plantilla}, actor) {
    this._exigirAdministra(actor);
    const id = await this._mandante(actor, mandanteId);
    if (await plantillaEstructuraRepository.getActiva(id)) {
      throw new AppError(409, "Este Mandante ya tiene una plantilla activa. " +
          "Desactívela antes de importar otra.");
    }
    const fuente = origen === "transemel" ? PLANTILLA_TRANSEMEL : plantilla;
    if (!fuente) throw new AppError(400, "Falta la plantilla a importar.");
    const datos = validarPlantilla(fuente);
    const autor = await this._autor(actor);
    const creada = await plantillaEstructuraRepository.create({
      ...datos, mandanteId: id, version: 1, estado: "activa",
      createdBy: autor, updatedBy: autor,
    });
    await this._versionar(creada.id, creada, autor);
    await bitacoraLogger.registrarEvento({
      mandanteId: id, entidad: "plantillasEstructura", entidadId: creada.id,
      accion: "creado", actor,
      detalle: {nombre: datos.nombre, origen,
        secciones: datos.secciones.length},
    });
    return creada;
  }

  /**
   * Guarda la plantilla editada: valida todo y sube la versión.
   * @param {string} plantillaId ID.
   * @param {Object} cambios Plantilla completa (nombre, profundidad,
   *     secciones).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla actualizada.
   */
  async actualizar(plantillaId, cambios, actor) {
    this._exigirAdministra(actor);
    const previa = await this._cargar(plantillaId, actor);
    if (previa.estado !== "activa") {
      throw new AppError(409, "La plantilla está inactiva.");
    }
    const datos = this._conRequerimientoAnterior(previa,
        validarPlantilla(cambios));
    const {retirados, reactivados} = validarCambioEstructura(previa, datos);
    const autor = await this._autor(actor);
    const actualizada = await plantillaEstructuraRepository.update(
        plantillaId, {...datos, version: (previa.version || 1) + 1,
          updatedBy: autor},
    );
    await this._versionar(plantillaId, actualizada, autor, previa);
    // Nodos retirados: sus vínculos con requerimientos quedan inactivos;
    // al reactivarlos, vuelven los que se inactivaron por el retiro.
    // eslint-disable-next-line global-require
    const mapeoService = require("./mapeoRequerimientoService");
    const vinculos = await mapeoService.alRetirarNodos(previa.mandanteId,
        retirados, reactivados, autor);
    await bitacoraLogger.registrarEvento({
      mandanteId: previa.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantillaId, accion: "actualizado", actor,
      detalle: {version: actualizada.version,
        secciones: datos.secciones.length, retirados, reactivados,
        vinculosInactivados: vinculos.inactivados,
        vinculosReactivados: vinculos.reactivados},
    });
    return actualizada;
  }

  /**
   * Aplica cambios de habilitación (secciones, archivos sueltos y
   * documentos) en UNA transacción, con un solo incremento de versión.
   * @param {string} plantillaId ID.
   * @param {Object[]} cambios [{nivel, seccionClave, elementoClave?,
   *     habilitado}].
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{plantilla: Object, estadoEfectivo: Object,
   *     alcance: Object}>} Resultado.
   */
  async habilitacion(plantillaId, cambios, actor) {
    this._exigirAdministra(actor);
    const previa = await this._cargar(plantillaId, actor);
    const autor = await this._autor(actor);
    let aplicados = [];
    const plantilla = await plantillaEstructuraRepository
        .actualizarEnTransaccion(plantillaId, (actual) => {
          if (!actual || actual.estado !== "activa") {
            throw new AppError(409, "La plantilla no está activa.");
          }
          const r = aplicarHabilitacion(actual.secciones, cambios);
          aplicados = r.aplicados;
          return {secciones: r.secciones, version: (actual.version || 1) + 1,
            updatedBy: autor};
        });
    await this._versionar(plantillaId, plantilla, autor, previa);
    await bitacoraLogger.registrarEvento({
      mandanteId: previa.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantillaId, accion: "habilitacion_actualizada", actor,
      detalle: {
        version: plantilla.version,
        cambios: aplicados.map((c) => ({
          elemento: c.nivel === "seccion" ? "seccion" :
            c.nivel === "archivoSeccion" ? "archivo_suelto" : "documento",
          seccionClave: c.seccionClave, elementoClave: c.elementoClave || null,
          anterior: c.anterior, nuevo: c.habilitado,
        })),
      },
    });
    return this._conAlcance(plantilla);
  }

  /**
   * Acción masiva: habilitar o deshabilitar toda la plantilla o una sección
   * con todos sus hijos.
   * @param {string} plantillaId ID.
   * @param {{accion: string, seccionClave: (string|undefined)}} payload
   *     Acción.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Como habilitacion.
   */
  async habilitacionMasiva(plantillaId, {accion, seccionClave}, actor) {
    const plantilla = await this._cargar(plantillaId, actor);
    return this.habilitacion(plantillaId,
        cambiosMasivos(plantilla.secciones, accion, seccionClave || null),
        actor);
  }

  /**
   * Agrega un alias a un nodo de la plantilla activa del Mandante (alias
   * sugerido aprobado): nueva versión, con su copia y Bitácora.
   * @param {string} mandanteId Mandante.
   * @param {string} nodoClave Nodo.
   * @param {string} alias Alias.
   * @param {Object} actor Usuario autenticado (superadmin).
   * @return {Promise<Object>} Plantilla actualizada.
   */
  async agregarAlias(mandanteId, nodoClave, alias, actor) {
    this._exigirAdministra(actor);
    const previa = await plantillaEstructuraRepository.getActiva(mandanteId);
    if (!previa) {
      throw new AppError(404, "El Mandante no tiene plantilla activa.");
    }
    const [seccionClave, docClave] = String(nodoClave || "").split("/");
    const autor = await this._autor(actor);
    let agregado = false;
    const plantilla = await plantillaEstructuraRepository
        .actualizarEnTransaccion(previa.id, (actual) => {
          const secciones = (actual.secciones || []).map((x) => {
            if (x.clave !== seccionClave) return x;
            const sumar = (n) => {
              const nuevos = aliasLimpios([...(n.alias || []), alias]);
              agregado = nuevos.length > (n.alias || []).length;
              return {...n, alias: nuevos};
            };
            if (!docClave) return sumar(x);
            const enLista = (lista) => (x[lista] || []).map((d) =>
              (d.clave === docClave ? sumar(d) : d));
            return {...x, archivosSeccion: enLista("archivosSeccion"),
              documentos: enLista("documentos")};
          });
          if (!nodosDe({secciones}).some((n) => n.nodoClave === nodoClave)) {
            throw new AppError(404, "El nodo no existe en la plantilla.");
          }
          return agregado ? {secciones, version: (actual.version || 1) + 1,
            updatedBy: autor} : {};
        });
    if (!agregado) return plantilla;
    await this._versionar(previa.id, plantilla, autor, previa);
    await bitacoraLogger.registrarEvento({
      mandanteId, entidad: "plantillasEstructura", entidadId: previa.id,
      accion: "alias_agregado", actor,
      detalle: {version: plantilla.version, nodoClave, alias},
    });
    return plantilla;
  }

  /**
   * Duplica la plantilla activa hacia otro Mandante (solo si el destino no
   * tiene plantilla activa): estructura, alias y tipo documental; sin
   * vínculos con requerimientos ni versiones anteriores (parte en v1).
   * @param {string} plantillaId Plantilla origen.
   * @param {string} mandanteDestinoId Mandante destino.
   * @param {Object} actor Usuario autenticado (superadmin).
   * @return {Promise<Object>} Plantilla creada.
   */
  async duplicar(plantillaId, mandanteDestinoId, actor) {
    this._exigirAdministra(actor);
    const origen = await this._cargar(plantillaId, actor);
    const destino = await this._mandante(actor, mandanteDestinoId);
    if (destino === origen.mandanteId) {
      throw new AppError(400, "Elija otro Mandante de destino.");
    }
    if (await plantillaEstructuraRepository.getActiva(destino)) {
      throw new AppError(409, "El Mandante de destino ya tiene una plantilla " +
          "activa.");
    }
    const sinVinculos = (n) => ({...n, requerimientoId: null});
    const datos = validarPlantilla({nombre: origen.nombre,
      profundidadSubcontratos: origen.profundidadSubcontratos,
      secciones: (origen.secciones || []).map((x) => ({...sinVinculos(x),
        archivosSeccion: (x.archivosSeccion || []).map(sinVinculos),
        documentos: (x.documentos || []).map(sinVinculos)}))});
    const autor = await this._autor(actor);
    const creada = await plantillaEstructuraRepository.create({...datos,
      mandanteId: destino, version: 1, estado: "activa", createdBy: autor,
      updatedBy: autor, duplicadaDe: {plantillaId: origen.id,
        mandanteId: origen.mandanteId, version: origen.version || 1}});
    await this._versionar(creada.id, creada, autor);
    await Promise.all([
      bitacoraLogger.registrarEvento({mandanteId: destino,
        entidad: "plantillasEstructura", entidadId: creada.id,
        accion: "creado", actor, detalle: {nombre: datos.nombre,
          origen: "duplicada", plantillaOrigenId: origen.id,
          mandanteOrigenId: origen.mandanteId, version: 1}}),
      bitacoraLogger.registrarEvento({mandanteId: origen.mandanteId,
        entidad: "plantillasEstructura", entidadId: origen.id,
        accion: "duplicada", actor, detalle: {mandanteDestinoId: destino,
          plantillaDestinoId: creada.id, version: origen.version || 1}}),
    ]);
    return creada;
  }

  /**
   * Nodos de la plantilla activa del Mandante (activos y retirados), para el
   * mapeo y el resolvedor. null si no hay plantilla.
   * @param {string} mandanteId Mandante.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<?{plantillaId: string, version: number,
   *     nodos: Object[]}>} Nodos.
   */
  async nodos(mandanteId, actor) {
    const id = await this._mandante(actor, mandanteId);
    const p = await plantillaEstructuraRepository.getActiva(id);
    return p ? {plantillaId: p.id, version: p.version || 1,
      nodos: nodosDe(p)} : null;
  }

  /**
   * Alcance de validación de una plantilla.
   * @param {string} plantillaId ID.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Alcance.
   */
  async alcance(plantillaId, actor) {
    const plantilla = await this._cargar(plantillaId, actor);
    return calcularAlcance(plantilla, await tipoDocumentalRepository.list());
  }

  /**
   * Plantilla con su estado efectivo y su alcance.
   * @param {Object} plantilla Plantilla.
   * @return {Promise<Object>} {plantilla, estadoEfectivo, alcance}.
   */
  async _conAlcance(plantilla) {
    return {
      plantilla,
      estadoEfectivo: calcularEstadoEfectivo(plantilla),
      alcance: calcularAlcance(plantilla,
          await tipoDocumentalRepository.list()),
    };
  }

  /**
   * Desactiva una plantilla (cambio de estado).
   * @param {string} plantillaId ID.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla.
   */
  async desactivar(plantillaId, actor) {
    this._exigirAdministra(actor);
    const previa = await this._cargar(plantillaId, actor);
    if (previa.estado === "inactiva") return previa;
    const actualizada = await plantillaEstructuraRepository.update(
        plantillaId, {estado: "inactiva",
          updatedBy: await this._autor(actor)},
    );
    await bitacoraLogger.registrarEvento({
      mandanteId: previa.mandanteId, entidad: "plantillasEstructura",
      entidadId: plantillaId, accion: "transicion_estado", actor,
      detalle: {estadoAnterior: "activa", estadoNuevo: "inactiva"},
    });
    return actualizada;
  }

  /**
   * Plantilla accesible por el actor.
   * @param {string} plantillaId ID.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plantilla.
   */
  async _cargar(plantillaId, actor) {
    const plantilla = await plantillaEstructuraRepository.getById(plantillaId);
    if (!plantilla || (ROLES_ALCANCE_FORZADO.includes(actor.rol) &&
        plantilla.mandanteId !== actor.mandanteId)) {
      throw new AppError(404, "Plantilla no encontrada.");
    }
    return plantilla;
  }
}

module.exports = new PlantillaEstructuraService();
