import { hoyISO, sumarDiasISO, formatFecha } from "./fechas";

// Helpers de la página de Reportes (panel de GET /reportes/panel).

// Atajos de período. "personalizado" usa las fechas desde/hasta de la URL.
export const ATAJOS_PERIODO = [
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "anio", label: "Este año" },
  { value: "todo", label: "Todo" },
];
export const PERIODO_POR_DEFECTO = "90";

// Desde/hasta (aaaa-mm-dd) de un atajo; desde "" = sin límite.
export const rangoDeAtajo = (atajo, hoy = hoyISO()) => {
  if (atajo === "30") return { desde: sumarDiasISO(hoy, -29), hasta: hoy };
  if (atajo === "90") return { desde: sumarDiasISO(hoy, -89), hasta: hoy };
  if (atajo === "anio") return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
  return { desde: "", hasta: hoy };
};

export const textoPeriodo = (desde, hasta) =>
  desde ? `${formatFecha(desde)} – ${formatFecha(hasta)}` : `Hasta ${formatFecha(hasta)}`;

export const ETIQUETA_TIPO = { empresa: "Empresa", persona: "Personas", recurso: "Maquinaria" };
export const TIPOS_ENTIDAD = ["empresa", "persona", "recurso"];

// Colores de las barras apiladas: Cumple y No Cumple con los tokens de estado; Pendiente en gris
// claro (lo que falta por evaluar).
export const COLOR_BARRA = { cumple: "bg-sage-dark", noCumple: "bg-red-500", pendiente: "bg-slate-200" };

// % en rojo bajo 60, naranjo entre 60 y 79, verde desde 80.
export const clasePct = (pct) => {
  if (pct === null || pct === undefined) return "text-slate-400";
  if (pct < 60) return "text-red-600";
  if (pct < 80) return "text-orange-500";
  return "text-sage-dark";
};

export const formatPct = (pct) => (pct === null || pct === undefined ? "—" : `${pct}%`);

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Eje de la evolución: inicio de semana "dd-mm" o mes "mmm aaaa".
export const etiquetaGrupo = (inicio, agrupacion) => {
  const [y, m, d] = inicio.split("-");
  return agrupacion === "mes" ? `${MESES_CORTOS[Number(m) - 1]} ${y}` : `${d}-${m}`;
};

// Enlace directo a una instancia dentro del detalle del Expediente (mismo formato que los enlaces de
// Vencimientos: ?tab=…&item=…; Personas y Maquinaria abren además el sujeto).
export const enlaceInstancia = ({ expedienteId, tipoEntidad, sujetoId, instanciaId }) => {
  const params = new URLSearchParams({ tab: tipoEntidad || "empresa" });
  if (tipoEntidad !== "empresa" && sujetoId) params.set("sujeto", sujetoId);
  if (instanciaId) params.set("item", instanciaId);
  return `/expedientes/${expedienteId}?${params.toString()}`;
};
