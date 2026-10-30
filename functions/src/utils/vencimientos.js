const {fechaSantiago} = require("./fechaSantiago");

// Vencimiento de los requisitos de un Expediente. ÚNICA definición en el
// backend (el frontend tiene su espejo en src/utils/vencimientos.js):
//  - Un vencimiento cuenta solo si la instancia está ACTIVA, su resultado
//    vigente es "cumple", el Requerimiento pide vencimiento y hay
//    fechaVencimiento (y el Expediente no está cerrado ni en generación: eso
//    lo filtra quien consulta).
//  - "Vencido" depende del día actual, así que se calcula al leer y nunca se
//    guarda como contador. Lo único guardado es
//    resumen.fechaVencimientoMasProxima: la MENOR fechaVencimiento de las
//    instancias que cuentan (si es anterior a hoy, el Expediente tiene algún
//    vencido; si cae dentro del umbral, alguno próximo).
//  - Fechas en zona America/Santiago. La fechaVencimiento es una fecha sin
//    hora guardada a medianoche UTC: se compara por su parte de fecha
//    (YYYY-MM-DD), nunca por la hora.

// Días hacia adelante que cuentan como "próximo a vencer". Centralizado acá
// para hacerlo configurable por Mandante más adelante.
const UMBRAL_PROXIMO_DIAS = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Convierte un valor (Timestamp, Date o string) a Date.
 * @param {*} valor Valor.
 * @return {?Date} Fecha, o null si no hay una válida.
 */
function aFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  const fecha = new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Hoy en America/Santiago.
 * @param {Date} [ahora] Instante de referencia.
 * @return {string} YYYY-MM-DD.
 */
function hoySantiago(ahora = new Date()) {
  return fechaSantiago(ahora);
}

/**
 * Medianoche UTC de una fecha YYYY-MM-DD (así se guardan las fechas sin
 * hora).
 * @param {string} iso Fecha YYYY-MM-DD.
 * @return {Date} Fecha.
 */
function fechaSinHora(iso) {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Inicio de hoy (Santiago) como fecha sin hora: toda fechaVencimiento
 * anterior a este instante ya está vencida.
 * @param {Date} [ahora] Instante de referencia.
 * @return {Date} Fecha.
 */
function inicioDeHoy(ahora = new Date()) {
  return fechaSinHora(hoySantiago(ahora));
}

/**
 * Último día que cuenta como "próximo a vencer" (hoy + umbral).
 * @param {Date} [ahora] Instante de referencia.
 * @return {Date} Fecha sin hora.
 */
function finDelUmbral(ahora = new Date()) {
  return new Date(inicioDeHoy(ahora).getTime() +
      UMBRAL_PROXIMO_DIAS * MS_DIA);
}

/**
 * Clasifica una fecha de vencimiento respecto de hoy.
 * @param {*} fechaVencimiento Fecha (Timestamp, Date o string).
 * @param {string} [hoy] Hoy en Santiago (YYYY-MM-DD).
 * @return {?{clasificacion: string, dias: number}} "vencido" (antes de
 *     hoy), "vence_hoy", "proximo_7" (1 a 7 días), "proximo_30" (8 a 30) o
 *     "vigente"; `dias` es la diferencia con hoy (negativa si venció). null
 *     si no hay fecha.
 */
function clasificarVencimiento(fechaVencimiento, hoy = hoySantiago()) {
  const fecha = aFecha(fechaVencimiento);
  if (!fecha) return null;
  const dias = Math.round(
      (fechaSinHora(fecha.toISOString().slice(0, 10)).getTime() -
          fechaSinHora(hoy).getTime()) / MS_DIA,
  );
  let clasificacion = "vigente";
  if (dias < 0) clasificacion = "vencido";
  else if (dias === 0) clasificacion = "vence_hoy";
  else if (dias <= 7) clasificacion = "proximo_7";
  else if (dias <= UMBRAL_PROXIMO_DIAS) clasificacion = "proximo_30";
  return {clasificacion, dias};
}

/**
 * Indica si una instancia cuenta para vencimientos (ver encabezado).
 * @param {Object} instancia Instancia de Requerimiento.
 * @return {boolean} true si cuenta.
 */
function cuentaParaVencimiento(instancia) {
  return Boolean(instancia) && instancia.estado === "activo" &&
      instancia.resultado === "cumple" &&
      Boolean(instancia.requiereVencimiento) &&
      Boolean(aFecha(instancia.fechaVencimiento));
}

/**
 * Fecha de vencimiento más próxima de un conjunto de instancias (la menor de
 * las que cuentan, vencidas incluidas).
 * @param {Object[]} instancias Instancias del Expediente.
 * @return {{fechaVencimientoMasProxima: ?Date}} Fecha o null.
 */
function resumirVencimientos(instancias) {
  let menor = null;
  (instancias || []).forEach((i) => {
    if (!cuentaParaVencimiento(i)) return;
    const fecha = aFecha(i.fechaVencimiento);
    if (!menor || fecha < menor) menor = fecha;
  });
  return {fechaVencimientoMasProxima: menor};
}

module.exports = {
  UMBRAL_PROXIMO_DIAS, aFecha, hoySantiago, inicioDeHoy, finDelUmbral,
  clasificarVencimiento, cuentaParaVencimiento, resumirVencimientos,
};
