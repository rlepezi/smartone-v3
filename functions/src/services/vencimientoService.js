const expedienteRepository = require("../repositories/expedienteRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const expedienteService = require("./expedienteService");
const {
  UMBRAL_PROXIMO_DIAS, aFecha, hoySantiago, inicioDeHoy, finDelUmbral,
  clasificarVencimiento, cuentaParaVencimiento,
} = require("../utils/vencimientos");
const AppError = require("../utils/AppError");

// Roles acotados siempre a su propio Mandante.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];
const ESTADOS_FILTRO = ["vencidos", "proximos", "todos"];
const LIMITE_MAXIMO = 50;
const CLASIFICACIONES_PROXIMAS = ["vence_hoy", "proximo_7", "proximo_30"];

/**
 * Vencimientos de documentos (instancias "cumple" con fecha de vencimiento),
 * calculados al leer contra el día actual (ver utils/vencimientos.js). Un
 * Expediente cerrado o en generación no aporta vencimientos.
 */
class VencimientoService {
  /**
   * Indica si un Expediente aporta vencimientos.
   * @param {?Object} expediente Expediente.
   * @return {boolean} true si está abierto y con la generación completa.
   */
  _expedienteVigente(expediente) {
    return Boolean(expediente) && expediente.estado !== "cerrado" &&
        expediente.estadoGeneracion !== "en_proceso";
  }

  /**
   * Nombre e identificación de los sujetos de un conjunto de instancias,
   * leídos en lote.
   * @param {Object[]} instancias Instancias.
   * @return {Promise<Function>} (instancia) => {id, nombre, identificacion}.
   */
  async _resolverSujetos(instancias) {
    const ids = (campo) => [...new Set(instancias.map((i) => i[campo])
        .filter(Boolean))];
    const [personas, recursos, empresas] = await Promise.all([
      personaRepository.getByIds(ids("personaId")),
      recursoRepository.getByIds(ids("recursoId")),
      empresaRepository.getByIds(ids("empresaId")),
    ]);
    const porId = (lista) => new Map(lista.map((x) => [x.id, x]));
    const mapaPersonas = porId(personas);
    const mapaRecursos = porId(recursos);
    const mapaEmpresas = porId(empresas);
    return (i) => {
      if (i.tipoEntidad === "persona") {
        const p = mapaPersonas.get(i.personaId);
        return {
          id: i.personaId,
          nombre: p ? `${p.nombre} ${p.apellido || ""}`.trim() : null,
          identificacion: p?.identificacion?.numero || p?.rut || null,
        };
      }
      if (i.tipoEntidad === "recurso") {
        const r = mapaRecursos.get(i.recursoId);
        return {
          id: i.recursoId, nombre: r?.nombre || null,
          identificacion: r?.patente || null,
        };
      }
      const e = mapaEmpresas.get(i.empresaId);
      return {
        id: i.empresaId, nombre: e?.razonSocial || null,
        identificacion: e?.rut || null,
      };
    };
  }

  /**
   * Ítem de vencimiento listo para el cliente.
   * @param {Object} i Instancia.
   * @param {Object} sujeto Sujeto resuelto.
   * @param {{clasificacion: string, dias: number}} c Clasificación.
   * @return {Object} Ítem.
   */
  _item(i, sujeto, c) {
    return {
      instanciaId: i.id,
      expedienteId: i.expedienteId,
      requerimientoId: i.requerimientoId,
      requerimiento: {
        nombre: i.nombre || null,
        nombreCorto: i.nombreCorto || i.nombre || null,
      },
      tipoEntidad: i.tipoEntidad,
      sujeto,
      fechaVencimiento: aFecha(i.fechaVencimiento).toISOString().slice(0, 10),
      clasificacion: c.clasificacion,
      dias: c.dias,
    };
  }

  /**
   * Vencimientos de un Expediente: instancias que cuentan con vencimiento
   * hasta hoy + UMBRAL_PROXIMO_DIAS. Primero los vencidos (el más antiguo
   * arriba) y luego los próximos por fecha.
   * @param {string} id ID del Expediente.
   * @param {string} [estado] "vencidos" | "proximos" | "todos".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{items: Object[], totales: Object, umbralDias: number}>}
   *     Ítems (filtrados por `estado`) y totales (siempre de todos).
   */
  async delExpediente(id, estado = "todos", actor) {
    const filtro = ESTADOS_FILTRO.includes(estado) ? estado : "todos";
    const expediente = await expedienteService.getExpedienteById(id, actor);
    const totales = {vencidos: 0, venceHoy: 0, proximos7: 0, proximos30: 0};
    if (!this._expedienteVigente(expediente)) {
      return {items: [], totales, umbralDias: UMBRAL_PROXIMO_DIAS};
    }
    const hoy = hoySantiago();
    const instancias = (await expedienteRequerimientoRepository
        .listByExpediente(id, "activo"))
        .filter(cuentaParaVencimiento)
        .map((i) => ({i, c: clasificarVencimiento(i.fechaVencimiento, hoy)}))
        .filter(({c}) => c && c.clasificacion !== "vigente");
    instancias.forEach(({c}) => {
      if (c.clasificacion === "vencido") totales.vencidos++;
      else if (c.clasificacion === "vence_hoy") totales.venceHoy++;
      else if (c.clasificacion === "proximo_7") totales.proximos7++;
      else totales.proximos30++;
    });
    const visibles = instancias.filter(({c}) =>
      filtro === "todos" ||
      (filtro === "vencidos" ? c.clasificacion === "vencido" :
        CLASIFICACIONES_PROXIMAS.includes(c.clasificacion)));
    const sujetoDe = await this._resolverSujetos(visibles.map(({i}) => i));
    const items = visibles
        .sort((a, b) => a.c.dias - b.c.dias)
        .map(({i, c}) => this._item(i, sujetoDe(i), c));
    return {items, totales, umbralDias: UMBRAL_PROXIMO_DIAS};
  }

  /**
   * Vencimientos de todos los Expedientes abiertos en el alcance del actor
   * (Dashboard), paginados.
   * @param {{mandanteId: (string|undefined), estado: (string|undefined),
   *     limit: (string|number|undefined), cursor: (string|undefined)}}
   *     filtros "vencidos" (por defecto) o "proximos"; `cursor` es el
   *     desplazamiento que devolvió la página anterior.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<{items: Object[], total: number, cursor: ?string}>}
   *     Página, total y cursor de la siguiente (null si no hay más).
   */
  async listar({mandanteId, estado, limit, cursor} = {}, actor) {
    const filtro = estado === "proximos" ? "proximos" : "vencidos";
    if (estado && !["vencidos", "proximos"].includes(estado)) {
      throw new AppError(400, "estado debe ser 'vencidos' o 'proximos'.");
    }
    const mandante = ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        actor.mandanteId : (mandanteId || undefined);
    const tope = Math.min(Math.max(parseInt(limit, 10) || 10, 1),
        LIMITE_MAXIMO);
    const desde = Math.max(parseInt(cursor, 10) || 0, 0);

    const inicio = inicioDeHoy();
    const instancias = await expedienteRequerimientoRepository
        .listVencimientos(filtro === "vencidos" ?
          {mandanteId: mandante, antesDe: inicio} :
          {mandanteId: mandante, desde: inicio, hasta: finDelUmbral()});

    // Excluir Expedientes cerrados o en generación: se leen en lote.
    const expedientes = await expedienteRepository.getByIds(
        instancias.map((i) => i.expedienteId),
    );
    const vigentes = new Map(expedientes
        .filter((e) => this._expedienteVigente(e))
        .map((e) => [e.id, e]));
    const validas = instancias.filter((i) => vigentes.has(i.expedienteId));
    const pagina = validas.slice(desde, desde + tope);

    const [sujetoDe, empresas, proyectos] = await Promise.all([
      this._resolverSujetos(pagina),
      empresaRepository.getByIds(
          pagina.map((i) => vigentes.get(i.expedienteId).empresaId),
      ),
      proyectoRepository.getByIds(
          pagina.map((i) => vigentes.get(i.expedienteId).proyectoId),
      ),
    ]);
    const nombreEmpresa = new Map(empresas.map((e) => [e.id, e.razonSocial]));
    const nombreProyecto = new Map(proyectos.map((p) => [p.id, p.nombre]));
    const hoy = hoySantiago();
    const items = pagina.map((i) => {
      const expediente = vigentes.get(i.expedienteId);
      return {
        ...this._item(i, sujetoDe(i),
            clasificarVencimiento(i.fechaVencimiento, hoy)),
        empresa: {
          id: expediente.empresaId,
          nombre: nombreEmpresa.get(expediente.empresaId) || null,
        },
        proyecto: {
          id: expediente.proyectoId,
          nombre: nombreProyecto.get(expediente.proyectoId) || null,
        },
      };
    });
    const siguiente = desde + tope;
    return {
      items,
      total: validas.length,
      cursor: siguiente < validas.length ? String(siguiente) : null,
    };
  }
}

module.exports = new VencimientoService();
