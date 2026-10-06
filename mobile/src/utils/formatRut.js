// Formatea un RUT chileno (numero + dv, sin puntos) a "12.345.678-9".
// La validación real vive en el backend (identificacionValidator.js) —
// esto es solo presentación.
export function formatRut(rut) {
  if (!rut) return "-";
  const limpio = String(rut).replace(/[.\-]/g, "").toUpperCase();
  if (limpio.length < 2) return rut;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoFormateado}-${dv}`;
}
