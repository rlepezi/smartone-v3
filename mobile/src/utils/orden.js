// Segundos de un Timestamp serializado ({_seconds} / {seconds}), Date o texto ISO; 0 si no hay.
export const segundos = (valor) => {
  if (!valor) return 0;
  if (typeof valor._seconds === "number") return valor._seconds;
  if (typeof valor.seconds === "number") return valor.seconds;
  const t = new Date(valor).getTime();
  return Number.isNaN(t) ? 0 : t / 1000;
};

// Más recientes primero (createdAt; si falta, fechaInicio).
export const masRecientesPrimero = (a, b) =>
  segundos(b.createdAt || b.fechaInicio) - segundos(a.createdAt || a.fechaInicio);
