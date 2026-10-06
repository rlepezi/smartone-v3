// Formato manual (no delega en Intl/locale): más predecible entre navegadores que
// `toLocaleDateString("es-CL")`, que en algunos entornos usa guiones en vez de barras.
// Único formateador de fecha del frontend — todas las pantallas lo importan de aquí.
export const formatFecha = (valor) => {
  if (!valor) return "-";
  const date = valor._seconds ? new Date(valor._seconds * 1000) : new Date(valor);
  if (isNaN(date.getTime())) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const aaaa = date.getFullYear();
  return `${dd}/${mm}/${aaaa}`;
};

// Fecha + hora, DD/MM/AAAA, HH:mm (24 horas) — para pantallas que necesitan también la hora
// (ej. Historial de operaciones, Respaldos), no solo el día.
export const formatFechaHora = (valor) => {
  if (!valor) return "-";
  const date = valor._seconds ? new Date(valor._seconds * 1000) : new Date(valor);
  if (isNaN(date.getTime())) return "-";
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${formatFecha(valor)}, ${hh}:${min}`;
};

export const formatTiempoRelativo = (valor) => {
  if (!valor) return "-";
  const date = valor._seconds ? new Date(valor._seconds * 1000) : new Date(valor);
  if (isNaN(date.getTime())) return "-";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} minuto${diffMin === 1 ? "" : "s"}`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `hace ${diffHoras} hora${diffHoras === 1 ? "" : "s"}`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 30) return `hace ${diffDias} día${diffDias === 1 ? "" : "s"}`;

  return formatFecha(valor);
};
