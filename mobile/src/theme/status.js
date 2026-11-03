// Estados visuales de la app: fondo (`bg`), texto (`fg`) y punto o barra
// (`dot`). Un estado siempre se muestra con su etiqueta además del color.
const TONOS = {
  aprobado: { bg: "#DCFCE7", fg: "#15803D", dot: "#16A34A" },
  aceptable: { bg: "#FEF3C7", fg: "#92400E", dot: "#F59E0B" },
  rechazado: { bg: "#FEE2E2", fg: "#B91C1C", dot: "#DC2626" },
  vencido: { bg: "#FFEDD5", fg: "#C2410C", dot: "#EA580C" },
  sinRevisar: { bg: "#E2E8F0", fg: "#475569", dot: "#64748B" },
  neutro: { bg: "#F1F5F9", fg: "#64748B", dot: "#CBD5E1" },
};

// Nivel de acreditación de una Empresa, Persona o Equipo en una participación
// (o agregado). Claves de utils/complianceStatus.js.
export const ESTADO_NIVEL = {
  acreditada: { label: "Acreditada", ...TONOS.aprobado },
  aceptable: { label: "Aceptable", ...TONOS.aceptable },
  rechazada: { label: "Rechazada", ...TONOS.rechazado },
  pendiente: { label: "Pendiente", ...TONOS.sinRevisar },
  sinRequerimientos: { label: "Sin requerimientos", ...TONOS.neutro },
  sinParticipacion: { label: "Sin participación", ...TONOS.neutro },
};

// Estado de un requerimiento (fila).
export const ESTADO_REQUERIMIENTO = {
  aprobado: { label: "Aprobado", ...TONOS.aprobado },
  rechazado: { label: "Rechazado", ...TONOS.rechazado },
  vencido: { label: "Vencido", ...TONOS.vencido },
  sinRevisar: { label: "Sin revisar", ...TONOS.sinRevisar },
  noAplica: { label: "No aplica", ...TONOS.neutro },
};

// Estado de un Proyecto (catálogo de functions/src/services/proyectoService.js).
export const ESTADO_PROYECTO = {
  planificado: { label: "Planificado", ...TONOS.sinRevisar },
  en_ejecucion: { label: "En ejecución", ...TONOS.aprobado },
  suspendido: { label: "Suspendido", ...TONOS.aceptable },
  finalizado: { label: "Finalizado", ...TONOS.neutro },
  archivado: { label: "Archivado", ...TONOS.neutro },
};

// Alerta de documentos vencidos.
export const TONO_VENCIDO = TONOS.vencido;

// Barra segmentada: aprobados / rechazados / sin revisar.
export const TONO_SEGMENTO = {
  aprobados: TONOS.aprobado.dot,
  rechazados: TONOS.rechazado.dot,
  sinRevisar: TONOS.sinRevisar.dot,
};

export const estadoNivel = (clave) => ESTADO_NIVEL[clave] || ESTADO_NIVEL.sinRequerimientos;
export const estadoRequerimiento = (clave) => ESTADO_REQUERIMIENTO[clave] || ESTADO_REQUERIMIENTO.sinRevisar;
// Estado de proyecto desconocido: se muestra tal cual, con la primera letra en mayúscula.
export const estadoProyecto = (clave) => ESTADO_PROYECTO[clave] || {
  label: clave ? clave.charAt(0).toUpperCase() + clave.slice(1).replace(/_/g, " ") : "—",
  ...TONOS.neutro,
};
