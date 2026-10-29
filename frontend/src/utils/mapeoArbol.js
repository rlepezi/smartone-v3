// Mapeo documental sobre el árbol real de una Carpeta de empresa: funciones PURAS para decidir qué
// muestra cada nodo y armar los cambios de asignación. Las mismas reglas las valida el backend
// (functions/src/utils/carpetasEmpresa.js: validarAsignaciones); aquí solo guían la pantalla.

// ¿`ruta` está dentro de `base` (descendiente, no igual)? Por prefijo de ruta.
export const dentroDe = (ruta, base) => Boolean(base) && ruta.startsWith(`${base}/`);

// Carpetas que contienen a `ruta`, de la raíz hacia abajo ("a/b/c" → ["a", "a/b"]).
export const ancestros = (ruta) => {
  const partes = String(ruta || "").split("/").filter(Boolean);
  return partes.slice(0, -1).map((_, i) => partes.slice(0, i + 1).join("/"));
};

// Entradas del mapeo como lista plana [{ requerimientoId, ruta, tipo }].
export const entradasPlanas = (mapeo) => Object.entries(mapeo || {})
  .flatMap(([requerimientoId, lista]) => (lista || []).map((e) => ({
    requerimientoId, ruta: e.ruta, tipo: e.tipo === "archivo" ? "archivo" : "carpeta",
  })));

// Qué es un nodo ({ ruta, tipo: "carpeta" | "archivo" }) para el mapeo:
//  - base: la carpeta del personal o de maquinarias (no se asigna).
//  - sujeto: una persona o maquinaria dentro de ellas (no se asigna; se mapea por patrón).
//  - interno: contenido de una persona o maquinaria (no se asigna en esta entrega).
//  - incluido: dentro de una carpeta asignada (requerimientoId de esa carpeta).
//  - asignado: asignado a requerimientoId.
//  - libre: se puede asignar.
export const estadoNodo = (nodo, { mapeo, carpetaPersonas = null, carpetaRecursos = null }) => {
  const bases = [
    { ruta: carpetaPersonas, base: "Carpeta del personal", sujeto: "Persona" },
    { ruta: carpetaRecursos, base: "Carpeta de maquinarias", sujeto: "Maquinaria" },
  ].filter((b) => b.ruta);
  for (const b of bases) {
    if (nodo.ruta === b.ruta) return { clase: "base", etiqueta: b.base };
    if (dentroDe(nodo.ruta, b.ruta)) {
      const resto = nodo.ruta.slice(b.ruta.length + 1);
      if (resto.includes("/")) return { clase: "interno", etiqueta: null };
      if (nodo.tipo === "carpeta") return { clase: "sujeto", etiqueta: b.sujeto };
    }
  }
  const entradas = entradasPlanas(mapeo);
  const contenedora = entradas.find((e) => e.tipo === "carpeta" && dentroDe(nodo.ruta, e.ruta));
  if (contenedora) return { clase: "incluido", requerimientoId: contenedora.requerimientoId };
  const propia = entradas.find((e) => e.ruta === nodo.ruta);
  if (propia) return { clase: "asignado", requerimientoId: propia.requerimientoId };
  return { clase: "libre" };
};

// Cambios (PATCH mapeo) para dejar `nodo` asignado a `nuevoId` (o sin asignar con null): lo quita
// del requerimiento que lo tenía y lo agrega al nuevo. Devuelve { requerimientoId: [{ ruta, tipo }] }
// solo con los requerimientos que cambian (lista vacía = quitar todo).
export const cambiosAsignacion = (mapeo, nodo, nuevoId) => {
  const listaDe = (id) => (mapeo?.[id] || []).map((e) => ({ ruta: e.ruta, tipo: e.tipo === "archivo" ? "archivo" : "carpeta" }));
  const anterior = entradasPlanas(mapeo).find((e) => e.ruta === nodo.ruta)?.requerimientoId || null;
  if (anterior === nuevoId) return {};
  const cambios = {};
  if (anterior) cambios[anterior] = listaDe(anterior).filter((e) => e.ruta !== nodo.ruta);
  if (nuevoId) cambios[nuevoId] = [...listaDe(nuevoId).filter((e) => e.ruta !== nodo.ruta), { ruta: nodo.ruta, tipo: nodo.tipo }];
  return cambios;
};

// Cambios para quitar `ruta` del requerimiento `requerimientoId`.
export const cambiosQuitar = (mapeo, requerimientoId, ruta) => ({
  [requerimientoId]: (mapeo?.[requerimientoId] || []).filter((e) => e.ruta !== ruta)
    .map((e) => ({ ruta: e.ruta, tipo: e.tipo === "archivo" ? "archivo" : "carpeta" })),
});
