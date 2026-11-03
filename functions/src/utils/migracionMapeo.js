const {entradasMapeo} = require("./carpetaExpediente");
const {nodosDe, NIVEL_POR_TIPO_ENTIDAD} = require("./plantillaEstructura");
const {calzaNombre} = require("./resolverNodo");
const {aliasLimpios, aliasCubierto} = require("./aliasNodo");

// Migración al Mapeo documental sobre la plantilla. Función PURA: arma el
// plan; el script (scripts/migrarMapeoPlantilla.js) lee, muestra el reporte
// y, con --apply, escribe.
//  1. requerimientoId 1:1 de los nodos de la plantilla → vínculo (P3).
//  2. carpetasEmpresa.mapeo: el último segmento de cada ruta se compara con
//     los nodos de la plantilla del Mandante (alias, nivel compatible) → un
//     solo nodo: vínculo; ninguno o varios: reporte.
//  3. carpetaPersonas / carpetaRecursos → qué sección de entidades los
//     reconoce; si ninguna, se sugiere el alias (reporte).
//  4. patronesRequerimiento → alias de los nodos vinculados a su
//     requerimiento (por ámbito y objetivo); estructura → sección de
//     entidades. Sin nodo: reporte.

const AUTOR_MIGRACION = "migracion-mapeo-plantilla";
// Nombre sin el prefijo de orden ("02. ", "03 - ", "2) ").
const sinPrefijo = (t) => String(t || "")
    .replace(/^\s*\d+(?:[.,]\d+)*\s*[.\-_)–]*\s*/, "").trim();
const ultimo = (ruta) => String(ruta || "").split("/").filter(Boolean).pop() ||
  "";
const ETIQUETA_NIVEL = {empresa: "Empresa", persona: "Persona",
  maquinaria: "Maquinaria"};

/**
 * Plan de migración.
 * @param {Object} d Datos ya leídos.
 * @param {Map<string, Object>} d.plantillas mandanteId → plantilla activa.
 * @param {Object[]} d.carpetas carpetasEmpresa activas.
 * @param {Object[]} d.patrones patronesRequerimiento activos sin migrar.
 * @param {Map<string, Object>} d.requerimientos id → requerimiento.
 * @param {Object[]} d.vinculos mapeoRequerimientos existentes.
 * @return {Object} {vinculos, alias, carpetasMigradas, patronesMigrados,
 *     reporte}.
 */
function planMigracionMapeo({plantillas, carpetas, patrones, requerimientos,
  vinculos}) {
  const nodosPorMandante = new Map([...plantillas.entries()].map(([m, p]) =>
    [m, nodosDe(p).filter((n) => n.estado === "activo")]));
  const existentes = new Set((vinculos || []).filter((v) =>
    v.estado === "activo").map((v) => `${v.mandanteId}|${v.nodoClave}|` +
    v.requerimientoId));
  const nuevos = new Map();
  const reporte = {vinculosCreados: 0, aliasAgregados: 0, conflictos: [],
    sinPlantilla: [], estructura: [], patronesSinNodo: [],
    requerimientosSinMapear: []};

  const nivelReq = (req) => NIVEL_POR_TIPO_ENTIDAD[req?.tipoEntidad] ||
    "empresa";
  const vincular = (mandanteId, nodo, req, origen) => {
    const k = `${mandanteId}|${nodo.nodoClave}|${req.id}`;
    if (existentes.has(k) || nuevos.has(k)) return;
    nuevos.set(k, {mandanteId, plantillaId: plantillas.get(mandanteId).id,
      nodoClave: nodo.nodoClave, requerimientoId: req.id, nivel: nodo.nivel,
      origen});
  };

  // 1) requerimientoId 1:1 de la plantilla.
  plantillas.forEach((p, mandanteId) => {
    const conReq = [];
    (p.secciones || []).forEach((s) => {
      if (s.requerimientoId) conReq.push([s.clave, s.requerimientoId]);
      [...(s.archivosSeccion || []), ...(s.documentos || [])].forEach((d) => {
        if (d.requerimientoId) {
          conReq.push([`${s.clave}/${d.clave}`, d.requerimientoId]);
        }
      });
    });
    conReq.forEach(([nodoClave, reqId]) => {
      const nodo = nodosPorMandante.get(mandanteId).find((n) =>
        n.nodoClave === nodoClave);
      const req = requerimientos.get(reqId);
      if (!nodo || !req) return;
      if (nivelReq(req) !== nodo.nivel) {
        reporte.conflictos.push({mandanteId, origen: "plantilla 1:1",
          requerimiento: req.nombreCorto || req.nombre,
          detalle: `«${nodo.ruta}» es de nivel ${ETIQUETA_NIVEL[nodo.nivel]}`});
        return;
      }
      vincular(mandanteId, nodo, req, "plantilla");
    });
  });

  // 2) Mapeo de las carpetas de empresa.
  const carpetasMigradas = [];
  carpetas.forEach((c) => {
    const nodos = nodosPorMandante.get(c.mandanteId);
    if (!nodos) {
      reporte.sinPlantilla.push(c.ruta);
      return;
    }
    let tocada = false;
    Object.entries(c.mapeo || {}).forEach(([reqId, valor]) => {
      const req = requerimientos.get(reqId);
      if (!req) return;
      entradasMapeo(valor).forEach((e) => {
        tocada = true;
        const nombre = ultimo(e.ruta);
        const compatibles = nodos.filter((n) => n.nivel === nivelReq(req));
        let calzan = e.tipo === "archivo" ?
          compatibles.filter((n) => n.tipoNodo !== "seccion" &&
            calzaNombre(nombre, n, {archivo: true})) :
          compatibles.filter((n) => n.tipoNodo === "seccion" &&
            calzaNombre(nombre, n));
        if (!calzan.length && e.tipo === "archivo") {
          // Un archivo sin nodo propio: su carpeta contra las secciones.
          const carpeta = ultimo(e.ruta.split("/").slice(0, -1).join("/"));
          calzan = compatibles.filter((n) => n.tipoNodo === "seccion" &&
            calzaNombre(carpeta, n));
        }
        if (calzan.length === 1) {
          vincular(c.mandanteId, calzan[0], req, "carpeta");
          return;
        }
        reporte.conflictos.push({mandanteId: c.mandanteId, origen: c.ruta,
          requerimiento: req.nombreCorto || req.nombre, detalle: calzan.length ?
            `«${e.ruta}» calza con ${calzan.length} nodos: ` +
              calzan.map((n) => n.ruta).join(", ") :
            `«${e.ruta}» no calza con ningún nodo de nivel ` +
              ETIQUETA_NIVEL[nivelReq(req)]});
      });
    });
    // 3) Carpeta del personal y de maquinarias.
    [["carpetaPersonas", "persona"], ["carpetaRecursos", "maquinaria"]]
        .forEach(([campo, entidad]) => {
          if (!c[campo]) return;
          tocada = true;
          const nombre = ultimo(c[campo]);
          const secciones = nodos.filter((n) => n.tipoNodo === "seccion" &&
            n.seccionTipo === "entidades" && n.entidad === entidad);
          const calzan = secciones.filter((n) => calzaNombre(nombre, n));
          reporte.estructura.push({mandanteId: c.mandanteId, carpeta: c.ruta,
            campo, nombre, reconocidaPor: calzan.map((n) => n.ruta),
            sugerencia: !calzan.length && secciones.length === 1 ?
              `Agregar «${sinPrefijo(nombre)}» como alias de ` +
                `«${secciones[0].ruta}»` :
              null});
        });
    if (tocada) carpetasMigradas.push(c.id);
  });

  // 4) Patrones → alias de los nodos vinculados a su requerimiento.
  const vinculosDe = (mandanteId, reqId) => [
    ...(vinculos || []).filter((v) => v.estado === "activo"),
    ...nuevos.values()].filter((v) => v.mandanteId === mandanteId &&
    v.requerimientoId === reqId).map((v) => v.nodoClave);
  const alias = new Map(); // mandanteId → Map(nodoClave → alias[])
  const sumarAlias = (mandanteId, nodo, valor) => {
    if (aliasCubierto(nodo, valor)) return false;
    if (!alias.has(mandanteId)) alias.set(mandanteId, new Map());
    const porNodo = alias.get(mandanteId);
    const lista = porNodo.get(nodo.nodoClave) || [];
    const nueva = aliasLimpios([...lista, valor]);
    if (nueva.length === lista.length) return false;
    porNodo.set(nodo.nodoClave, nueva);
    reporte.aliasAgregados += 1;
    return true;
  };
  const patronesMigrados = [];
  (patrones || []).forEach((p) => {
    const nodos = nodosPorMandante.get(p.mandanteId) || [];
    let destino = [];
    if (p.ambito === "estructura") {
      const entidad = p.objetivo === "carpetaRecursos" ? "maquinaria" :
        "persona";
      destino = nodos.filter((n) => n.tipoNodo === "seccion" &&
        n.seccionTipo === "entidades" && n.entidad === entidad);
    } else {
      const claves = vinculosDe(p.mandanteId, p.requerimientoId);
      destino = nodos.filter((n) => claves.includes(n.nodoClave) &&
        (p.objetivo === "archivo" ? n.tipoNodo !== "seccion" :
          n.tipoNodo === "seccion"));
    }
    if (!destino.length) {
      reporte.patronesSinNodo.push({mandanteId: p.mandanteId,
        patron: p.patron, ambito: p.ambito, objetivo: p.objetivo,
        requerimientoId: p.requerimientoId || null});
      return;
    }
    destino.forEach((n) => sumarAlias(p.mandanteId, n, p.patron));
    patronesMigrados.push(p.id);
  });

  // 5) Requerimientos activos que quedan sin mapear.
  const conVinculo = new Set([...(vinculos || []).filter((v) =>
    v.estado === "activo"), ...nuevos.values()].map((v) =>
    `${v.mandanteId}|${v.requerimientoId}`));
  requerimientos.forEach((r) => {
    if (r.estado === "activo" && plantillas.has(r.mandanteId) &&
      !conVinculo.has(`${r.mandanteId}|${r.id}`)) {
      reporte.requerimientosSinMapear.push({mandanteId: r.mandanteId,
        requerimiento: r.nombreCorto || r.nombre,
        nivel: ETIQUETA_NIVEL[nivelReq(r)]});
    }
  });
  reporte.vinculosCreados = nuevos.size;

  return {vinculos: [...nuevos.values()], alias, carpetasMigradas,
    patronesMigrados, reporte};
}

/**
 * Secciones de una plantilla con alias agregados (sin repetir).
 * @param {Object} plantilla Plantilla.
 * @param {Map<string, string[]>} porNodo nodoClave → alias nuevos.
 * @return {Array<Object>} Secciones.
 */
function seccionesConAlias(plantilla, porNodo) {
  const sumar = (n, clave) => (porNodo.has(clave) ? {...n,
    alias: aliasLimpios([...(n.alias || []), ...porNodo.get(clave)])} : n);
  return (plantilla.secciones || []).map((s) => ({...sumar(s, s.clave),
    archivosSeccion: (s.archivosSeccion || []).map((d) =>
      sumar(d, `${s.clave}/${d.clave}`)),
    documentos: (s.documentos || []).map((d) =>
      sumar(d, `${s.clave}/${d.clave}`))}));
}

module.exports = {AUTOR_MIGRACION, planMigracionMapeo, seccionesConAlias};
