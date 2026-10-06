// La fecha de las métricas de usuario se calcula en la zona horaria
// America/Santiago, NUNCA en UTC — una sesión a las 23:30 hora de Chile
// debe contar en ESE día, no en el siguiente (que sería el caso si se
// usara UTC directo, con Chile en UTC-3/UTC-4 según horario de verano).
// `Intl.DateTimeFormat` con locale "en-CA" devuelve directo el formato
// YYYY-MM-DD, sin tener que armar el string a mano.
const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * @param {Date} [fecha] Fecha a convertir — por defecto, ahora.
 * @return {string} La fecha en zona America/Santiago, formato YYYY-MM-DD.
 */
function fechaSantiago(fecha = new Date()) {
  return FORMATTER.format(fecha);
}

module.exports = {fechaSantiago};
