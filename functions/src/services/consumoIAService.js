const consumoIARepository = require("../repositories/consumoIARepository");
const sesionRevisionRepository =
    require("../repositories/sesionRevisionRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const aiConfigService = require("./aiConfigService");
const {ORIGENES} = require("./registroConsumoIAService");
const {fechaSantiago, inicioDiaSantiago} = require("../utils/fechaSantiago");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");
const AppError = require("../utils/AppError");

const MESES = 6;
const ULTIMAS_SESIONES = 10;
// Rango máximo de un resumen, en días.
const MAX_DIAS_RANGO = 731;
// Valor de `mandanteId` para filtrar los consumos sin Mandante.
const MANDANTE_INTERNO = "interno";
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Suma días a una fecha AAAA-MM-DD.
 * @param {string} iso Fecha.
 * @param {number} dias Días (puede ser negativo).
 * @return {string} Fecha AAAA-MM-DD.
 */
function sumarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * Meses AAAA-MM desde hace (n - 1) meses hasta `mesFinal`.
 * @param {string} mesFinal AAAA-MM.
 * @param {number} n Cantidad.
 * @return {string[]} Meses en orden.
 */
function ultimosMeses(mesFinal, n) {
  const [anio, mes] = mesFinal.split("-").map(Number);
  return Array.from({length: n}, (_, i) => {
    const d = new Date(Date.UTC(anio, mes - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1)
        .padStart(2, "0")}`;
  });
}

/**
 * Primer día del mes siguiente a un mes AAAA-MM.
 * @param {string} mes AAAA-MM.
 * @return {string} AAAA-MM-01.
 */
function inicioMesSiguiente(mes) {
  // Del día 28 de cualquier mes, 4 días después siempre es el mes siguiente.
  return `${sumarDias(`${mes}-28`, 4).slice(0, 7)}-01`;
}

const redondear = (v) => Math.round(v * 1000000) / 1000000;

/**
 * Totales de un conjunto de consumos. "Documentos" son las llamadas que
 * revisan un documento (todas salvo "Probar conexión").
 * @param {Object[]} lista Consumos.
 * @return {Object} {llamadas, documentos, tokensEntrada, tokensSalida,
 *     costoUsd, costoPromedioDocumentoUsd}.
 */
function totales(lista) {
  const t = {llamadas: 0, documentos: 0, tokensEntrada: 0, tokensSalida: 0,
    costoUsd: 0};
  lista.forEach((c) => {
    t.llamadas++;
    if (c.origen !== ORIGENES.PROBAR_CONEXION) t.documentos++;
    t.tokensEntrada += c.tokensEntrada || 0;
    t.tokensSalida += c.tokensSalida || 0;
    t.costoUsd += c.costoUsd || 0;
  });
  return {...t, costoUsd: redondear(t.costoUsd),
    costoPromedioDocumentoUsd: t.documentos ?
      redondear(t.costoUsd / t.documentos) : 0};
}

/**
 * Agrupa consumos por una clave y totaliza cada grupo, de mayor a menor
 * costo.
 * @param {Object[]} lista Consumos.
 * @param {Function} clave (consumo) => clave del grupo (null permitido).
 * @return {Array<{clave: *, items: Object[]}>} Grupos con sus totales.
 */
function agrupar(lista, clave) {
  const mapa = new Map();
  lista.forEach((c) => {
    const k = clave(c) ?? null;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(c);
  });
  return [...mapa.entries()]
      .map(([k, items]) => ({clave: k, ejemplo: items[0], ...totales(items)}))
      .sort((a, b) => b.costoUsd - a.costoUsd);
}

const pct = (parte, total) =>
  (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

const mesDe = (c) => (c.createdAt?.toDate ?
  fechaSantiago(c.createdAt.toDate()).slice(0, 7) : null);

/**
 * Consumo de IA para Configuración → Inteligencia Artificial (solo
 * superadmin: el gasto de IA es información interna de SmartApplication).
 * Lee el registro consumosIA, con el costo congelado en cada llamada.
 */
class ConsumoIAService {
  /**
   * Exige superadmin.
   * @param {Object} actor Usuario autenticado.
   * @return {void}
   */
  _exigirSuperadmin(actor) {
    if (actor?.rol !== "superadmin") {
      throw new AppError(403, "No tiene acceso al consumo de IA.");
    }
  }

  /**
   * Valida y completa el período (AAAA-MM-DD, en hora de Chile). Sin
   * fechas: el mes actual hasta hoy.
   * @param {?string} desde Inicio.
   * @param {?string} hasta Fin (inclusive).
   * @return {{desde: string, hasta: string}} Período.
   */
  _periodo(desde, hasta) {
    const hoy = fechaSantiago();
    const d = desde || `${hoy.slice(0, 7)}-01`;
    const h = hasta || hoy;
    const real = (iso) => RE_ISO.test(iso) && sumarDias(iso, 0) === iso;
    if (!real(d) || !real(h)) {
      throw new AppError(400, "Las fechas del período no son válidas.");
    }
    if (d > h) {
      throw new AppError(400, "La fecha de inicio es posterior a la de fin.");
    }
    if (Date.parse(h) - Date.parse(d) > MAX_DIAS_RANGO * 86400000) {
      throw new AppError(400, "El período no puede superar los 24 meses.");
    }
    return {desde: d, hasta: h};
  }

  /**
   * Resumen de consumo del período: total, por Mandante y, si se pide un
   * Mandante, su desglose por origen, por tipo documental y por mes
   * (últimos 6 meses hasta el mes de `hasta`).
   * @param {{desde: ?string, hasta: ?string, mandanteId: ?string}} filtros
   *     Período (AAAA-MM-DD) y Mandante ("interno": sin Mandante).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Resumen.
   */
  async resumen({desde, hasta, mandanteId} = {}, actor) {
    this._exigirSuperadmin(actor);
    const periodo = this._periodo(desde, hasta);
    // undefined: todos; null: los sin Mandante; string: ese Mandante.
    let filtro;
    if (mandanteId) {
      filtro = mandanteId === MANDANTE_INTERNO ? null : String(mandanteId);
    }
    const items = await consumoIARepository.listEntre(
        inicioDiaSantiago(periodo.desde),
        inicioDiaSantiago(sumarDias(periodo.hasta, 1)), filtro);

    const total = totales(items);
    const grupos = agrupar(items, (c) => c.mandanteId);
    const mandantes = new Map((await mandanteRepository.getByIds(
        grupos.map((g) => g.clave))).map((m) => [m.id, m]));
    const porMandante = grupos.map(({clave, ejemplo, ...t}) => ({
      mandanteId: clave,
      mandanteNombre: clave ?
        getMandanteDisplayName(mandantes.get(clave)) || clave : null,
      logoUrl: mandantes.get(clave)?.logoUrl || null,
      ...t, porcentaje: pct(t.costoUsd, total.costoUsd),
    })).sort((a, b) => (a.mandanteId === null) - (b.mandanteId === null) ||
        b.costoUsd - a.costoUsd);

    const respuesta = {...periodo, mandanteId: mandanteId || null, total,
      porMandante};
    if (filtro === undefined) return respuesta;

    const quitarEjemplo = ({ejemplo, clave, ...t}) => t;
    const porOrigen = agrupar(items, (c) => c.origen).map((g) => ({
      origen: g.clave, ...quitarEjemplo(g),
      porcentaje: pct(g.costoUsd, total.costoUsd)}));
    const porTipoDocumental = agrupar(items, (c) =>
      c.tipoDocumentalId || c.tipoDocumentalNombre).map((g) => ({
      tipoDocumentalId: g.ejemplo.tipoDocumentalId || null,
      tipoDocumentalNombre: g.ejemplo.tipoDocumentalNombre || null,
      ...quitarEjemplo(g), porcentaje: pct(g.costoUsd, total.costoUsd)}));

    const meses = ultimosMeses(periodo.hasta.slice(0, 7), MESES);
    const historico = await consumoIARepository.listEntre(
        inicioDiaSantiago(`${meses[0]}-01`),
        inicioDiaSantiago(inicioMesSiguiente(meses[MESES - 1])), filtro);
    const porMes = meses.map((mes) => {
      const t = totales(historico.filter((c) => mesDe(c) === mes));
      return {mes, documentos: t.documentos, llamadas: t.llamadas,
        costoUsd: t.costoUsd};
    });

    return {...respuesta,
      detalle: {porOrigen, porTipoDocumental, porMes}};
  }

  /**
   * Gasto global del mes contra el límite y las últimas sesiones de
   * revisión de carpetas (pestaña Consumo).
   * @param {{mandanteId: (string|undefined)}} filtros Mandante de las
   *     sesiones (opcional).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} {mes, gastoMesUsd, limite, ultimasSesiones}.
   */
  async obtener({mandanteId} = {}, actor) {
    this._exigirSuperadmin(actor);
    const [sesiones, {limiteGastoMensualUsd}, global] = await Promise.all([
      sesionRevisionRepository.list(mandanteId || null, ULTIMAS_SESIONES),
      aiConfigService.obtenerParametros(), aiConfigService.gastoMes(),
    ]);
    const nombres = new Map((await mandanteRepository.getByIds(
        sesiones.map((s) => s.mandanteId)))
        .map((m) => [m.id, getMandanteDisplayName(m) || m.id]));
    return {
      mes: global.mes,
      gastoMesUsd: global.gastoUsd,
      // El límite es global: se compara con el gasto de todos los Mandantes.
      limite: {limiteGastoMensualUsd: limiteGastoMensualUsd ?? null,
        gastoTotalMesUsd: global.gastoUsd},
      ultimasSesiones: sesiones.map((s) => ({
        id: s.id, nombre: s.nombre, createdAt: s.createdAt,
        mandanteId: s.mandanteId,
        mandanteNombre: nombres.get(s.mandanteId) || s.mandanteId,
        fuente: s.fuente, estado: s.estado, totales: s.totales,
        costoRealUsd: s.costoRealUsd || 0,
      })),
    };
  }
}

module.exports = new ConsumoIAService();
module.exports.ultimosMeses = ultimosMeses;
module.exports.totales = totales;
module.exports.MANDANTE_INTERNO = MANDANTE_INTERNO;
