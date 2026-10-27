// Clases compartidas por las pestañas de Configuración → Inteligencia Artificial.
export const CLASE_INPUT = "w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500";
export const CLASE_INPUT_ERROR = "w-full px-3 py-2 bg-red-50/30 border border-red-400 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";
const CLASE_BOTON = "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const CLASE_PRIMARIO = `${CLASE_BOTON} bg-primary hover:bg-primary-dark text-white`;
export const CLASE_SECUNDARIO = `${CLASE_BOTON} border border-slate-200 bg-white text-carbon-dark hover:bg-slate-50`;
export const CLASE_LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";
export const URL_PRECIOS_ANTHROPIC = "https://platform.claude.com/docs/en/about-claude/pricing";

export const formatUsd = (valor, decimales = 2) =>
  `US$${Number(valor || 0).toLocaleString("es-CL", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;

export const TIPOS_SECCION = [
  { value: "archivos", label: "Archivos" },
  { value: "entidades", label: "Entidades (una carpeta por persona o vehículo)" },
  { value: "grupos", label: "Grupos" },
  { value: "subcontratos", label: "Subcontratos" },
];
