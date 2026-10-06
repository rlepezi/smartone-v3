// Convierte Firestore Timestamp | string | Date -> Date de JS, igual que
// reporteService._aFecha en el backend (mismo criterio en ambos lados).
export function toDate(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  const fecha = new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
}

export function formatDate(valor) {
  const fecha = toDate(valor);
  if (!fecha) return "-";
  return fecha.toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

// Días restantes hasta `valor`, redondeado hacia arriba (mismo cálculo que
// reporteService.generarReporte para vencimientos). Negativo = ya venció.
export function diasRestantes(valor) {
  const fecha = toDate(valor);
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
}
