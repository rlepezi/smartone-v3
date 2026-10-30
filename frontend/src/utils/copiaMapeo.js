import { normalizarNombreMapeo, similitudConjuntos, similitudTokens } from "./normalizacionMapeo.js";
import { entradasPlanas, estadoNodo } from "./mapeoArbol.js";

// Copia de mapeo entre Carpetas de empresa de estructura parecida. Funciones puras: la lectura del
// disco se inyecta (listar), y solo se leen las carpetas por las que pasan las rutas a copiar.

export const UMBRAL_OFRECER = 0.6; // similitud para ofrecer la copia automáticamente
export const UMBRAL_PARECIDA = 0.8; // similitud de un segmento para "Parecida"

// Nombres normalizados del primer nivel de una carpeta (carpetas y archivos sueltos).
export const nombresNivel1 = (listado) => [
  ...(listado?.carpetas || []).map((c) => normalizarNombreMapeo(c.nombre, { archivo: false })),
  ...(listado?.archivos || []).map((a) => normalizarNombreMapeo(a.nombre, { archivo: true })),
];

// Similitud entre dos carpetas: Dice sobre coincidencias exactas de su primer nivel normalizado.
export const similitudCarpetas = (nivel1A, nivel1B) => similitudConjuntos(nivel1A, nivel1B);

// Busca en el destino la ruta equivalente a `ruta`, segmento a segmento (exacta o, en algún segmento,
// parecida ≥ 0,8). listar(rutaDestino) → { carpetas, archivos } | null (con caché de quien llama).
// Devuelve { destino: ruta | null, resultado: "exacta" | "parecida" | "no_encontrada" }.
export const buscarEquivalente = async (ruta, tipo, listar) => {
  const segmentos = String(ruta || "").split("/").filter(Boolean);
  let actual = "";
  let parecida = false;
  for (let i = 0; i < segmentos.length; i++) {
    const ultimo = i === segmentos.length - 1;
    const esArchivo = ultimo && tipo === "archivo";
    const listado = await listar(actual);
    const opciones = (esArchivo ? listado?.archivos : listado?.carpetas) || [];
    const buscado = normalizarNombreMapeo(segmentos[i], { archivo: esArchivo });
    const conNorma = opciones.map((o) => ({ o, n: normalizarNombreMapeo(o.nombre, { archivo: esArchivo }) }));
    let elegido = conNorma.find((x) => x.n === buscado);
    if (!elegido) {
      elegido = conNorma.map((x) => ({ ...x, s: similitudTokens(buscado, x.n) }))
        .filter((x) => x.s >= UMBRAL_PARECIDA).sort((a, b) => b.s - a.s)[0];
      if (!elegido) return { destino: null, resultado: "no_encontrada" };
      parecida = true;
    }
    actual = actual ? `${actual}/${elegido.o.nombre}` : elegido.o.nombre;
  }
  return { destino: actual, resultado: parecida ? "parecida" : "exacta" };
};

const ESPECIALES = [["carpetaPersonas", "Carpeta del personal"], ["carpetaRecursos", "Carpeta de maquinarias"]];

// Propuesta de copia desde `origen` hacia `destino` (Carpetas de empresa públicas). Filas:
// { clave, campo?, requerimientoId?, tipo, origenRuta, destinoRuta, resultado, conflicto, seleccionada }
//  - resultado: "exacta" (preseleccionada) | "parecida" (a revisar) | "no_encontrada" | "no_aplica"
//    (requerimiento no asignable en el destino) | "conflicto" (el destino ya lo tiene asignado: nunca
//    se sobrescribe; `conflicto` dice con qué).
//  - asignables: ids de requerimientos asignables en el destino. nombreDe(id): para los mensajes.
export const proponerCopia = async ({ origen, destino, asignables, listar, nombreDe = (id) => id }) => {
  const estado = { mapeo: destino.mapeo || {}, carpetaPersonas: destino.carpetaPersonas, carpetaRecursos: destino.carpetaRecursos };
  const filas = [];
  for (const [campo, etiqueta] of ESPECIALES) {
    if (!origen[campo]) continue;
    const r = await buscarEquivalente(origen[campo], "carpeta", listar);
    const conflicto = destino[campo] ? `${etiqueta} ya definida («${destino[campo]}»)` : null;
    filas.push({ clave: campo, campo, etiqueta, tipo: "carpeta", origenRuta: origen[campo], destinoRuta: r.destino,
      resultado: conflicto && r.destino ? "conflicto" : r.resultado, conflicto });
  }
  for (const e of entradasPlanas(origen.mapeo)) {
    const base = { clave: `${e.requerimientoId}|${e.ruta}`, requerimientoId: e.requerimientoId, tipo: e.tipo, origenRuta: e.ruta };
    if (!asignables.includes(e.requerimientoId)) {
      filas.push({ ...base, destinoRuta: null, resultado: "no_aplica", conflicto: null });
      continue;
    }
    const r = await buscarEquivalente(e.ruta, e.tipo, listar);
    let conflicto = null;
    if (r.destino) {
      const ya = (destino.mapeo?.[e.requerimientoId] || []).some((x) => x.ruta === r.destino);
      const est = estadoNodo({ ruta: r.destino, tipo: e.tipo }, estado);
      if (ya) conflicto = "Ya asignado a este requerimiento";
      else if (est.clase === "asignado" || est.clase === "incluido") conflicto = `Ya asignado a ${nombreDe(est.requerimientoId)}`;
      else if (est.clase !== "libre") conflicto = "Es la carpeta del personal o de maquinarias (o está dentro)";
    }
    filas.push({ ...base, destinoRuta: r.destino, resultado: conflicto ? "conflicto" : r.resultado, conflicto });
  }
  return filas.map((f) => ({ ...f, seleccionada: f.resultado === "exacta" }));
};

// Cambios (PATCH con soloAgregar) para las filas seleccionadas: agrega a lo que el destino ya tiene,
// con origen "sugerencia"; nunca reemplaza.
export const cambiosDeCopia = (filas, destino) => {
  const cambios = { soloAgregar: true, mapeo: {} };
  filas.filter((f) => f.seleccionada && f.destinoRuta && ["exacta", "parecida"].includes(f.resultado)).forEach((f) => {
    if (f.campo) { cambios[f.campo] = f.destinoRuta; return; }
    const previas = cambios.mapeo[f.requerimientoId] ||
      (destino.mapeo?.[f.requerimientoId] || []).map((x) => ({ ruta: x.ruta, tipo: x.tipo }));
    if (!previas.some((x) => x.ruta === f.destinoRuta)) previas.push({ ruta: f.destinoRuta, tipo: f.tipo, origen: "sugerencia" });
    cambios.mapeo[f.requerimientoId] = previas;
  });
  return cambios;
};
