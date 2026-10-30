const expedienteRepository = require("../repositories/expedienteRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const AppError = require("../utils/AppError");
const {sumarResumenes} = require("../utils/cumplimiento");
const {
  UMBRAL_PROXIMO_DIAS, hoySantiago, finDelUmbral, clasificarVencimiento,
} = require("../utils/vencimientos");
const {
  MIN_EVALUACIONES_RANKING, fechaDeEvaluacion, cuentaEnPeriodo, esRevision,
  tipoEntidadDe, filaCumplimiento, porTipoEntidad, primeraRevision,
  itemsEvaluados, sumarDias, evolucion, rankingRechazos,
} = require("../utils/reporteCalculos");

// Roles acotados siempre a su propio Mandante.
const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Inicio (medianoche UTC) de una fecha YYYY-MM-DD, con un margen en días:
 * las consultas por createdAt usan un rango algo más amplio y el corte
 * exacto se hace por la fecha en America/Santiago.
 * @param {string} iso Fecha.
 * @param {number} margenDias Días a sumar (negativos restan).
 * @return {Date} Instante.
 */
function instanteConMargen(iso, margenDias) {
  return new Date(`${sumarDias(iso, margenDias)}T00:00:00.000Z`);
}

/**
 * Panel de Reportes: todas las secciones en una sola respuesta. Universo =
 * Expedientes del Mandante con la generación completa que cumplen los
 * filtros de Proyecto, Perfil y Empresa. Las "fotos de hoy" (cumplimiento,
 * por proyecto, por tipo de entidad, vencimientos) salen de los contadores
 * de los Expedientes no cerrados; lo que depende del período (evolución,
 * primera revisión, ítems evaluados, rechazos), de una consulta a
 * evaluaciones por Mandante y rango de fechas. 100% lectura.
 */
class ReportePanelService {
  /**
   * Valida una fecha opcional del filtro.
   * @param {*} valor Valor recibido.
   * @param {string} campo Nombre del parámetro (para el error).
   * @return {?string} Fecha YYYY-MM-DD o null.
   */
  _fecha(valor, campo) {
    if (!valor) return null;
    if (!FORMATO_FECHA.test(valor)) {
      throw new AppError(400, `${campo} debe tener el formato AAAA-MM-DD.`);
    }
    return valor;
  }

  /**
   * Nombres de los sujetos (personas y recursos) de unas evaluaciones.
   * @param {Object[]} evaluaciones Evaluaciones.
   * @return {Promise<Function>} (evaluacion) => nombre o null.
   */
  async _nombresSujetos(evaluaciones) {
    const ids = (campo) => evaluaciones.map((ev) => ev[campo]);
    const [personas, recursos] = await Promise.all([
      personaRepository.getByIds(ids("personaId")),
      recursoRepository.getByIds(ids("recursoId")),
    ]);
    const nombrePersona = new Map(personas.map((p) =>
      [p.id, `${p.nombre || ""} ${p.apellido || ""}`.trim() || null]));
    const nombreRecurso = new Map(recursos.map((r) => [
      r.id, [r.nombre, r.patente].filter(Boolean).join(" · ") || null,
    ]));
    return (ev) => {
      if (ev.personaId) return nombrePersona.get(ev.personaId) || null;
      if (ev.recursoId) return nombreRecurso.get(ev.recursoId) || null;
      return null;
    };
  }

  /**
   * Instancias con alguna revisión anterior al período.
   * @param {Object[]} revisiones Revisiones del período.
   * @param {?string} desde Inicio del período (null = sin límite).
   * @return {Promise<Set<string>>} IDs de instancia.
   */
  async _conRevisionAnterior(revisiones, desde) {
    if (!desde || revisiones.length === 0) return new Set();
    const anteriores = await evaluacionRepository.listDeInstanciasAntesDe(
        revisiones.map((ev) => ev.expedienteRequerimientoId),
        instanteConMargen(desde, 1),
    );
    return new Set(anteriores
        .filter((ev) => cuentaEnPeriodo(ev) && esRevision(ev))
        .filter((ev) => {
          const fecha = fechaDeEvaluacion(ev);
          return fecha && fecha < desde;
        })
        .map((ev) => ev.expedienteRequerimientoId));
  }

  /**
   * Genera el panel de Reportes.
   * @param {Object} actor Usuario autenticado.
   * @param {{mandanteId: (string|undefined), desde: (string|undefined),
   *     hasta: (string|undefined), proyectoId: (string|undefined),
   *     perfilParticipacionId: (string|undefined),
   *     empresaId: (string|undefined)}} filtros Filtros (fechas
   *     YYYY-MM-DD; sin `desde` = desde el inicio, sin `hasta` = hoy).
   * @return {Promise<Object>} Secciones del panel.
   */
  async obtenerPanel(actor, filtros = {}) {
    const mandanteId = ROLES_ALCANCE_FORZADO.includes(actor.rol) ?
        actor.mandanteId : (filtros.mandanteId || undefined);
    const hoy = hoySantiago();
    const desde = this._fecha(filtros.desde, "desde");
    const hasta = this._fecha(filtros.hasta, "hasta") || hoy;
    if (desde && desde > hasta) {
      throw new AppError(400, "La fecha desde no puede ser posterior a hasta.");
    }
    const {proyectoId, perfilParticipacionId, empresaId} = filtros;

    const generados = (await expedienteRepository.list({mandanteId}))
        .filter((e) => (e.estadoGeneracion || "completa") === "completa");
    const universo = generados.filter((e) =>
      (!proyectoId || e.proyectoId === proyectoId) &&
      (!perfilParticipacionId ||
        e.perfilParticipacionId === perfilParticipacionId) &&
      (!empresaId || e.empresaId === empresaId));
    const abiertos = universo.filter((e) => e.estado !== "cerrado");
    const expedientePorId = new Map(universo.map((e) => [e.id, e]));
    const abiertosIds = new Set(abiertos.map((e) => e.id));

    const [evaluaciones, instanciasVencimiento, perfiles, proyectos,
      empresas] = await Promise.all([
      evaluacionRepository.listEnRango({
        mandanteId,
        desde: desde ? instanteConMargen(desde, -1) : undefined,
        antesDe: instanteConMargen(hasta, 2),
      }),
      expedienteRequerimientoRepository.listVencimientos(
          {mandanteId, hasta: finDelUmbral()},
      ),
      perfilParticipacionRepository.list({mandanteId}),
      proyectoRepository.getByIds(generados.map((e) => e.proyectoId)),
      empresaRepository.getByIds(generados.map((e) => e.empresaId)),
    ]);
    const proyectoPorId = new Map(proyectos.map((p) => [p.id, p]));
    const empresaPorId = new Map(empresas.map((e) => [e.id, e]));

    // Evaluaciones del período, del universo.
    const delPeriodo = evaluaciones
        .filter((ev) => expedientePorId.has(ev.expedienteId) &&
            cuentaEnPeriodo(ev))
        .map((ev) => ({...ev, fecha: fechaDeEvaluacion(ev)}))
        .filter((ev) => ev.fecha && (!desde || ev.fecha >= desde) &&
            ev.fecha <= hasta);
    const revisiones = delPeriodo.filter(esRevision);
    const inicioEvolucion = desde || delPeriodo
        .reduce((min, ev) => (ev.fecha < min ? ev.fecha : min), hasta);

    // Vencimientos del universo abierto (misma regla que /vencimientos).
    const vencimientos = {
      vencidos: 0, proximos: 0, umbralDias: UMBRAL_PROXIMO_DIAS,
    };
    instanciasVencimiento
        .filter((i) => abiertosIds.has(i.expedienteId))
        .forEach((i) => {
          const c = clasificarVencimiento(i.fechaVencimiento, hoy);
          if (!c || c.clasificacion === "vigente") return;
          if (c.clasificacion === "vencido") vencimientos.vencidos++;
          else vencimientos.proximos++;
        });

    const [conAnterior, rechazos] = await Promise.all([
      this._conRevisionAnterior(revisiones, desde),
      this._rechazos(revisiones, expedientePorId, perfiles, proyectoPorId,
          empresaPorId),
    ]);

    const total = sumarResumenes(abiertos.map((e) => e.resumen));
    const totalCumplimiento = filaCumplimiento(total);
    return {
      filtros: {
        mandanteId: mandanteId || null, desde, hasta,
        proyectoId: proyectoId || null,
        perfilParticipacionId: perfilParticipacionId || null,
        empresaId: empresaId || null,
      },
      opciones: this._opciones(generados, perfiles, proyectoPorId,
          empresaPorId),
      indicadores: {
        expedientesActivos: {
          total: abiertos.length,
          proyectos: new Set(abiertos.map((e) => e.proyectoId)).size,
          empresas: new Set(abiertos.map((e) => e.empresaId)).size,
        },
        cumplimiento: {
          pct: totalCumplimiento.pct,
          cumple: totalCumplimiento.cumple,
          aplicables: totalCumplimiento.items - totalCumplimiento.noAplica,
        },
        primeraRevision: primeraRevision(revisiones, conAnterior),
        itemsEvaluados: itemsEvaluados(delPeriodo),
        vencimientos,
      },
      porProyecto: this._porProyecto(abiertos, proyectoPorId),
      porTipoEntidad: porTipoEntidad(abiertos),
      evolucion: evolucion(revisiones, inicioEvolucion, hasta),
      rechazos,
    };
  }

  /**
   * Opciones de los filtros dependientes del Mandante: Proyectos, Perfiles y
   * Empresas con Expedientes, más los Perfiles activos (selector del
   * ranking).
   * @param {Object[]} generados Expedientes del Mandante.
   * @param {Object[]} perfiles Perfiles del Mandante.
   * @param {Map} proyectoPorId Proyectos.
   * @param {Map} empresaPorId Empresas.
   * @return {Object} {proyectos, perfiles, empresas, perfilesActivos}.
   */
  _opciones(generados, perfiles, proyectoPorId, empresaPorId) {
    const unicos = (campo) => [...new Set(generados.map((e) => e[campo])
        .filter(Boolean))];
    const perfilPorId = new Map(perfiles.map((p) => [p.id, p]));
    const porNombre = (a, b) => (a.nombre || "").localeCompare(b.nombre || "");
    return {
      proyectos: unicos("proyectoId").map((id) => ({
        id, codigo: proyectoPorId.get(id)?.codigo || null,
        nombre: proyectoPorId.get(id)?.nombre || id,
      })).sort(porNombre),
      perfiles: unicos("perfilParticipacionId").map((id) => ({
        id, nombre: perfilPorId.get(id)?.nombre || id,
      })).sort(porNombre),
      empresas: unicos("empresaId").map((id) => ({
        id, nombre: empresaPorId.get(id)?.razonSocial || id,
      })).sort(porNombre),
      perfilesActivos: perfiles.filter((p) => p.estado === "activo")
          .map((p) => ({id: p.id, nombre: p.nombre})).sort(porNombre),
    };
  }

  /**
   * Cumplimiento de hoy por Proyecto (Expedientes no cerrados).
   * @param {Object[]} abiertos Expedientes no cerrados del universo.
   * @param {Map} proyectoPorId Proyectos.
   * @return {Object[]} Filas por Proyecto.
   */
  _porProyecto(abiertos, proyectoPorId) {
    const grupos = new Map();
    abiertos.forEach((e) => {
      if (!grupos.has(e.proyectoId)) grupos.set(e.proyectoId, []);
      grupos.get(e.proyectoId).push(e);
    });
    return [...grupos.entries()].map(([id, expedientes]) => {
      const proyecto = proyectoPorId.get(id);
      return {
        proyectoId: id,
        codigo: proyecto?.codigo || null,
        nombre: proyecto?.nombre || id,
        empresas: expedientes.length,
        ...filaCumplimiento(sumarResumenes(expedientes.map((e) => e.resumen))),
      };
    }).sort((a, b) => b.items - a.items);
  }

  /**
   * Ranking de rechazos (todos y por Perfil activo) y el detalle de cada
   * rechazo de los Requerimientos que aparecen en algún ranking.
   * @param {Object[]} revisiones Revisiones del período.
   * @param {Map} expedientePorId Expedientes del universo.
   * @param {Object[]} perfiles Perfiles del Mandante.
   * @param {Map} proyectoPorId Proyectos.
   * @param {Map} empresaPorId Empresas.
   * @return {Promise<Object>} {minimoEvaluaciones, rankings, detalle}.
   */
  async _rechazos(revisiones, expedientePorId, perfiles, proyectoPorId,
      empresaPorId) {
    const perfilDe = (ev) =>
      expedientePorId.get(ev.expedienteId)?.perfilParticipacionId || null;
    const rankings = {todos: rankingRechazos(revisiones)};
    perfiles.filter((p) => p.estado === "activo").forEach((p) => {
      rankings[p.id] = rankingRechazos(
          revisiones.filter((ev) => perfilDe(ev) === p.id),
      );
    });

    const enRanking = new Set(Object.values(rankings)
        .flatMap((filas) => filas.map((f) => f.requerimientoId)));
    const rechazadas = revisiones.filter((ev) =>
      ev.resultado === "no_cumple" && enRanking.has(ev.requerimientoId));
    const [requerimientos, nombreSujeto] = await Promise.all([
      requerimientoRepository.getByIds([...enRanking]),
      this._nombresSujetos(rechazadas),
    ]);
    const requerimientoPorId = new Map(requerimientos.map((r) => [r.id, r]));
    const conNombre = (fila) => {
      const r = requerimientoPorId.get(fila.requerimientoId);
      return {
        ...fila,
        nombre: r?.nombre || null,
        nombreCorto: r?.nombreCorto || r?.nombre || null,
        tipoEntidad: r?.tipoEntidad || null,
      };
    };
    Object.keys(rankings).forEach((clave) => {
      rankings[clave] = rankings[clave].map(conNombre);
    });

    const detalle = {};
    rechazadas
        .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
        .forEach((ev) => {
          const expediente = expedientePorId.get(ev.expedienteId);
          const proyecto = proyectoPorId.get(expediente.proyectoId);
          const tipoEntidad = tipoEntidadDe(ev);
          if (!detalle[ev.requerimientoId]) detalle[ev.requerimientoId] = [];
          detalle[ev.requerimientoId].push({
            evaluacionId: ev.id,
            expedienteId: ev.expedienteId,
            instanciaId: ev.expedienteRequerimientoId,
            perfilParticipacionId: expediente.perfilParticipacionId || null,
            fecha: ev.fecha,
            tipoEntidad,
            sujetoId: ev.personaId || ev.recursoId || null,
            sujetoNombre: tipoEntidad === "empresa" ? null : nombreSujeto(ev),
            empresaNombre:
                empresaPorId.get(expediente.empresaId)?.razonSocial || null,
            proyectoCodigo: proyecto?.codigo || null,
            proyectoNombre: proyecto?.nombre || null,
          });
        });
    return {minimoEvaluaciones: MIN_EVALUACIONES_RANKING, rankings, detalle};
  }
}

module.exports = new ReportePanelService();
