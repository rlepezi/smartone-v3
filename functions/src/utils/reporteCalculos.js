const {fechaSantiago} = require("./fechaSantiago");
const {porcentajeCumplimiento, sumarResumenes} = require("./cumplimiento");

// Cálculos del panel de Reportes (GET /reportes/panel). Funciones puras, sin
// acceso a datos, para poder probarlas aisladas. Definiciones:
//  - Evaluaciones del período: fecha (createdAt, en America/Santiago) dentro
//    del período, sin las de modalidad "reutilizada" ni las anuladas (las
//    reemplazadas sí cuentan: son la historia de revisiones).
//  - Revisión: evaluación del período con resultado "cumple" o "no_cumple"
//    (no_aplica y pendiente no aprueban ni rechazan).

// Mínimo de revisiones en el período para que un Requerimiento entre al
// ranking de rechazos, y largo del ranking.
const MIN_EVALUACIONES_RANKING = 10;
const TOP_RANKING = 10;
// Hasta este largo del período (≈ 6 meses) la evolución es semanal; si es
// mayor, mensual.
const MAX_DIAS_AGRUPACION_SEMANAL = 183;
const RESULTADOS_REVISION = ["cumple", "no_cumple"];
const TIPOS_ENTIDAD = ["empresa", "persona", "recurso"];
const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Milisegundos de un valor de fecha (Timestamp, Date, {_seconds} o string).
 * @param {*} valor Valor.
 * @return {number} Milisegundos, o 0 si no hay fecha válida.
 */
function msDe(valor) {
  if (!valor) return 0;
  if (typeof valor.toMillis === "function") return valor.toMillis();
  if (typeof valor.toDate === "function") return valor.toDate().getTime();
  if (typeof valor._seconds === "number") return valor._seconds * 1000;
  const ms = new Date(valor).getTime();
  return isNaN(ms) ? 0 : ms;
}

/**
 * Fecha (YYYY-MM-DD, America/Santiago) de una evaluación.
 * @param {Object} evaluacion Evaluación.
 * @return {?string} Fecha o null si no tiene createdAt.
 */
function fechaDeEvaluacion(evaluacion) {
  const ms = msDe(evaluacion.createdAt);
  return ms ? fechaSantiago(new Date(ms)) : null;
}

/**
 * Indica si una evaluación cuenta para el período (ver encabezado), sin
 * mirar la fecha.
 * @param {Object} evaluacion Evaluación.
 * @return {boolean} true si cuenta.
 */
function cuentaEnPeriodo(evaluacion) {
  return evaluacion.modalidad !== "reutilizada" &&
      evaluacion.estado !== "anulada";
}

/**
 * Indica si una evaluación es una revisión (cumple / no cumple).
 * @param {Object} evaluacion Evaluación.
 * @return {boolean} true si aprueba o rechaza.
 */
function esRevision(evaluacion) {
  return RESULTADOS_REVISION.includes(evaluacion.resultado);
}

/**
 * Tipo de entidad de una evaluación según su sujeto.
 * @param {Object} evaluacion Evaluación.
 * @return {string} "persona", "recurso" o "empresa".
 */
function tipoEntidadDe(evaluacion) {
  if (evaluacion.personaId) return "persona";
  if (evaluacion.recursoId) return "recurso";
  return "empresa";
}

/**
 * Conteos y % de cumplimiento de un resumen de contadores (% = cumple ÷
 * (activas − no aplica), igual que en el resto de la app).
 * @param {Object} resumen Resumen {activas, cumple, noCumple, ...}.
 * @return {{items: number, cumple: number, noCumple: number,
 *     pendiente: number, noAplica: number, pct: ?number}} Fila.
 */
function filaCumplimiento(resumen) {
  return {
    items: resumen.activas || 0,
    cumple: resumen.cumple || 0,
    noCumple: resumen.noCumple || 0,
    pendiente: resumen.pendiente || 0,
    noAplica: resumen.noAplica || 0,
    pct: porcentajeCumplimiento(resumen),
  };
}

/**
 * Cumplimiento por tipo de entidad desde `resumenSujetos` de cada
 * Expediente (claves "empresa", "persona_<id>", "recurso_<id>").
 * @param {Object[]} expedientes Expedientes.
 * @return {Object<string, Object>} {empresa, persona, recurso} con la forma
 *     de filaCumplimiento.
 */
function porTipoEntidad(expedientes) {
  const resumenes = {empresa: [], persona: [], recurso: []};
  expedientes.forEach((e) => {
    Object.entries(e.resumenSujetos || {}).forEach(([clave, resumen]) => {
      const tipo = clave === "empresa" ? "empresa" : clave.split("_")[0];
      if (resumenes[tipo]) resumenes[tipo].push(resumen);
    });
  });
  const resultado = {};
  TIPOS_ENTIDAD.forEach((tipo) => {
    resultado[tipo] = filaCumplimiento(sumarResumenes(resumenes[tipo]));
  });
  return resultado;
}

/**
 * Aprobación a la primera revisión: de las instancias cuya PRIMERA revisión
 * cayó en el período, cuántas fueron "cumple".
 * @param {Object[]} revisiones Revisiones del período.
 * @param {Set<string>} conRevisionAnterior Instancias que ya tenían una
 *     revisión antes del período (no cuentan).
 * @return {{instancias: number, aprobadas: number, pct: ?number}} Resultado.
 */
function primeraRevision(revisiones, conRevisionAnterior) {
  const primeras = new Map();
  revisiones.forEach((ev) => {
    const id = ev.expedienteRequerimientoId;
    if (!id || conRevisionAnterior.has(id)) return;
    const actual = primeras.get(id);
    if (!actual || msDe(ev.createdAt) < msDe(actual.createdAt)) {
      primeras.set(id, ev);
    }
  });
  const instancias = primeras.size;
  const aprobadas = [...primeras.values()]
      .filter((ev) => ev.resultado === "cumple").length;
  return {
    instancias, aprobadas,
    pct: instancias ? Math.round((aprobadas / instancias) * 100) : null,
  };
}

/**
 * Ítems evaluados en el período: instancias distintas con al menos una
 * evaluación, y cómo quedaron según su última evaluación del período.
 * @param {Object[]} evaluaciones Evaluaciones del período (todas).
 * @return {{total: number, cumple: number, noCumple: number}} Conteos.
 */
function itemsEvaluados(evaluaciones) {
  const ultimas = new Map();
  evaluaciones.forEach((ev) => {
    const id = ev.expedienteRequerimientoId;
    if (!id) return;
    const actual = ultimas.get(id);
    if (!actual || msDe(ev.createdAt) >= msDe(actual.createdAt)) {
      ultimas.set(id, ev);
    }
  });
  const finales = [...ultimas.values()];
  return {
    total: finales.length,
    cumple: finales.filter((ev) => ev.resultado === "cumple").length,
    noCumple: finales.filter((ev) => ev.resultado === "no_cumple").length,
  };
}

/**
 * Suma días a una fecha YYYY-MM-DD.
 * @param {string} iso Fecha.
 * @param {number} dias Días (negativos restan).
 * @return {string} Fecha resultante.
 */
function sumarDias(iso, dias) {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + dias * MS_DIA)
      .toISOString().slice(0, 10);
}

/**
 * Días entre dos fechas YYYY-MM-DD.
 * @param {string} desde Fecha inicial.
 * @param {string} hasta Fecha final.
 * @return {number} Días (hasta − desde).
 */
function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00.000Z`) -
      Date.parse(`${desde}T00:00:00.000Z`)) / MS_DIA);
}

/**
 * Agrupación de la evolución según el largo del período.
 * @param {string} desde Inicio (YYYY-MM-DD).
 * @param {string} hasta Fin (YYYY-MM-DD).
 * @return {string} "semana" o "mes".
 */
function agrupacionDe(desde, hasta) {
  return diasEntre(desde, hasta) <= MAX_DIAS_AGRUPACION_SEMANAL ?
      "semana" : "mes";
}

/**
 * Inicio del grupo (lunes de la semana o día 1 del mes) de una fecha.
 * @param {string} iso Fecha YYYY-MM-DD.
 * @param {string} agrupacion "semana" o "mes".
 * @return {string} Fecha de inicio del grupo.
 */
function inicioGrupo(iso, agrupacion) {
  if (agrupacion === "mes") return `${iso.slice(0, 7)}-01`;
  const dia = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return sumarDias(iso, -((dia + 6) % 7));
}

/**
 * Inicio del grupo siguiente.
 * @param {string} inicio Inicio de un grupo.
 * @param {string} agrupacion "semana" o "mes".
 * @return {string} Inicio del grupo siguiente.
 */
function siguienteGrupo(inicio, agrupacion) {
  if (agrupacion === "semana") return sumarDias(inicio, 7);
  const [anio, mes] = inicio.split("-").map(Number);
  return mes === 12 ? `${anio + 1}-01-01` :
      `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
}

/**
 * Evolución de revisiones (cumple / no cumple, reevaluaciones incluidas)
 * por semana o mes, con todos los grupos del período (también los vacíos).
 * @param {Object[]} revisiones Revisiones del período, con `fecha`.
 * @param {string} desde Inicio del período (YYYY-MM-DD).
 * @param {string} hasta Fin del período (YYYY-MM-DD).
 * @return {{agrupacion: string, grupos: Object[]}} Grupos con `inicio` y
 *     {cumple, noCumple} para "todas" y cada tipo de entidad.
 */
function evolucion(revisiones, desde, hasta) {
  const agrupacion = agrupacionDe(desde, hasta);
  const vacio = () => ({cumple: 0, noCumple: 0});
  const grupos = new Map();
  const fin = inicioGrupo(hasta, agrupacion);
  for (let g = inicioGrupo(desde, agrupacion); g <= fin;
    g = siguienteGrupo(g, agrupacion)) {
    grupos.set(g, {
      inicio: g, todas: vacio(), empresa: vacio(), persona: vacio(),
      recurso: vacio(),
    });
  }
  revisiones.forEach((ev) => {
    const grupo = grupos.get(inicioGrupo(ev.fecha, agrupacion));
    if (!grupo) return;
    const campo = ev.resultado === "cumple" ? "cumple" : "noCumple";
    grupo.todas[campo]++;
    grupo[tipoEntidadDe(ev)][campo]++;
  });
  return {agrupacion, grupos: [...grupos.values()]};
}

/**
 * Ranking de Requerimientos con más rechazos: tasa = no cumple ÷ (cumple +
 * no cumple) de las revisiones del período. Solo entran los que tienen al
 * menos `minimo` revisiones y algún rechazo; orden por tasa y, a igual tasa,
 * por cantidad de rechazos.
 * @param {Object[]} revisiones Revisiones del período.
 * @param {{minimo: number, top: number}} [opciones] Mínimo y largo.
 * @return {Object[]} Filas {requerimientoId, evaluados, rechazados, tasa}.
 */
function rankingRechazos(revisiones,
    {minimo = MIN_EVALUACIONES_RANKING, top = TOP_RANKING} = {}) {
  const porRequerimiento = new Map();
  revisiones.forEach((ev) => {
    if (!ev.requerimientoId) return;
    if (!porRequerimiento.has(ev.requerimientoId)) {
      porRequerimiento.set(ev.requerimientoId, {
        requerimientoId: ev.requerimientoId, evaluados: 0, rechazados: 0,
      });
    }
    const fila = porRequerimiento.get(ev.requerimientoId);
    fila.evaluados++;
    if (ev.resultado === "no_cumple") fila.rechazados++;
  });
  return [...porRequerimiento.values()]
      .filter((f) => f.evaluados >= minimo && f.rechazados > 0)
      .map((f) => ({...f, tasa: f.rechazados / f.evaluados}))
      .sort((a, b) => b.tasa - a.tasa || b.rechazados - a.rechazados)
      .slice(0, top)
      .map((f) => ({...f, tasa: Math.round(f.tasa * 100)}));
}

module.exports = {
  MIN_EVALUACIONES_RANKING, TOP_RANKING, MAX_DIAS_AGRUPACION_SEMANAL,
  msDe, fechaDeEvaluacion, cuentaEnPeriodo, esRevision, tipoEntidadDe,
  filaCumplimiento, porTipoEntidad, primeraRevision, itemsEvaluados,
  sumarDias, agrupacionDe, inicioGrupo, evolucion, rankingRechazos,
};
