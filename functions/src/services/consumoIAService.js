const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const sesionRevisionRepository =
    require("../repositories/sesionRevisionRepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const aiConfigService = require("./aiConfigService");
const {fechaSantiago} = require("../utils/fechaSantiago");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");
const AppError = require("../utils/AppError");

const MESES = 6;
const ULTIMAS_SESIONES = 10;
const MS_DIA = 24 * 60 * 60 * 1000;
const NOTA_LIMITE_GLOBAL = "El límite de gasto es global y lo administra " +
    "el superadmin.";

/**
 * Meses AAAA-MM desde hace (n - 1) meses hasta el actual.
 * @param {string} mesActual AAAA-MM.
 * @param {number} n Cantidad.
 * @return {string[]} Meses en orden.
 */
function ultimosMeses(mesActual, n) {
  const [anio, mes] = mesActual.split("-").map(Number);
  return Array.from({length: n}, (_, i) => {
    const d = new Date(Date.UTC(anio, mes - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1)
        .padStart(2, "0")}`;
  });
}

const redondear = (v) => Math.round(v * 10000) / 10000;

/**
 * Pestaña Consumo de Configuración IA: gasto del mes, últimos 6 meses, por
 * tipo documental, por Mandante (superadmin) y últimas sesiones, en una sola
 * respuesta. superadmin ve todo (o un Mandante); mandante_admin solo lo suyo
 * y sin el límite (es global).
 */
class ConsumoIAService {
  /**
   * Consumo agregado.
   * @param {{mandanteId: (string|undefined)}} filtros Filtros.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Consumo.
   */
  async obtener({mandanteId} = {}, actor) {
    const esSuperadmin = actor.rol === "superadmin";
    if (!esSuperadmin && actor.rol !== "mandante_admin") {
      throw new AppError(403, "No tiene acceso al consumo de IA.");
    }
    const mandante = esSuperadmin ? (mandanteId || null) : actor.mandanteId;
    const mesActual = fechaSantiago().slice(0, 7);
    const meses = ultimosMeses(mesActual, MESES);
    const desde = new Date(Date.parse(`${meses[0]}-01T00:00:00Z`) - MS_DIA);

    const [items, sesiones] = await Promise.all([
      procesamientoIARepository.listConsumoDesde(mandante, desde),
      sesionRevisionRepository.list(mandante, ULTIMAS_SESIONES),
    ]);
    const conMes = items.map((i) => ({
      ...i, mes: i.createdAt?.toDate ?
        fechaSantiago(i.createdAt.toDate()).slice(0, 7) : null,
    })).filter((i) => meses.includes(i.mes));
    const delMes = conMes.filter((i) => i.mes === mesActual);

    const porMes = meses.map((mes) => ({
      mes,
      gastoUsd: redondear(conMes.filter((i) => i.mes === mes)
          .reduce((s, i) => s + (i.costoUsd || 0), 0)),
    }));
    const agrupar = (lista, clave) => {
      const mapa = new Map();
      lista.forEach((i) => {
        const k = i[clave] || "sin_tipo";
        const g = mapa.get(k) || {clave: k, documentos: 0, gastoUsd: 0};
        g.documentos++;
        g.gastoUsd += i.costoUsd || 0;
        mapa.set(k, g);
      });
      return [...mapa.values()]
          .map((g) => ({...g, gastoUsd: redondear(g.gastoUsd)}))
          .sort((a, b) => b.gastoUsd - a.gastoUsd);
    };

    const mandanteIds = [
      ...delMes.map((i) => i.mandanteId), ...sesiones.map((s) => s.mandanteId),
    ];
    const nombres = new Map((await mandanteRepository.getByIds(mandanteIds))
        .map((m) => [m.id, getMandanteDisplayName(m) || m.id]));

    const respuesta = {
      mes: mesActual,
      gastoMesUsd: redondear(delMes.reduce((s, i) => s + (i.costoUsd || 0),
          0)),
      porMes,
      porTipo: agrupar(delMes, "tipoDetectado")
          .map(({clave, ...g}) => ({tipo: clave, ...g})),
      ultimasSesiones: sesiones.map((s) => ({
        id: s.id, nombre: s.nombre, createdAt: s.createdAt,
        mandanteId: s.mandanteId,
        mandanteNombre: nombres.get(s.mandanteId) || s.mandanteId,
        fuente: s.fuente, estado: s.estado, totales: s.totales,
        costoRealUsd: s.costoRealUsd || 0,
      })),
    };
    if (!esSuperadmin) {
      return {...respuesta, limite: null, notaLimite: NOTA_LIMITE_GLOBAL};
    }
    const [{limiteGastoMensualUsd}, global] = await Promise.all([
      aiConfigService.obtenerParametros(), aiConfigService.gastoMes(),
    ]);
    return {
      ...respuesta,
      porMandante: agrupar(delMes, "mandanteId").map(({clave, ...g}) => ({
        mandanteId: clave, mandanteNombre: nombres.get(clave) || clave, ...g,
      })),
      // El límite es global: se compara con el gasto de todos los Mandantes.
      limite: {
        limiteGastoMensualUsd: limiteGastoMensualUsd ?? null,
        gastoTotalMesUsd: global.gastoUsd,
      },
    };
  }
}

module.exports = new ConsumoIAService();
module.exports.ultimosMeses = ultimosMeses;
