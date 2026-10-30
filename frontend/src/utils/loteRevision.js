import { normalizarNombreMapeo } from "./normalizacionMapeo.js";

// Revisión en lote de un expediente (E5): qué documento va a la IA para cada requisito. Funciones
// PURAS (sin navegador ni API) para probarlas aisladas.
//  - Empresa: los archivos de las rutas del mapeo de su Carpeta de empresa.
//  - Persona / Maquinaria: en la carpeta de cada una, el archivo que coincide con un patrón
//    aprendido de ALTA confianza (patronesRequerimiento, objetivo "archivo"). Sin coincidencia:
//    "Sin documento ubicado" (el evaluador lo elige en el panel y puede "Recordar").
// La elegibilidad no depende del tipo documental: reglas habilitadas + documento ubicado.

export const MAX_ARCHIVOS_LOTE = 6;
export const EXTENSIONES_LOTE = ["jpg", "jpeg", "png", "webp", "pdf", "docx"];
const MIMES = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const MOTIVOS_LOTE = {
  sin_reglas: "Sin reglas habilitadas",
  sin_ubicacion: "Sin ubicación en el mapeo",
  carpeta_vacia: "La ubicación no tiene archivos revisables",
  sin_carpeta_sujeto: "Sin carpeta de la persona o maquinaria",
  sin_documento: "Sin documento ubicado",
  demasiados_archivos: "Más de 6 archivos: elija el documento en el panel",
};

export const ENTIDADES_LOTE = { empresa: "Empresa", persona: "Personas", recurso: "Maquinarias" };

const extension = (nombre) => (String(nombre).includes(".") ? String(nombre).split(".").pop().toLowerCase() : "");
export const archivoRevisable = (nombre) => EXTENSIONES_LOTE.includes(extension(nombre));
export const mimeDe = (nombre) => MIMES[extension(nombre)] || "application/octet-stream";
const ultimo = (ruta) => String(ruta || "").split("/").filter(Boolean).pop() || "";

export const entidadDeInstancia = (i) => (i.personaId ? "persona" : i.recursoId ? "recurso" : "empresa");
export const claveSujeto = (tipo, id) => `${tipo}|${id}`;

// Nombre del sujeto que se quita del nombre del archivo al calcular el patrón (el mismo que se
// envía al "Recordar"): Persona, su nombre completo; Maquinaria, su patente (o su nombre).
export const nombreSujetoPatron = (tipo, sujeto) => (tipo === "persona"
  ? `${sujeto?.nombre || ""} ${sujeto?.apellido || ""}`.trim()
  : String(sujeto?.patente || sujeto?.nombre || "").trim());

// Patrón de un archivo de una persona o maquinaria (misma normalización que el backend).
export const patronArchivoSujeto = (nombreArchivo, tipo, sujeto) => normalizarNombreMapeo(nombreArchivo, {
  archivo: true, quitarFechas: true,
  ...(tipo === "persona" ? { nombrePersona: nombreSujetoPatron(tipo, sujeto) } : { identificadorRecurso: nombreSujetoPatron(tipo, sujeto) }),
});

// Archivos de la carpeta de un sujeto que corresponden a un requerimiento por patrón de ALTA
// confianza: coincidencia exacta con un patrón activo; si el patrón apunta a varios requerimientos
// gana el de más confirmaciones, y un empate no asigna nada (ambiguo).
export const archivosPorPatron = ({ archivos, patrones, requerimientoId, tipo, sujeto }) => {
  const activos = (patrones || []).filter((p) => p.estado === "activo" && p.ambito === tipo && p.objetivo === "archivo");
  if (!activos.length) return [];
  return (archivos || []).filter((a) => {
    if (!archivoRevisable(a.nombre)) return false;
    const patron = patronArchivoSujeto(a.nombre, tipo, sujeto);
    const candidatos = activos.filter((p) => p.patron === patron);
    if (!candidatos.length) return false;
    const max = Math.max(...candidatos.map((p) => p.vecesConfirmado || 0));
    const ganadores = candidatos.filter((p) => (p.vecesConfirmado || 0) === max);
    return ganadores.length === 1 && ganadores[0].requerimientoId === requerimientoId;
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
};

// Archivos de las ubicaciones de un requerimiento de Empresa: un archivo mapeado va tal cual; una
// carpeta mapeada aporta sus archivos revisables de primer nivel (`contenidos`: ruta → { archivos }).
export const archivosDeMapeo = (entradas, contenidos) => {
  const salida = [];
  (entradas || []).forEach((e) => {
    if (e.tipo === "archivo") {
      if (archivoRevisable(e.ruta)) salida.push({ nombre: ultimo(e.ruta), ruta: e.ruta });
    } else {
      (contenidos.get(e.ruta)?.archivos || []).filter((a) => archivoRevisable(a.nombre))
        .forEach((a) => salida.push({ nombre: a.nombre, ruta: a.ruta, tamanoBytes: a.tamanoBytes }));
    }
  });
  return salida;
};

const ORDEN = { empresa: 0, persona: 1, recurso: 2 };

// Plan del lote: un ítem por requisito activo del expediente, "listo" (con sus archivos) o con el
// motivo por el que no se revisa.
//  - instancias: requisitos activos [{ id, requerimientoId, nombre, nombreCorto, orden, personaId, recursoId }].
//  - habilitados: Set de requerimientoId con la IA habilitada.
//  - mapeo: { requerimientos: { requerimientoId: [{ ruta, tipo }] } } de la Carpeta de empresa.
//  - sujetos: Map claveSujeto → { tipo, id, nombre, apellido, patente, carpeta } (carpeta: ruta o null).
//  - contenidos: Map ruta → { archivos: [{ nombre, ruta, tamanoBytes }] } (null: no se pudo leer).
//  - patrones: patrones activos de archivos (persona y recurso).
export const planLote = ({ instancias, habilitados, mapeo, sujetos, contenidos, patrones }) => (instancias || []).map((i) => {
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
  let archivos;
  if (entidad === "empresa") {
    const entradas = mapeo?.requerimientos?.[i.requerimientoId] || [];
    if (!entradas.length) return fuera("sin_ubicacion");
    archivos = archivosDeMapeo(entradas, contenidos);
    if (!archivos.length) return fuera("carpeta_vacia");
  } else {
    const contenido = sujeto?.carpeta ? contenidos.get(sujeto.carpeta) : null;
    if (!contenido) return fuera("sin_carpeta_sujeto");
    archivos = archivosPorPatron({ archivos: contenido.archivos, patrones, requerimientoId: i.requerimientoId, tipo: entidad, sujeto });
    if (!archivos.length) return fuera("sin_documento");
  }
  if (archivos.length > MAX_ARCHIVOS_LOTE) return fuera("demasiados_archivos", { archivos });
  return { ...base, estado: "listo", archivos };
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
