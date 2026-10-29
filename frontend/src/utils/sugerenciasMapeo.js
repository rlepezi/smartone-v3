import { normalizarNombreMapeo, similitudTokens, tokensSignificativos } from "./normalizacionMapeo.js";
import { estadoNodo } from "./mapeoArbol.js";

// Sugerencias del mapeo documental por NOMBRE del requerimiento (sin patrones aprendidos todavía):
// cada requerimiento sin ubicar se compara con las carpetas y archivos libres ya cargados del árbol.
// Nunca se guarda solo: la pantalla ofrece "Usar" y el backend valida las reglas.
//  - alta: mismo nombre normalizado, o los mismos tokens significativos (nombre corto o nombre).
//  - media: el nodo contiene todos los tokens significativos del nombre corto, o Dice ≥ 0,8.
//  - baja: comparte un token significativo de 4 o más letras.
export const NIVELES = { alta: 3, media: 2, baja: 1 };

// Nivel y puntaje de un nodo (nombre ya normalizado) para un requerimiento.
export const confianzaPorNombre = (nodoNormalizado, requerimiento) => {
  const nombres = [requerimiento.nombreCorto, requerimiento.nombre].filter(Boolean)
    .map((n) => normalizarNombreMapeo(n, { archivo: false }));
  const tokensNodo = tokensSignificativos(nodoNormalizado);
  if (!tokensNodo.length || !nombres.length) return { nivel: null, puntaje: 0 };
  const puntaje = Math.max(...nombres.map((n) => similitudTokens(nodoNormalizado, n)));
  const mismos = (n) => {
    const t = tokensSignificativos(n);
    return t.length > 0 && t.length === tokensNodo.length && t.every((x) => tokensNodo.includes(x));
  };
  if (nombres.some((n) => n === nodoNormalizado || mismos(n))) return { nivel: "alta", puntaje };
  const corto = tokensSignificativos(nombres[0]);
  if ((corto.length && corto.every((t) => tokensNodo.includes(t))) || puntaje >= 0.8) return { nivel: "media", puntaje };
  const largos = new Set(nombres.flatMap(tokensSignificativos).filter((t) => t.length >= 4));
  if (tokensNodo.some((t) => largos.has(t))) return { nivel: "baja", puntaje };
  return { nivel: null, puntaje: 0 };
};

// Mejor nodo para cada requerimiento sin ubicar: Map requerimientoId → { nodo, nivel, puntaje }.
// Cada nodo se sugiere a lo más a un requerimiento (gana el de mayor nivel y puntaje), para que
// "Usar todas" no choque con la regla "un nodo, un requerimiento".
//  - nodos: [{ ruta, nombre, tipo }] cargados. estado: { mapeo, carpetaPersonas, carpetaRecursos }.
export const sugerenciasPorRequerimiento = ({ requerimientos, nodos, estado }) => {
  const libres = nodos.filter((n) => estadoNodo(n, estado).clase === "libre")
    .map((n) => ({ ...n, normalizado: normalizarNombreMapeo(n.nombre, { archivo: n.tipo === "archivo" }) }));
  const pares = [];
  requerimientos.filter((r) => !(estado.mapeo?.[r.id] || []).length).forEach((r) => {
    libres.forEach((n) => {
      const c = confianzaPorNombre(n.normalizado, r);
      if (c.nivel) pares.push({ requerimientoId: r.id, nodo: n, ...c });
    });
  });
  pares.sort((a, b) => NIVELES[b.nivel] - NIVELES[a.nivel] || b.puntaje - a.puntaje ||
    a.nodo.ruta.localeCompare(b.nodo.ruta, "es", { numeric: true }));
  const salida = new Map();
  const usados = new Set();
  pares.forEach((p) => {
    if (salida.has(p.requerimientoId) || usados.has(p.nodo.ruta)) return;
    salida.set(p.requerimientoId, { nodo: { ruta: p.nodo.ruta, nombre: p.nodo.nombre, tipo: p.nodo.tipo }, nivel: p.nivel, puntaje: p.puntaje });
    usados.add(p.nodo.ruta);
  });
  return salida;
};
