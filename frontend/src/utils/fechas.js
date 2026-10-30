// Único módulo de fechas del frontend: toda la aplicación muestra e ingresa fechas como
// dd/mm/aaaa, sin depender del idioma ni de la zona horaria del navegador. Sin librerías.
//
// Dos clases de valores llegan desde la API (Timestamp de Firestore serializado `{_seconds}`):
//  - FECHAS SIN HORA (inicio, término, vencimiento…): el frontend las envía como "aaaa-mm-dd" y el
//    backend las guarda como medianoche UTC. Se formatean con sus componentes UTC, nunca pasando a
//    hora local, para que el día no cambie en Chile (UTC-3 / UTC-4).
//  - INSTANTES (createdAt, eventos de bitácora…): se muestran en la zona America/Santiago.
// Un Timestamp exactamente en medianoche UTC se trata como fecha sin hora.

const ZONA = "America/Santiago";
const RE_ISO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DMA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

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

// "dd/mm/aaaa" -> "aaaa-mm-dd", o null si no es una fecha válida (incluye días inexistentes).
export const parseFechaDMA = (texto) => {
  const m = String(texto || "").trim().match(RE_DMA);
  if (!m) return null;
  const [d, mes, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return esFechaReal(y, mes, d) ? `${y}-${dos(mes)}-${dos(d)}` : null;
};

// Cualquier valor de fecha -> "aaaa-mm-dd" (el formato de los formularios y de los payloads), o
// "" si no es válido. Mismo criterio de día que formatFecha.
export const aFechaISO = (valor) => {
  const p = partesDeFecha(valor);
  return p ? `${p.y}-${dos(p.m)}-${dos(p.d)}` : "";
};

// Hoy en Chile, "aaaa-mm-dd" (no en UTC: a las 21:00 de Chile ya sería "mañana").
export const hoyISO = () => {
  const p = partesEnZona(new Date());
  return `${p.y}-${dos(p.m)}-${dos(p.d)}`;
};

// Suma (o resta) días a una fecha "aaaa-mm-dd" y devuelve "aaaa-mm-dd".
export const sumarDiasISO = (fechaISO, dias) => {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d + dias));
  return `${fecha.getUTCFullYear()}-${dos(fecha.getUTCMonth() + 1)}-${dos(fecha.getUTCDate())}`;
};

// "hace 5 minutos", "hace 3 días"…; pasado un mes, la fecha.
export const formatTiempoRelativo = (valor) => {
  const date = aDate(valor);
  if (!date) return "—";

  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} minuto${diffMin === 1 ? "" : "s"}`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `hace ${diffHoras} hora${diffHoras === 1 ? "" : "s"}`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 30) return `hace ${diffDias} día${diffDias === 1 ? "" : "s"}`;

  return formatFecha(valor);
};
