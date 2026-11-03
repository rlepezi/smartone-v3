/**
 * Migración E6: expedientes con la configuración anterior de su carpeta
 * (configRevisionExpediente.repositorioDocumental) pasan a una Carpeta de
 * empresa de la fuente activa del Mandante.
 *
 * Sin --aplicar es un DIAGNÓSTICO de solo lectura: clasifica cada expediente
 * y muestra qué se haría (carpeta, mapeo a trasladar y entradas omitidas).
 * Con --aplicar, por cada expediente migrable:
 *   1. busca o crea la Carpeta de empresa y la vincula (mismas reglas que
 *      "Vincular": validación contra la Empresa, una carpeta por expediente
 *      activo y por proyecto);
 *   2. traslada el mapeo sin sobrescribir (solo agrega; la migración no
 *      enseña patrones);
 *   3. marca la configuración anterior con migradoA / migradoAt (no se
 *      borra). Todo queda en la Bitácora como "Migración E6".
 * Idempotente: los expedientes ya migrados se omiten y la carpeta se busca
 * antes de crearse.
 *
 * Uso (desde functions/):
 *   SMARTONE_ENV=qa node src/scripts/migrarExpedientesLegado.js
 *   SMARTONE_ENV=qa node src/scripts/migrarExpedientesLegado.js --aplicar
 *   SMARTONE_ENV=prod node src/scripts/migrarExpedientesLegado.js \
 *       --informe=diagnostico.md
 *   SMARTONE_ENV=prod node src/scripts/migrarExpedientesLegado.js \
 *       --aplicar --confirmar-prod
 */
const fs = require("fs");
const {iniciarAmbiente} = require("./ambiente");

const aplicar = process.argv.includes("--aplicar");
const {admin, ambiente, projectId} = iniciarAmbiente({escribe: aplicar});
const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");

const carpetaEmpresaService = require("../services/carpetaEmpresaService");
const carpetaEmpresaRepository =
    require("../repositories/carpetaEmpresaRepository");
const configRepository =
    require("../repositories/configRevisionExpedienteRepository");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {fuenteActiva} = require("../utils/fuentesDocumentales");
const {calcularEstadoMapeo, entradasMapeo} =
    require("../utils/carpetaExpediente");
const {
  CLASES, AUTOR_MIGRACION, clasificarLegado, mapeoDesdeLegado,
} = require("../utils/migracionLegado");

const ACTOR = {uid: AUTOR_MIGRACION, rol: "superadmin", email: "Migración E6"};
const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || "")
    .split("=").slice(1).join("=") || null;

/**
 * Lee una colección entera como mapa id → datos.
 * @param {string} nombre Colección.
 * @return {Promise<Map<string, Object>>} Mapa.
 */
async function mapa(nombre) {
  const snap = await db.collection(nombre).get();
  return new Map(snap.docs.map((d) => [d.id, {id: d.id, ...d.data()}]));
}

/**
 * Diagnóstico: un ítem por expediente con configuración anterior.
 * @return {Promise<Object[]>} Ítems.
 */
async function diagnosticar() {
  const [configs, expedientes, empresas, proyectos, mandantes, fuentes,
    carpetas, requerimientos] = await Promise.all(["configRevisionExpediente",
    "expedientes", "empresas", "proyectos", "mandantes", "fuentesDocumentales",
    "carpetasEmpresa", "requerimientos"].map(mapa));
  const nombreReq = (id) => requerimientos.get(id)?.nombreCorto ||
    requerimientos.get(id)?.nombre || id;
  const fuentesPorMandante = new Map();
  fuentes.forEach((f) => fuentesPorMandante.set(f.mandanteId,
      [...(fuentesPorMandante.get(f.mandanteId) || []), f]));
  const tomadas = new Map();
  const items = [];
  const legados = [...configs.values()]
      .filter((c) => ["local", "sharepoint"].includes(
          c.repositorioDocumental?.tipo))
      .sort((a, b) => String(a.expedienteId || a.id)
          .localeCompare(String(b.expedienteId || b.id)));
  for (const config of legados) {
    const expedienteId = config.expedienteId || config.id;
    const expediente = expedientes.get(expedienteId);
    const legado = config.repositorioDocumental;
    const base = {expedienteId, legado,
      mandante: mandantes.get(expediente?.mandanteId)?.nombreFantasia ||
        mandantes.get(expediente?.mandanteId)?.razonSocial || "—",
      empresa: empresas.get(expediente?.empresaId)?.razonSocial || "—",
      proyecto: proyectos.get(expediente?.proyectoId)?.nombre || "—",
      estado: expediente?.estado || "no existe"};
    if (!expediente) {
      items.push({...base, clase: "ruta_invalida",
        detalle: "El expediente no existe."});
      continue;
    }
    const fuente = fuenteActiva(fuentesPorMandante.get(expediente.mandanteId));
    const pre = clasificarLegado({expediente, legado, fuente,
      empresa: empresas.get(expediente.empresaId) || null});
    const carpeta = pre.carpetaId ? carpetas.get(pre.carpetaId) || null : null;
    const c = pre.carpetaId ? clasificarLegado({expediente, legado, fuente,
      empresa: empresas.get(expediente.empresaId) || null, carpeta,
      otroExpediente: carpeta?.expedienteId ?
        expedientes.get(carpeta.expedienteId) || null : null, tomadas}) : pre;
    const plan = c.clase === "migrable" ? mapeoDesdeLegado(legado.mapeo,
        carpeta || {mapeo: {}}, null, nombreReq) : null;
    if (c.clase === "migrable") {
      tomadas.set(c.carpetaId, {expedienteId, empresaId: expediente.empresaId,
        proyectoId: expediente.proyectoId,
        expedienteEstado: expediente.estado});
    }
    items.push({...base, ...c, carpetaExiste: Boolean(carpeta), plan,
      entradasLegado: Object.values(legado.mapeo?.requerimientos || {})
          .reduce((s, v) => s + entradasMapeo(v).length, 0)});
  }
  return items;
}

/**
 * Migra un expediente clasificado como migrable.
 * @param {Object} item Ítem del diagnóstico.
 * @return {Promise<Object>} Resultado.
 */
async function migrar(item) {
  const carpeta = await carpetaEmpresaService.vincular({
    expedienteId: item.expedienteId, ruta: item.ruta, url: item.url}, ACTOR);
  const actual = await carpetaEmpresaRepository.getById(carpeta.id);
  // Fecha concreta: Firestore no admite serverTimestamp dentro de arreglos.
  const plan = mapeoDesdeLegado(item.legado.mapeo, actual, new Date());
  const ids = await carpetaEmpresaService._idsEmpresaDeExpediente(
      item.expedienteId);
  const cambiaEspecial = plan.carpetaPersonas !== actual.carpetaPersonas ||
    plan.carpetaRecursos !== actual.carpetaRecursos;
  if (plan.agregadas.length || cambiaEspecial) {
    await carpetaEmpresaRepository.update(carpeta.id, {
      mapeo: plan.mapeo, carpetaPersonas: plan.carpetaPersonas,
      carpetaRecursos: plan.carpetaRecursos,
      estadoMapeo: calcularEstadoMapeo(plan.mapeo, ids),
      updatedBy: {uid: AUTOR_MIGRACION, nombre: "Migración E6"}});
  }
  await configRepository.guardar(item.expedienteId, {
    repositorioDocumental: {...item.legado, migradoA: carpeta.id,
      migradoAt: FieldValue.serverTimestamp()}});
  await bitacoraLogger.registrarEvento({
    mandanteId: actual.mandanteId, entidad: "expediente",
    entidadId: item.expedienteId, accion: "migrado_carpeta_empresa",
    actor: ACTOR, detalle: {carpetaEmpresaId: carpeta.id, ruta: item.ruta,
      agregadas: plan.agregadas.length, omitidas: plan.omitidas.length,
      carpetaPersonas: plan.carpetaPersonas,
      carpetaRecursos: plan.carpetaRecursos}});
  return {carpetaId: carpeta.id, agregadas: plan.agregadas.length,
    omitidas: plan.omitidas};
}

/**
 * Informe en Markdown.
 * @param {Object[]} items Ítems.
 * @param {Map<string, Object>} resultados expedienteId → resultado.
 * @return {string} Informe.
 */
function informe(items, resultados) {
  const conteo = {};
  items.forEach((i) => {
    conteo[i.clase] = (conteo[i.clase] || 0) + 1;
  });
  const l = [`# Migración E6 — ${aplicar ? "aplicación" : "diagnóstico"} ` +
    `(${projectId})`, "",
  `Expedientes con configuración anterior: **${items.length}**.`, "",
  "| Clasificación | Cantidad |", "|---|---|",
  ...Object.entries(CLASES).filter(([k]) => conteo[k])
      .map(([k, t]) => `| ${t} | ${conteo[k]} |`), "",
  "| Expediente | Mandante | Empresa | Proyecto | Estado | Carpeta " +
    "anterior | Clasificación | Detalle | Mapeo |",
  "|---|---|---|---|---|---|---|---|---|"];
  items.forEach((i) => {
    const r = resultados.get(i.expedienteId);
    const mapeo = i.plan ? `${i.plan.agregadas.length} de ` +
      `${i.entradasLegado} entradas${i.plan.omitidas.length ?
        ` (${i.plan.omitidas.length} omitidas)` : ""}${i.carpetaExiste ?
        " · carpeta ya registrada" : " · carpeta nueva"}` : "—";
    l.push(`| ${i.expedienteId} | ${i.mandante} | ${i.empresa} | ` +
      `${i.proyecto} | ${i.estado} | ${i.legado.etiqueta || i.legado.url ||
        "—"} | ${CLASES[i.clase] || i.clase}${r ? (r.error ? " → ERROR" :
        " → migrado") : ""} | ${(r?.error || i.detalle || "")
          .replace(/\|/g, "/")} | ${mapeo} |`);
  });
  const omitidas = items.flatMap((i) => (i.plan?.omitidas || [])
      .map((o) => ({...o, expedienteId: i.expedienteId})));
  if (omitidas.length) {
    l.push("", "## Entradas del mapeo que no se trasladan", "",
        "| Expediente | Requerimiento | Ruta | Motivo |", "|---|---|---|---|",
        ...omitidas.map((o) => `| ${o.expedienteId} | ${o.requerimiento} | ` +
          `${o.ruta} | ${o.motivo.replace(/\|/g, "/")} |`));
  }
  l.push("", "La existencia de las carpetas locales en el disco no se " +
    "verifica desde el servidor: si una no está, el expediente lo mostrará " +
    "al abrirse y se podrá volver a vincular.");
  return l.join("\n");
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  console.log(aplicar ? "Modo: APLICAR (escribe)" : "Modo: diagnóstico " +
      `(solo lectura) · ${ambiente}`);
  const items = await diagnosticar();
  const resultados = new Map();
  if (aplicar) {
    for (const item of items.filter((i) => i.clase === "migrable")) {
      try {
        // eslint-disable-next-line no-await-in-loop
        resultados.set(item.expedienteId, await migrar(item));
      } catch (e) {
        resultados.set(item.expedienteId, {error: e.message});
      }
    }
  }
  const texto = informe(items, resultados);
  console.log(`\n${texto}\n`);
  const archivo = arg("informe");
  if (archivo) {
    fs.writeFileSync(archivo, texto);
    console.log(`Informe: ${archivo}`);
  }
  const errores = [...resultados.values()].filter((r) => r.error).length;
  console.log(aplicar ? `Migrados: ${resultados.size - errores}; con error: ` +
    `${errores}.` : "No se modificó nada.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
