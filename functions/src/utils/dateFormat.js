// Formato manual (no delega en `toLocaleDateString`/`toLocaleString`, que
// sin datos ICU completos puede variar el separador o el orden) para el
// texto generado en el backend que llega a un usuario (hoy, los correos
// de respaldo). Espejo manual de frontend/src/utils/fechaFormatters.js
// (misma fuente de verdad del formato visible: DD/MM/AAAA) — mismo
// criterio de "espejo" ya usado para otros catálogos compartidos (ver
// ESTADOS_EXPEDIENTE en frontend/src/services/expedienteService.js).
//
// Los Cloud Functions corren con el reloj del proceso en UTC (no en hora
// de Chile), así que —a diferencia del frontend, donde el navegador ya
// está en la zona horaria del usuario— acá SIEMPRE se convierte
// explícitamente a America/Santiago antes de formatear.
//
// Nunca se usa para ordenar/filtrar/comparar fechas ni para nombres de
// archivo o rutas de Storage, donde sigue rigiendo el formato ISO que ya
// se usaba (ver respaldoService.js).

const ZONA_HORARIA = "America/Santiago";

/**
 * Convierte un Timestamp de Firestore, Date o string a milisegundos.
 * @param {*} valor Valor a convertir.
 * @return {?number} Milisegundos desde epoch, o null si no es válida.
 */
function aMillis(valor) {
  if (!valor) return null;
  const ms = typeof valor.toMillis === "function" ?
      valor.toMillis() : new Date(valor).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Descompone un instante en sus campos de fecha/hora en America/Santiago.
 * @param {number} ms Milisegundos desde epoch (UTC).
 * @return {{dia: number, mes: number, anio: number, hora: number,
 *     minuto: number}} Campos en hora de Chile.
 */
function partesEnSantiago(ms) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA, hourCycle: "h23", year: "numeric",
    month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(new Date(ms)).reduce((acc, p) => {
    acc[p.type] = Number(p.value);
    return acc;
  }, {});
  return {
    dia: partes.day, mes: partes.month, anio: partes.year,
    hora: partes.hour, minuto: partes.minute,
  };
}

/**
 * Formatea una fecha como DD/MM/AAAA, en hora de Chile.
 * @param {*} valor Timestamp de Firestore, Date o string.
 * @return {string} Fecha formateada, o "—" si no es válida.
 */
function formatearFecha(valor) {
  const ms = aMillis(valor);
  if (ms === null) return "—";
  const {dia, mes, anio} = partesEnSantiago(ms);
  const dd = String(dia).padStart(2, "0");
  const mm = String(mes).padStart(2, "0");
  return `${dd}/${mm}/${anio}`;
}

/**
 * Formatea una fecha y hora como "DD/MM/AAAA, HH:mm" (24 horas), en hora
 * de Chile.
 * @param {*} valor Timestamp de Firestore, Date o string.
 * @return {string} Fecha y hora formateadas, o "—" si no es válida.
 */
function formatearFechaHora(valor) {
  const ms = aMillis(valor);
  if (ms === null) return "—";
  const {hora, minuto} = partesEnSantiago(ms);
  const hh = String(hora).padStart(2, "0");
  const min = String(minuto).padStart(2, "0");
  return `${formatearFecha(valor)}, ${hh}:${min}`;
}

module.exports = {formatearFecha, formatearFechaHora};
