// Único módulo de fechas de la app móvil: todas las pantallas muestran fechas como dd/mm/aaaa, sin
// depender del idioma ni de la zona horaria del teléfono. Mismo criterio y mismas funciones que
// frontend/src/utils/fechas.js (mantenerlos alineados). La app móvil no tiene ingreso de fechas.
//
// Dos clases de valores llegan desde la API (Timestamp de Firestore serializado `{_seconds}`):
//  - FECHAS SIN HORA (inicio, término, vencimiento…): el frontend las envía como "aaaa-mm-dd" y el
//    backend las guarda como medianoche UTC. Se formatean con sus componentes UTC, nunca pasando a
//    hora local, para que el día no cambie en Chile (UTC-3 / UTC-4).
//  - INSTANTES (createdAt, eventos de bitácora…): se muestran en la zona America/Santiago.
// Un Timestamp exactamente en medianoche UTC se trata como fecha sin hora.

const ZONA = "America/Santiago";
const RE_ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const dos = (n) => String(n).padStart(2, "0");

// Partes de un instante en America/Santiago. Si el entorno no soporta zonas horarias en Intl,
// cae a la hora local del dispositivo.
let formateadorZona = null;
const partesEnZona = (date) => {
  try {
    if (!formateadorZona) {
      formateadorZona = new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      });
    }
    const p = {};
    formateadorZona.formatToParts(date).forEach(({ type, value }) => { p[type] = value; });
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour), mi: Number(p.minute) };
  } catch {
    return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), hh: date.getHours(), mi: date.getMinutes() };
  }
};

// Date de JS desde Date, Timestamp serializado ({_seconds} / {seconds}), Timestamp de Firestore
// (toDate), milisegundos o texto ISO. null si no es válido.
const aDate = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  let date;
  if (valor instanceof Date) date = valor;
  else if (typeof valor.toDate === "function") date = valor.toDate();
  else if (typeof valor._seconds === "number") date = new Date(valor._seconds * 1000);
  else if (typeof valor.seconds === "number") date = new Date(valor.seconds * 1000);
  else date = new Date(valor);
  return Number.isNaN(date.getTime()) ? null : date;
};

// { y, m, d } del DÍA que representa el valor, o null. "aaaa-mm-dd" se lee tal cual (sin pasar
// por UTC); medianoche UTC es una fecha sin hora; el resto es un instante en America/Santiago.
const partesDeFecha = (valor) => {
  if (typeof valor === "string") {
    const iso = valor.trim().match(RE_ISO_FECHA);
    if (iso) return esFechaReal(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) } : null;
  }
  const date = aDate(valor);
  if (!date) return null;
  if (date.getTime() % 86400000 === 0) {
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
  }
  return partesEnZona(date);
};

// true si día/mes/año existen en el calendario (31/02 no; 29/02 solo en bisiesto).
function esFechaReal(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// "dd/mm/aaaa". Acepta "aaaa-mm-dd", ISO con hora, Date y Timestamp serializado. Con null,
// undefined o un valor inválido devuelve "—".
export const formatFecha = (valor) => {
  const p = partesDeFecha(valor);
  return p ? `${dos(p.d)}/${dos(p.m)}/${p.y}` : "—";
};

// "dd/mm/aaaa HH:mm", en 24 horas y en la zona America/Santiago. "—" si no es válida.
export const formatFechaHora = (valor) => {
  const date = aDate(valor);
  if (!date) return "—";
  const p = partesEnZona(date);
  return `${dos(p.d)}/${dos(p.m)}/${p.y} ${dos(p.hh)}:${dos(p.mi)}`;
};

// Días restantes hasta `valor`, redondeado hacia arriba (mismo cálculo que
// reporteService.generarReporte para vencimientos). Negativo = ya venció.
export function diasRestantes(valor) {
  const fecha = aDate(valor);
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
}
