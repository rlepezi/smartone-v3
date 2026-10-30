/**
 * SOLO LECTURA. Lista los registros creados (o, en carpetas, modificados)
 * desde una fecha, para decidir cuáles son datos de prueba de las
 * validaciones e inactivarlos. No escribe ni modifica nada.
 *
 * Colecciones: personas, maquinarias (recursos), empresas, expedientes,
 * carpetas de empresa registradas y sus mapeos, fuentes documentales,
 * evidencias, evaluaciones, revisiones IA, pruebas de reglas y patrones.
 *
 * Uso (desde functions/):
 *   SMARTONE_ENV=prod node src/scripts/listarDatosPrueba.js
 *   SMARTONE_ENV=prod node src/scripts/listarDatosPrueba.js \
 *       --desde=06/10/2026 --hasta=31/10/2026 --csv=datos-prueba.csv
 *
 * La columna "Señal" marca lo que parece de prueba (nombre con prueba, test,
 * demo, seed, ejemplo…, o RUT/patente de ejemplo); es solo una ayuda.
 */
const fs = require("fs");
const {iniciarAmbiente, detener} = require("./ambiente");

const {admin} = iniciarAmbiente({escribe: false});
const db = admin.firestore();

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "")
    .split("=").slice(1).join("=") || null;
const DESDE_POR_DEFECTO = "06/10/2026";

/**
 * dd/mm/aaaa → Date (inicio o fin del día).
 * @param {string} texto Fecha.
 * @param {boolean} fin true para las 23:59:59.
 * @return {Date} Fecha.
 */
function fechaDMA(texto, fin = false) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || ""));
  if (!m) detener(`Fecha no válida: ${texto} (use dd/mm/aaaa).`);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]),
      fin ? 23 : 0, fin ? 59 : 0, fin ? 59 : 0);
}

/**
 * Timestamp, Date o texto → Date (o null).
 * @param {*} v Valor.
 * @return {?Date} Fecha.
 */
function aFecha(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dos = (n) => String(n).padStart(2, "0");
const formato = (d) => (d ? `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/` +
  `${d.getFullYear()} ${dos(d.getHours())}:${dos(d.getMinutes())}` : "—");
const RE_PRUEBA = /prueba|test|demo|seed|ejemplo|dummy|xxx|asdf|borrar/i;
// RUT de ejemplo: 11.111.111, 12.345.678, 99.999.999 y similares.
const RE_RUT_EJEMPLO =
    /^(1{1,2}\.?1{3}\.?1{3}|12\.?345\.?678|9{1,2}\.?9{3}\.?9{3})/;
const nUbicaciones = (mapeo) => Object.values(mapeo || {})
    .reduce((s, v) => s + (Array.isArray(v) ? v.length : v ? 1 : 0), 0);

/**
 * Lee una colección entera como mapa id → datos.
 * @param {string} nombre Colección.
 * @return {Promise<Map<string, Object>>} Mapa.
 */
async function mapa(nombre) {
  const snap = await db.collection(nombre).get();
  return new Map(snap.docs.map((d) => [d.id, d.data()]));
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  const desde = fechaDMA(arg("desde") || DESDE_POR_DEFECTO);
  const hasta = arg("hasta") ? fechaDMA(arg("hasta"), true) : new Date();
  console.log(`Período: ${formato(desde)} → ${formato(hasta)}\n`);

  const [usuarios, empresas, requerimientos, mandantes] = await Promise.all([
    mapa("usuarios"), mapa("empresas"), mapa("requerimientos"),
    mapa("mandantes")]);
  const autor = (uid) => {
    const u = usuarios.get(uid);
    return u ? (u.email || `${u.nombre || ""} ${u.apellido || ""}`.trim()) :
      (uid || "—");
  };
  const empresa = (id) => empresas.get(id)?.razonSocial || id || "";
  const req = (id) => {
    const r = requerimientos.get(id);
    return r ? (r.nombreCorto || r.nombre) : id || "";
  };
  const mandante = (id) => {
    const m = mandantes.get(id);
    return m ? (m.nombreFantasia || m.razonSocial || m.nombre || id) : "";
  };

  // [colección, etiqueta, descripción(doc), ¿cuenta también updatedAt?]
  const FUENTES = [
    ["personas", "Personas", (d) => `${d.nombre || ""} ${d.apellido || ""}` +
      ` · RUT ${d.rut || "—"} · ${empresa(d.empresaId)}`],
    ["recursos", "Maquinarias", (d) => `${d.patente || d.nombre || ""} · ` +
      `${d.tipo || ""} · ${empresa(d.empresaId)}`],
    ["empresas", "Empresas", (d) => `${d.razonSocial || ""} · RUT ` +
      `${d.rut || "—"}`],
    ["expedientes", "Expedientes", (d) => `${d.codigo || ""} · ` +
      `${empresa(d.empresaId)} · ${d.estado || ""}`],
    ["carpetasEmpresa", "Carpetas registradas y mapeos", (d) => `${d.ruta}` +
      ` · ${empresa(d.empresaId)} · ${nUbicaciones(d.mapeo)} ubicaciones · ` +
      `${d.estadoMapeo || "sin_mapear"}${d.expedienteId ? " · con " +
        "expediente" : ""}`, true],
    ["fuentesDocumentales", "Fuentes documentales", (d) => `${d.tipo || ""}` +
      ` · ${d.etiqueta || d.nombre || ""}`],
    ["evidencias", "Evidencias", (d) => `${d.nombreArchivo || d.nombre ||
      d.archivoNombre || ""} · ${d.estado || ""}`],
    ["evaluaciones", "Evaluaciones", (d) => `${req(d.requerimientoId)} · ` +
      `${d.resultado || d.estado || ""} · expediente ${d.expedienteId || ""}`],
    ["revisionesRequerimientoIA", "Revisiones IA", (d) =>
      `${req(d.requerimientoId)} · ${d.estado || ""} · expediente ` +
      `${d.expedienteId || ""}`],
    ["pruebasReglasIA", "Pruebas de reglas IA", (d) => `${d.archivoNombre ||
      ""} · ${req(d.requerimientoId)}`],
    ["patronesRequerimiento", "Patrones aprendidos", (d) => `«${d.patron}» · ` +
      `${req(d.requerimientoId) || d.objetivo} · ${d.vecesConfirmado || 0} ` +
      `veces · ${d.estado || ""}`],
  ];

  const filas = [];
  for (const [coleccion, etiqueta, describir, conUpdated] of FUENTES) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await db.collection(coleccion).get();
    const enRango = (f) => f && f >= desde && f <= hasta;
    const lista = snap.docs.map((doc) => ({doc, d: doc.data()}))
        .filter(({d}) => enRango(aFecha(d.createdAt)) ||
          (conUpdated && enRango(aFecha(d.updatedAt))))
        .sort((a, b) => (aFecha(a.d.createdAt) || 0) -
          (aFecha(b.d.createdAt) || 0));
    console.log(`== ${etiqueta} (${coleccion}): ${lista.length} de ` +
        `${snap.size}`);
    lista.forEach(({doc, d}) => {
      const descripcion = describir(d).replace(/\s+/g, " ").trim();
      const senal = RE_PRUEBA.test(descripcion) ||
        RE_RUT_EJEMPLO.test(String(d.rut || "")) ? "posible prueba" : "";
      const fila = {coleccion, id: doc.id, creado: formato(aFecha(d.createdAt)),
        modificado: formato(aFecha(d.updatedAt)), autor: autor(d.createdBy),
        mandante: mandante(d.mandanteId), estado: d.estado || "",
        descripcion, senal};
      filas.push(fila);
      console.log(`  ${fila.creado}  ${fila.id}  ${descripcion}` +
          `${fila.mandante ? ` · ${fila.mandante}` : ""} · por ${fila.autor}` +
          `${senal ? `  [${senal}]` : ""}`);
    });
  }

  const csv = arg("csv");
  if (csv) {
    const campos = ["coleccion", "id", "creado", "modificado", "autor",
      "mandante", "estado", "descripcion", "senal"];
    const celda = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
    fs.writeFileSync(csv, "﻿" + [campos.join(";"), ...filas.map((f) =>
      campos.map((c) => celda(f[c])).join(";"))].join("\r\n"));
    console.log(`\nCSV: ${csv} (${filas.length} filas)`);
  }
  console.log(`\nTotal: ${filas.length} registros en el período. No se ` +
      "modificó nada.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
