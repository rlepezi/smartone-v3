import { hoyISO } from "./fechas";

// Vencimiento de documentos: espejo del backend (functions/src/utils/vencimientos.js). "Vencido"
// depende del día actual y se calcula al leer; el detalle del expediente y el Dashboard usan la
// respuesta de los endpoints de vencimientos, no cálculos propios.

// Días hacia adelante que cuentan como "próximo a vencer". Centralizado acá para hacerlo
// configurable por Mandante más adelante.
export const UMBRAL_PROXIMO_DIAS = 30;

const MS_DIA = 24 * 60 * 60 * 1000;
const aUtc = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

// { clasificacion: "vencido" | "vence_hoy" | "proximo_7" | "proximo_30" | "vigente", dias } para
// una fecha "aaaa-mm-dd", o null si no hay fecha. `hoy` en zona America/Santiago.
export const clasificarVencimiento = (fechaISO, hoy = hoyISO()) => {
  if (!fechaISO) return null;
  const dias = Math.round((aUtc(String(fechaISO).slice(0, 10)) - aUtc(hoy)) / MS_DIA);
  let clasificacion = "vigente";
  if (dias < 0) clasificacion = "vencido";
  else if (dias === 0) clasificacion = "vence_hoy";
  else if (dias <= 7) clasificacion = "proximo_7";
  else if (dias <= UMBRAL_PROXIMO_DIAS) clasificacion = "proximo_30";
  return { clasificacion, dias };
};

// Texto relativo único: "Vencido hace N días", "Vence hoy", "Vence en N días".
export const textoVencimiento = (dias) => {
  if (dias < 0) return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`;
  if (dias === 0) return "Vence hoy";
  return `Vence en ${dias} día${dias === 1 ? "" : "s"}`;
};

// Colores por clasificación: rojo vencido; naranjo vence hoy o ≤ 7 días; ámbar ≤ 30 días.
export const CLASE_VENCIMIENTO = {
  vencido: "text-red-700 bg-red-50 border-red-200",
  vence_hoy: "text-orange-700 bg-orange-50 border-orange-200",
  proximo_7: "text-orange-700 bg-orange-50 border-orange-200",
  proximo_30: "text-amber-700 bg-amber-50 border-amber-200",
};

// Estado de vencimientos de un Expediente desde resumen.fechaVencimientoMasProxima (sin consultas
// por fila): "vencidos" si la fecha más próxima ya pasó, "proximos" si cae dentro del umbral, o
// null. Un Expediente cerrado o en generación no tiene vencimientos.
export const estadoVencimientosExpediente = (expediente) => {
  if (!expediente || expediente.estado === "cerrado" || expediente.estadoGeneracion === "en_proceso") return null;
  const fecha = expediente.resumen?.fechaVencimientoMasProxima;
  if (!fecha) return null;
  const segundos = fecha._seconds ?? fecha.seconds;
  const iso = typeof segundos === "number" ? new Date(segundos * 1000).toISOString() : String(fecha);
  const c = clasificarVencimiento(iso.slice(0, 10));
  if (!c || c.clasificacion === "vigente") return null;
  return c.clasificacion === "vencido" ? "vencidos" : "proximos";
};

// "1 vencido, 2 próximos" (solo lo que existe).
export const resumenTextoVencimientos = ({ vencidos = 0, proximos = 0 }) => [
  vencidos ? `${vencidos} vencido${vencidos === 1 ? "" : "s"}` : null,
  proximos ? `${proximos} próximo${proximos === 1 ? "" : "s"} a vencer` : null,
].filter(Boolean).join(", ");
