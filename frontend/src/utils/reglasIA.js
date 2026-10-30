// Etiquetas de las reglas de revisión IA y de los tipos documentales (un solo lugar).

// Mismos valores que `tipoEntidad` de los requerimientos ("recurso" se muestra como Maquinaria).
export const ENTIDADES_IA = [
  { value: "persona", label: "Persona" },
  { value: "empresa", label: "Empresa" },
  { value: "recurso", label: "Maquinaria" },
];
export const etiquetaEntidad = (v) => ENTIDADES_IA.find((e) => e.value === v)?.label || v;

export const TIPOS_REGLA = {
  deterministica: { label: "Determinística", clase: "bg-sky-50 text-sky-700 border-sky-200",
    ayuda: "La IA solo extrae los datos y el sistema verifica. Barata, exacta y auditable." },
  interpretativa: { label: "Interpretativa", clase: "bg-violet-50 text-violet-700 border-violet-200",
    ayuda: "La IA juzga con una instrucción en lenguaje natural y responde resultado, confianza y justificación." },
};

export const TIPOS_CAMPO = [
  { value: "texto", label: "Texto" },
  { value: "rut", label: "RUT" },
  { value: "fecha", label: "Fecha" },
  { value: "patente", label: "Patente" },
  { value: "numero", label: "Número" },
];

export const MIN_INSTRUCCION = 20;

// Estado IA de un requerimiento (sin `estadoIA` = Sin reglas).
export const ESTADOS_IA_REQ = {
  sin_reglas: { label: "Sin reglas", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  en_definicion: { label: "En definición", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  en_prueba: { label: "En prueba", clase: "bg-sky-50 text-sky-700 border-sky-200" },
  habilitado: { label: "IA habilitada", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
};
export const estadoIAReq = (r) => ESTADOS_IA_REQ[r?.estadoIA] || ESTADOS_IA_REQ.sin_reglas;

export const SEVERIDADES = {
  bloqueante: { label: "Bloqueante", clase: "bg-red-50 text-red-700 border-red-200" },
  advertencia: { label: "Advertencia", clase: "bg-amber-50 text-amber-700 border-amber-200" },
};

// Resultado de cada regla y resultado propuesto de una prueba.
export const RESULTADOS_REGLA = {
  cumple: { label: "Cumple", clase: "text-sage-darker" },
  no_cumple: { label: "No cumple", clase: "text-red-600" },
  no_determinable: { label: "No determinable", clase: "text-amber-700" },
};
export const RESULTADOS_PROPUESTOS = {
  cumple: { label: "Cumple", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
  cumple_con_observacion: { label: "Cumple con observación", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  revision_manual: { label: "Revisión manual", clase: "bg-sky-50 text-sky-700 border-sky-200" },
  no_cumple: { label: "No cumple", clase: "bg-red-50 text-red-700 border-red-200" },
};

// Fecha ISO (AAAA-MM-DD o timestamp ISO) → dd/mm/aaaa (con hora si `conHora`).
export const fechaDMA = (iso, conHora = false) => {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().join("/");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const base = `${dd}/${mm}/${d.getFullYear()}`;
  return conHora ? `${base} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : base;
};

// dd/mm/aaaa → AAAA-MM-DD ("" si no es una fecha válida).
export const dmaAIso = (texto) => {
  const m = String(texto || "").trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return "";
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : "";
};

// Estado IA de un tipo documental (Configuración IA → Tipos documentales).
export const ESTADOS_IA_TIPO = {
  no_normalizado: { label: "No normalizado", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  piloto: { label: "Piloto", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  activo: { label: "Activo", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
};

// Código de tipo documental desde un texto: mayúsculas sin tildes, "_" entre palabras, empieza con
// letra, máximo 40 ("Registro de entrega RIOHS" → "REGISTRO_DE_ENTREGA_RIOHS").
export const aCodigoTipo = (texto) => {
  const base = String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const codigo = (/^[A-Z]/.test(base) ? base : `T_${base}`).slice(0, 40).replace(/_+$/, "");
  return codigo.length >= 2 ? codigo : "";
};

// Reglas sugeridas en la pestaña "Reglas IA" del requerimiento (se agregan con un clic): cada una con
// su verificación determinística (functions/src/reglasIA/verificaciones). Solo verificaciones sin
// parámetros obligatorios. Los campos que necesitan los calcula el backend (camposEfectivos).
const REGLAS_SUGERIDAS = [
  { verificacion: "archivo_presente", etiqueta: "Validar existencia del archivo o documento", nombre: "Validar existencia del archivo",
    entidades: ["persona", "empresa", "recurso"] },
  { verificacion: "carpeta_presente", etiqueta: "Validar existencia de la carpeta", nombre: "Validar existencia de la carpeta",
    entidades: ["persona", "empresa", "recurso"] },
  { verificacion: "coincide_rut", etiqueta: "RUT coincide", nombre: "RUT coincide", entidades: ["persona", "empresa"] },
  { verificacion: "coincide_nombre", etiqueta: "Nombre coincide", nombre: "Nombre coincide", entidades: ["persona"] },
  { verificacion: "coincide_patente", etiqueta: "Patente coincide", nombre: "Patente coincide", entidades: ["recurso"] },
  { verificacion: "coincide_empresa", etiqueta: "Empleador coincide con la empresa", nombre: "Empleador coincide con la empresa",
    entidades: ["persona", "recurso"] },
  { verificacion: "documento_legible", etiqueta: "Documento legible", nombre: "Documento legible",
    entidades: ["persona", "empresa", "recurso"] },
  { verificacion: "vigente_a_fecha", etiqueta: "Vigente a la fecha", nombre: "Vigente a la fecha", entidades: ["persona", "empresa", "recurso"] },
  { verificacion: "vigente_hasta_fin_proyecto", etiqueta: "Vigente hasta el fin del proyecto", nombre: "Vigente hasta el fin del proyecto",
    entidades: ["persona", "empresa", "recurso"] },
];
export const reglasSugeridasPara = (tipoEntidad) => REGLAS_SUGERIDAS.filter((r) => r.entidades.includes(tipoEntidad));
