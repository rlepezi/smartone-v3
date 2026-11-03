// Aplica el resolvedor puro de nodos (utils/resolverNodo.js) sobre la carpeta real del expediente en
// el navegador: lee solo las carpetas que pide, una vez cada una (caché compartible). No escribe.
// `config`: ubicacionExpedienteService.config (nodos activos y habilitados, aplicables por
// requerimiento y overrides).

import { listarDirectorio } from "../services/fuentes/carpetaLocal.js";
import { resolverNodo } from "./resolverNodo.js";

const MAX_PASOS = 30;

// Lector con caché (Map ruta → { carpetas, archivos } | null).
export const lectorCarpeta = (handle, cache) => async (ruta) => {
  if (cache.has(ruta)) return cache.get(ruta);
  const l = await listarDirectorio(handle, ruta).catch(() => null);
  const valor = l ? { carpetas: l.carpetas || [], archivos: l.archivos || [] } : null;
  cache.set(ruta, valor);
  return valor;
};

// resolverNodo leyendo lo que pida. Nunca devuelve "pendiente".
export const resolverNodoEnCarpeta = async ({ leer, cache, ...entrada }) => {
  const hijosDe = (r) => (cache.has(r) ? cache.get(r) : undefined);
  for (let i = 0; i < MAX_PASOS; i++) {
    const r = resolverNodo({ ...entrada, hijosDe });
    if (r.estado !== "pendiente") return r;
    await leer(r.leer);
  }
  return { estado: "no_encontrada", rutaReal: null, origen: null, candidatos: [], archivos: [], leer: null };
};

const overrideDe = (config, nodoClave, sujeto) =>
  (config?.overrides || []).find((o) => o.nodoClave === nodoClave && o.sujeto === sujeto) || null;

// Carpeta de las personas (o maquinarias) del expediente: la sección de entidades de la plantilla,
// por alias u override (sujeto "empresa"). Devuelve { rutaReal, nodo } o null.
export const carpetaDeEntidades = async ({ config, entidad, leer, cache }) => {
  const secciones = (config?.nodos || []).filter((n) => n.tipoNodo === "seccion" && n.seccionTipo === "entidades" && n.entidad === entidad);
  for (const nodo of secciones) {
    const r = await resolverNodoEnCarpeta({ nodo, base: "", override: overrideDe(config, nodo.nodoClave, "empresa"), leer, cache });
    if (r.estado === "resuelta") return { rutaReal: r.rutaReal, nodo };
  }
  return null;
};

// Ubicación de un requerimiento en el expediente: resuelve cada nodo aplicable (los de su
// vínculo que están en el perfil). `sujeto`: "empresa" | personaId | recursoId; `carpetaSujeto`: la
// carpeta de la persona o maquinaria (documentos de entidad).
// Devuelve { estado: "resuelta" | "sugerida" | "no_encontrada" | "sin_mapeo", archivos, origen,
// candidatos, nodoClave (el nodo a confirmar si no resolvió), resultados: [{ nodo, r }] }.
export const resolverRequerimiento = async ({ config, requerimientoId, sujeto = "empresa", carpetaSujeto = null, leer, cache }) => {
  const claves = config?.aplicables?.[requerimientoId] || [];
  const nodos = claves.map((k) => (config.nodos || []).find((n) => n.nodoClave === k)).filter(Boolean);
  if (!nodos.length) return { estado: "sin_mapeo", archivos: [], origen: null, candidatos: [], nodoClave: null, resultados: [] };
  const resultados = [];
  for (const nodo of nodos) {
    const deEntidad = nodo.tipoNodo === "documentoEntidad";
    const seccion = nodo.tipoNodo === "archivoSuelto" ? (config.nodos || []).find((n) => n.nodoClave === nodo.seccionClave) || null : null;
    const r = await resolverNodoEnCarpeta({
      nodo, seccion, base: "", carpetaSujeto: deEntidad ? carpetaSujeto : null,
      override: overrideDe(config, nodo.nodoClave, deEntidad ? sujeto : "empresa"),
      overrideSeccion: seccion ? overrideDe(config, seccion.nodoClave, "empresa") : null,
      leer, cache,
    });
    resultados.push({ nodo, r });
  }
  const resueltos = resultados.filter((x) => x.r.estado === "resuelta");
  if (resueltos.length) {
    const archivos = [];
    resueltos.forEach((x) => x.r.archivos.forEach((a) => { if (!archivos.some((b) => b.ruta === a.ruta)) archivos.push(a); }));
    return {
      estado: "resuelta", archivos, origen: resueltos.some((x) => x.r.origen === "override") ? "override" : "alias",
      candidatos: [], nodoClave: resueltos[0].nodo.nodoClave, resultados,
    };
  }
  const sugerida = resultados.find((x) => x.r.estado === "sugerida");
  if (sugerida) {
    return { estado: "sugerida", archivos: [], origen: "alias", candidatos: sugerida.r.candidatos, nodoClave: sugerida.nodo.nodoClave, resultados };
  }
  return { estado: "no_encontrada", archivos: [], origen: null, candidatos: [], nodoClave: nodos[0].nodoClave, resultados };
};
