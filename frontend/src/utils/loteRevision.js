// Revisión en lote de un expediente: qué documento va a la IA para cada requisito. Funciones PURAS
// (sin navegador ni API) para probarlas aisladas. La ubicación sale SOLO del Mapeo documental (la
// plantilla del Mandante): cada requisito se resuelve en los nodos a los que está vinculado
// (override del expediente → alias del nodo), ya resuelto sobre la carpeta real en `resoluciones`
// (utils/resolverEnExpediente.js). Ya no se usan patrones aprendidos ni el mapeo por carpeta.
// La elegibilidad no depende del tipo documental: reglas habilitadas + documento ubicado.

export const MAX_ARCHIVOS_LOTE = 6;
export const EXTENSIONES_LOTE = ["jpg", "jpeg", "png", "webp", "pdf", "docx"];
const MIMES = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const MOTIVOS_LOTE = {
  sin_reglas: "Sin reglas habilitadas",
  sin_ubicacion: "Sin ubicación en el mapeo documental",
  ubicacion_ambigua: "Varias carpetas o archivos posibles: confírmelo en el panel de documentos",
  ubicacion_no_encontrada: "No se encontró en la carpeta: confírmelo en el panel de documentos",
  carpeta_vacia: "La ubicación no tiene archivos revisables",
  sin_carpeta_sujeto: "Sin carpeta de la persona o maquinaria",
  sin_documento: "Sin documento ubicado",
  demasiados_archivos: "Más de 6 archivos: elija el documento en el panel",
};

export const ENTIDADES_LOTE = { empresa: "Empresa", persona: "Personas", recurso: "Maquinarias" };

// De dónde salió la ubicación de un requisito listo.
export const ORIGENES_UBICACION = { override: "Confirmada en el expediente", alias: "Por alias del mapeo" };

const extension = (nombre) => (String(nombre).includes(".") ? String(nombre).split(".").pop().toLowerCase() : "");
export const archivoRevisable = (nombre) => EXTENSIONES_LOTE.includes(extension(nombre));
export const mimeDe = (nombre) => MIMES[extension(nombre)] || "application/octet-stream";

export const entidadDeInstancia = (i) => (i.personaId ? "persona" : i.recursoId ? "recurso" : "empresa");
export const claveSujeto = (tipo, id) => `${tipo}|${id}`;
// Sujeto de una instancia para overrides y resoluciones: "empresa" | personaId | recursoId.
export const sujetoDeInstancia = (i) => i.personaId || i.recursoId || "empresa";
export const claveResolucion = (requerimientoId, sujeto) => `${requerimientoId}|${sujeto}`;

// Nombre del sujeto para mostrar: Persona, su nombre completo; Maquinaria, su patente (o nombre).
export const nombreSujetoPatron = (tipo, sujeto) => (tipo === "persona"
  ? `${sujeto?.nombre || ""} ${sujeto?.apellido || ""}`.trim()
  : String(sujeto?.patente || sujeto?.nombre || "").trim());

const ORDEN = { empresa: 0, persona: 1, recurso: 2 };

// Plan del lote: un ítem por requisito activo del expediente, "listo" (con sus archivos) o con el
// motivo por el que no se revisa.
//  - instancias: requisitos activos [{ id, requerimientoId, nombre, nombreCorto, orden, personaId, recursoId }].
//  - habilitados: Set de requerimientoId con la IA habilitada.
//  - sujetos: Map claveSujeto → { tipo, id, nombre, apellido, patente, carpeta } (carpeta: ruta o null).
//  - resoluciones: Map claveResolucion → resolverRequerimiento ({ estado, archivos, origen, candidatos }).
export const planLote = ({ instancias, habilitados, sujetos, resoluciones = new Map() }) => (instancias || []).map((i) => {
  const entidad = entidadDeInstancia(i);
  const sujetoId = i.personaId || i.recursoId || null;
  const sujeto = sujetoId ? sujetos.get(claveSujeto(entidad, sujetoId)) || null : null;
  const base = {
    instanciaId: i.id, requerimientoId: i.requerimientoId, nombre: i.nombreCorto || i.nombre, orden: i.orden ?? 999,
    entidad, sujetoId, sujetoNombre: sujeto ? (entidad === "persona" ? nombreSujetoPatron("persona", sujeto) : sujeto.nombre || sujeto.patente || "") : "",
    archivos: [],
  };
  const fuera = (motivo, extra = {}) => ({ ...base, ...extra, estado: motivo });
  if (!habilitados.has(i.requerimientoId)) return fuera("sin_reglas");
  if (entidad !== "empresa" && !sujeto?.carpeta) return fuera("sin_carpeta_sujeto");
  const resol = resoluciones.get(claveResolucion(i.requerimientoId, sujetoDeInstancia(i))) || null;
  if (!resol || resol.estado === "sin_mapeo") return fuera("sin_ubicacion");
  if (resol.estado === "sugerida") return fuera("ubicacion_ambigua", { candidatos: resol.candidatos });
  if (resol.estado !== "resuelta") return fuera(entidad === "empresa" ? "ubicacion_no_encontrada" : "sin_documento");
  const archivos = (resol.archivos || []).filter((a) => archivoRevisable(a.nombre))
    .map((a) => ({ nombre: a.nombre, ruta: a.ruta, tamanoBytes: a.tamanoBytes }));
  if (!archivos.length) return fuera(entidad === "empresa" ? "carpeta_vacia" : "sin_documento");
  if (archivos.length > MAX_ARCHIVOS_LOTE) return fuera("demasiados_archivos", { archivos, origen: resol.origen });
  return { ...base, estado: "listo", archivos, origen: resol.origen };
}).sort((a, b) => (ORDEN[a.entidad] - ORDEN[b.entidad]) || a.sujetoNombre.localeCompare(b.sujetoNombre, "es")
  || (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es"));

// Resumen del plan: listos por entidad y cuántos quedan fuera por cada motivo.
export const resumenPlan = (items) => {
  const listos = { empresa: 0, persona: 0, recurso: 0 };
  const porMotivo = {};
  (items || []).forEach((it) => {
    if (it.estado === "listo") listos[it.entidad]++;
    else porMotivo[it.estado] = (porMotivo[it.estado] || 0) + 1;
  });
  return { listos, totalListos: listos.empresa + listos.persona + listos.recurso, porMotivo };
};

// Resumen previo a "Confirmar en bloque": por resultado propuesto, y cuántas se guardarán (las que
// la IA propone SI o NO) frente a las que requieren revisión manual.
export const resumenPropuestas = (revisiones) => {
  const porResultado = { cumple: 0, cumple_con_observacion: 0, no_cumple: 0, revision_manual: 0 };
  let aplicables = 0;
  (revisiones || []).forEach((r) => {
    const clave = r.resultadoPropuesto?.resultado;
    if (clave in porResultado) porResultado[clave]++;
    if (r.propuestaEvaluacion?.resultado) aplicables++;
  });
  return { total: (revisiones || []).length, porResultado, aplicables, manuales: (revisiones || []).length - aplicables };
};

// Páginas de un PDF a partir de su texto (latin1): cuenta los objetos /Type /Page. Si no se pueden
// contar (PDF comprimido), null: la estimación supone 1 página.
export const contarPaginasPdf = (texto) => {
  const n = (String(texto || "").match(/\/Type\s*\/Page(?![a-z])/g) || []).length;
  return n > 0 ? n : null;
};
