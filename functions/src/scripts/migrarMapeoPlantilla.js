/**
 * Migración al Mapeo documental sobre la plantilla de estructura.
 *
 * Sin --apply es un DIAGNÓSTICO de solo lectura: muestra qué se haría.
 * Con --apply (o --aplicar):
 *   1. el requerimientoId 1:1 de los nodos de la plantilla y el mapeo de las
 *      Carpetas de empresa (último segmento de cada ruta contra los alias de
 *      los nodos, con nivel compatible) crean vínculos en
 *      mapeoRequerimientos;
 *   2. los patrones aprendidos se agregan como alias de los nodos vinculados
 *      a su requerimiento (los de estructura, a la sección de entidades): la
 *      plantilla sube de versión y se guarda la copia;
 *   3. carpetaPersonas / carpetaRecursos: solo se informa qué sección de
 *      entidades los reconoce (o qué alias agregar).
 * Nada se borra: patrones y carpetas migrados quedan con migrado: true. Todo
 * queda en la Bitácora. Idempotente: no repite vínculos ni alias.
 *
 * Uso (desde functions/):
 *   SMARTONE_ENV=prod node src/scripts/migrarMapeoPlantilla.js
 *   SMARTONE_ENV=prod node src/scripts/migrarMapeoPlantilla.js --mandante=ID
 *   SMARTONE_ENV=prod node src/scripts/migrarMapeoPlantilla.js \
 *       --informe=migracion-mapeo.md
 *   SMARTONE_ENV=prod node src/scripts/migrarMapeoPlantilla.js \
 *       --apply --confirmar-prod
 */
const fs = require("fs");
const {iniciarAmbiente} = require("./ambiente");

const aplicar = process.argv.includes("--apply") ||
  process.argv.includes("--aplicar");
const {admin, projectId} = iniciarAmbiente({escribe: aplicar});
const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");

const bitacoraLogger = require("../utils/bitacoraLogger");
const {
  AUTOR_MIGRACION, planMigracionMapeo, seccionesConAlias,
} = require("../utils/migracionMapeo");

const ACTOR = {uid: AUTOR_MIGRACION, rol: "superadmin",
  email: "Migración mapeo documental"};
const AUTOR = {uid: AUTOR_MIGRACION, nombre: "Migración mapeo documental"};
const LOTE = 400;
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "")
    .split("=").slice(1).join("=") || null;
const idVinculo = (v) => `${v.mandanteId}|` +
  `${v.nodoClave.replace(/\//g, "~")}|${v.requerimientoId}`;

/**
 * Documentos de una colección (opcionalmente de un Mandante).
 * @param {string} nombre Colección.
 * @param {?string} mandanteId Mandante.
 * @return {Promise<Object[]>} Documentos.
 */
async function leer(nombre, mandanteId) {
  let q = db.collection(nombre);
  if (mandanteId) q = q.where("mandanteId", "==", mandanteId);
  const snap = await q.get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}));
}

/**
 * Escribe operaciones en lotes de LOTE.
 * @param {Array<function(FirebaseFirestore.WriteBatch): void>} ops Ops.
 * @return {Promise<void>}
 */
async function escribir(ops) {
  for (let i = 0; i < ops.length; i += LOTE) {
    const lote = db.batch();
    ops.slice(i, i + LOTE).forEach((op) => op(lote));
    await lote.commit();
  }
}

(async () => {
  const mandanteId = arg("mandante");
  const alcance = mandanteId ? `Mandante ${mandanteId}` : "todos los Mandantes";
  const modo = aplicar ? "APLICAR" : "diagnóstico (solo lectura)";
  console.log(`Proyecto: ${projectId} · ${alcance} · ${modo}\n`);
  const [plantillas, carpetas, patrones, requerimientos, vinculos] =
    await Promise.all([
      leer("plantillasEstructura", mandanteId),
      leer("carpetasEmpresa", mandanteId),
      leer("patronesRequerimiento", mandanteId),
      leer("requerimientos", mandanteId),
      leer("mapeoRequerimientos", mandanteId),
    ]);
  const activas = new Map(plantillas.filter((p) => p.estado === "activa")
      .map((p) => [p.mandanteId, p]));
  const plan = planMigracionMapeo({
    plantillas: activas,
    carpetas: carpetas.filter((c) => c.estado === "activa"),
    patrones: patrones.filter((p) => p.estado === "activo" && !p.migrado),
    requerimientos: new Map(requerimientos.map((r) => [r.id, r])),
    vinculos,
  });
  const r = plan.reporte;
  const lineas = [
    "# Migración al Mapeo documental (plantilla)",
    "",
    `- Plantillas activas: ${activas.size}`,
    `- Vínculos a crear: ${plan.vinculos.length}`,
    `- Alias a agregar: ${r.aliasAgregados}`,
    `- Conflictos: ${r.conflictos.length}`,
    `- Patrones migrados: ${plan.patronesMigrados.length} ` +
      `(sin nodo: ${r.patronesSinNodo.length})`,
    "- Requerimientos que quedan sin mapear: " +
      r.requerimientosSinMapear.length,
    "",
    "## Vínculos a crear",
    ...plan.vinculos.map((v) => `- ${v.nodoClave} ← ${v.requerimientoId} ` +
      `(${v.nivel}, desde ${v.origen})`),
    "",
    "## Alias a agregar",
    ...[...plan.alias.entries()].flatMap(([m, porNodo]) =>
      [...porNodo.entries()].map(([nodo, lista]) =>
        `- ${m} · ${nodo}: ${lista.join(", ")}`)),
    "",
    "## Conflictos (sin match o con más de un match)",
    ...r.conflictos.map((c) => `- ${c.origen} · ${c.requerimiento}: ` +
      c.detalle),
    "",
    "## Carpeta del personal / maquinarias",
    ...r.estructura.map((e) => `- ${e.carpeta} · ${e.campo} «${e.nombre}»: ` +
      (e.reconocidaPor.length ? `reconocida por ${e.reconocidaPor.join(", ")}` :
        e.sugerencia || "ninguna sección de entidades la reconoce")),
    "",
    "## Patrones sin nodo",
    ...r.patronesSinNodo.map((p) => `- «${p.patron}» (${p.ambito}/` +
      `${p.objetivo})`),
    "",
    "## Requerimientos sin mapear",
    ...r.requerimientosSinMapear.map((x) => `- ${x.requerimiento} ` +
      `(${x.nivel})`),
    "",
    "## Carpetas de Mandantes sin plantilla",
    ...r.sinPlantilla.map((x) => `- ${x}`),
  ];
  const informe = lineas.join("\n");
  console.log(informe);
  const archivo = arg("informe");
  if (archivo) {
    fs.writeFileSync(archivo, informe);
    console.log(`\nInforme guardado en ${archivo}`);
  }
  if (!aplicar) {
    console.log("\nDiagnóstico: no se escribió nada. Use --apply para " +
      "aplicar.");
    process.exit(0);
  }

  const ahora = FieldValue.serverTimestamp();
  const ops = [];
  plan.vinculos.forEach((v) => {
    const ref = db.collection("mapeoRequerimientos").doc(idVinculo(v));
    ops.push((b) => b.set(ref, {mandanteId: v.mandanteId,
      plantillaId: v.plantillaId, nodoClave: v.nodoClave,
      requerimientoId: v.requerimientoId, nivel: v.nivel, estado: "activo",
      motivoInactivo: null, origen: `migracion_${v.origen}`,
      createdBy: AUTOR, createdAt: ahora, updatedBy: AUTOR,
      updatedAt: ahora}, {merge: true}));
  });
  plan.patronesMigrados.forEach((id) => {
    ops.push((b) => b.update(db.collection("patronesRequerimiento").doc(id),
        {migrado: true, migradoAt: ahora}));
  });
  plan.carpetasMigradas.forEach((id) => {
    ops.push((b) => b.update(db.collection("carpetasEmpresa").doc(id),
        {migrado: true, mapeoMigradoAt: ahora}));
  });
  await escribir(ops);

  // Alias: una versión nueva por plantilla, con su copia.
  for (const [m, porNodo] of plan.alias.entries()) {
    const p = activas.get(m);
    const version = (p.version || 1) + 1;
    const secciones = seccionesConAlias(p, porNodo);
    const ref = db.collection("plantillasEstructura").doc(p.id);
    const versiones = ref.collection("versiones");
    const previa = await versiones.doc(String(p.version || 1)).get();
    if (!previa.exists) {
      await versiones.doc(String(p.version || 1)).set({
        version: p.version || 1, nombre: p.nombre,
        profundidadSubcontratos: p.profundidadSubcontratos ?? 1,
        secciones: p.secciones, guardadaPor: p.updatedBy || null,
        guardadaAt: ahora});
    }
    await ref.update({secciones, version, updatedBy: AUTOR, updatedAt: ahora});
    await versiones.doc(String(version)).set({version, nombre: p.nombre,
      profundidadSubcontratos: p.profundidadSubcontratos ?? 1, secciones,
      guardadaPor: AUTOR, guardadaAt: ahora});
  }

  const mandantes = new Set([...plan.vinculos.map((v) => v.mandanteId),
    ...plan.alias.keys()]);
  for (const m of mandantes) {
    await bitacoraLogger.registrarEvento({
      mandanteId: m, entidad: "plantillasEstructura",
      entidadId: activas.get(m)?.id || m, accion: "migracion_mapeo_plantilla",
      actor: ACTOR, detalle: {
        vinculos: plan.vinculos.filter((v) => v.mandanteId === m).length,
        alias: [...(plan.alias.get(m)?.values() || [])].flat().length,
        conflictos: r.conflictos.filter((c) => c.mandanteId === m).length,
        version: plan.alias.has(m) ? (activas.get(m).version || 1) + 1 :
          activas.get(m)?.version || null,
      },
    });
  }
  console.log(`\nAplicado: ${ops.length} escrituras y ` +
    `${plan.alias.size} plantillas con alias nuevos.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
