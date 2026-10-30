import { normalizarNombreMapeo, sugerirRequerimiento } from "./normalizacionMapeo.js";
import { estadoNodo } from "./mapeoArbol.js";

// Sugerencias del mapeo documental sobre lo ya cargado del árbol, con el motor compartido
// (sugerirRequerimiento: patrones aprendidos del Mandante y nombres de los requerimientos). Nunca se
// guardan solas: la pantalla ofrece "Aceptar" / "Usar" y el backend valida las reglas.
export const NIVELES = { alta: 3, media: 2, baja: 1 };

// Patrones activos de Empresa para un tipo de nodo ("carpeta" | "archivo").
const patronesPara = (patrones, tipo) => (patrones || [])
  .filter((p) => p.estado === "activo" && p.ambito === "empresa" && p.objetivo === tipo);

// Sugerencia de cada nodo LIBRE cargado: Map ruta → { nodo, nivel, requerimientoId, candidatos,
// ambiguo }. Los ya asignados, los incluidos en una carpeta asignada y las personas o maquinarias no
// reciben sugerencia. Un requerimiento ya ubicado en la carpeta baja un nivel.
//  - nodos: [{ ruta, nombre, tipo }]. estado: { mapeo, carpetaPersonas, carpetaRecursos }.
//  - patrones: los del Mandante (se usan los activos de Empresa). requerimientos: asignables.
export const sugerenciasDelArbol = ({ nodos, estado, patrones = [], requerimientos }) => {
  const ubicados = Object.entries(estado.mapeo || {}).filter(([, l]) => (l || []).length).map(([id]) => id);
  const salida = new Map();
  nodos.filter((n) => estadoNodo(n, estado).clase === "libre").forEach((n) => {
    const s = sugerirRequerimiento(normalizarNombreMapeo(n.nombre, { archivo: n.tipo === "archivo" }), {
      patrones: patronesPara(patrones, n.tipo), requerimientos, ubicados,
    });
    if (s.nivel) salida.set(n.ruta, { nodo: { ruta: n.ruta, nombre: n.nombre, tipo: n.tipo }, ...s });
  });
  return salida;
};

// Mejor nodo sugerido para cada requerimiento (no ambiguo): Map requerimientoId → sugerencia.
export const mejorPorRequerimiento = (sugerencias) => {
  const salida = new Map();
  [...sugerencias.values()].filter((s) => !s.ambiguo).sort((a, b) => NIVELES[b.nivel] - NIVELES[a.nivel] ||
    a.nodo.ruta.localeCompare(b.nodo.ruta, "es", { numeric: true }))
    .forEach((s) => { if (!salida.has(s.requerimientoId)) salida.set(s.requerimientoId, s); });
  return salida;
};

// Palabras clave de las carpetas especiales (sin patrones aprendidos).
const CLAVES = {
  carpetaPersonas: /trabajador|personal|persona/i,
  carpetaRecursos: /veh[ií]cul|maquinari|equipo/i,
};

// Carpeta sugerida como carpeta del personal / de maquinarias entre las de primer nivel libres:
// primero por patrones estructurales (exactos, la de más confirmaciones), si no por palabras clave.
// Devuelve { nodo, porPatron } o null.
export const sugerirEspecial = ({ campo, carpetas, estado, patrones = [] }) => {
  const libres = carpetas.filter((c) => estadoNodo({ ruta: c.ruta, tipo: "carpeta" }, estado).clase === "libre");
  const estructurales = patrones.filter((p) => p.estado === "activo" && p.ambito === "estructura" && p.objetivo === campo);
  const porPatron = libres.map((c) => ({ c, p: estructurales.find((p) => p.patron === normalizarNombreMapeo(c.nombre, { archivo: false })) }))
    .filter((x) => x.p).sort((a, b) => (b.p.vecesConfirmado || 0) - (a.p.vecesConfirmado || 0))[0];
  if (porPatron) return { nodo: porPatron.c, porPatron: true };
  const porClave = libres.find((c) => CLAVES[campo].test(c.nombre));
  return porClave ? { nodo: porClave, porPatron: false } : null;
};
