/**
 * SOLO LECTURA: impacto en producción de las Partes B y C (en pausa) sobre
 * la elegibilidad IA de los requerimientos de los Expedientes abiertos.
 * Compara, para cada (Expediente, requerimiento):
 *   - ANTES (commit 8b22304): solo por el tipo documental del requerimiento
 *     (algún documento de la plantilla con ese tipo, en cualquier sección);
 *   - DESPLEGADO (Parte B): mapeo del Expediente → vínculo de la plantilla
 *     → tipo, por contexto de entidad, con tipo_no_coincide.
 * Reporta también cuántas plantillas tienen vínculos con requerimientos
 * (Parte C) y cuántos Expedientes tienen carpetas asignadas a mano por
 * requerimiento, y qué requerimientos HABILITADOS para IA dejaron de ser
 * elegibles (guardar la configuración de Revisiones IA daría 400). No
 * escribe nada.
 *
 * Uso:
 *   node src/scripts/impactoElegibilidadBC.js
 *   node src/scripts/impactoElegibilidadBC.js --csv   (solo los cambios)
 *   USE_EMULATOR=true ... para leer del emulador local.
 */

const path = require("path");
const {
  ESTADOS_IA_ELEGIBLES, seccionHabilitada, documentoHabilitado,
} = require("../utils/alcanceValidacion");
const {
  documentosEnContexto, requerimientoDeDocumento,
} = require("../utils/ubicacionRequerimiento");

const tipoValido = (tipo) => (!tipo ? "sin_tipo" :
  tipo.estado !== "activo" || !ESTADOS_IA_ELEGIBLES.includes(tipo.estadoIA) ?
    "tipo_inactivo" : tipo.soloReglas ? "solo_reglas" : null);

/**
 * Elegibilidad ANTES de B (8b22304): solo por tipo, en toda la plantilla.
 * @param {Object} e {requerimiento, tipo, plantilla, libre}.
 * @return {{elegible: boolean, motivo: ?string}} Resultado.
 */
function elegibilidadAnterior({requerimiento, tipo, plantilla, libre}) {
  const no = (motivo) => ({elegible: false, motivo});
  if (!requerimiento?.tipoDocumentalId || !tipo) return no("sin_tipo");
  const m = tipoValido(tipo);
  if (m) return no(m);
  if (libre) return {elegible: true, motivo: null};
  const docs = [];
  ((plantilla && plantilla.secciones) || []).forEach((s) => {
    [...(s.archivosSeccion || []), ...(s.documentos || [])].forEach((d) => {
      if (d.tipoDocumentalCodigo === tipo.codigo) {
        docs.push({d, habilitado: seccionHabilitada(s) &&
          documentoHabilitado(d)});
      }
    });
  });
  if (!docs.length) return no("no_en_plantilla");
  const habilitados = docs.filter((x) => x.habilitado);
  if (!habilitados.length) return no("documento_deshabilitado");
  const elegido = habilitados.find((x) => !x.d.datosSensibles) ||
    habilitados[0];
  if (elegido.d.datosSensibles) return no("dato_sensible");
  return {elegible: true, motivo: null};
}

/**
 * Elegibilidad DESPLEGADA (Parte B): mapeo → vínculo → tipo, sin caída y
 * por contexto de entidad; con vínculo, el documento debe ser del tipo del
 * requerimiento (tipo_no_coincide).
 * @param {Object} e {requerimiento, tipo, tipoEntidad, plantilla, mapeo,
 *     libre}.
 * @return {{elegible: boolean, motivo: ?string, nivel: ?string}} Resultado.
 */
function elegibilidadDesplegada({requerimiento, tipo, tipoEntidad, plantilla,
  mapeo, libre}) {
  const id = requerimiento?.id || null;
  const secciones = (!libre && plantilla && plantilla.secciones) || [];
  let nivel = null;
  let documentos = [];
  const elemento = (s, d) => ({documentoClave: d?.clave || null,
    tipoDocumentalCodigo: d?.tipoDocumentalCodigo || null,
    habilitado: seccionHabilitada(s) && (!d || documentoHabilitado(d)),
    sensible: Boolean(d?.datosSensibles)});
  if (tipoEntidad === "empresa" && id && mapeo?.requerimientos?.[id]) {
    nivel = "mapeo";
  } else {
    const vinculados = [];
    secciones.forEach((s) => {
      const docs = documentosEnContexto(s, tipoEntidad);
      if (!docs) return;
      if (!docs.length) {
        if (id && s.requerimientoId === id) vinculados.push(elemento(s, null));
        return;
      }
      docs.forEach((d) => {
        if (id && requerimientoDeDocumento(s, d) === id) {
          vinculados.push(elemento(s, d));
        }
      });
    });
    if (vinculados.length) {
      nivel = "plantilla";
      documentos = vinculados;
    } else if (tipo?.codigo) {
      secciones.forEach((s) => (documentosEnContexto(s, tipoEntidad) || [])
          .forEach((d) => {
            if (d.tipoDocumentalCodigo === tipo.codigo) {
              documentos.push(elemento(s, d));
            }
          }));
      if (documentos.length) nivel = "tipo";
    }
  }
  const r = (elegible, motivo) => ({elegible, motivo, nivel});
  if (!requerimiento?.tipoDocumentalId || !tipo) return r(false, "sin_tipo");
  const m = tipoValido(tipo);
  if (m) return r(false, m);
  if (libre || nivel === "mapeo") return r(true, null);
  if (nivel === "plantilla") {
    for (const d of documentos) {
      if (!d.habilitado) return r(false, "documento_deshabilitado");
      if (d.sensible) return r(false, "dato_sensible");
      if (!d.documentoClave) return r(false, "seccion_sin_documentos");
      if (d.tipoDocumentalCodigo !== tipo.codigo) {
        return r(false, "tipo_no_coincide");
      }
    }
    return r(true, null);
  }
  if (nivel === "tipo") {
    const habilitados = documentos.filter((d) => d.habilitado);
    if (!habilitados.length) return r(false, "documento_deshabilitado");
    if (!habilitados.some((d) => !d.sensible)) return r(false, "dato_sensible");
    return r(true, null);
  }
  return r(false, "no_en_plantilla");
}

/**
 * Vínculos de una plantilla con requerimientos (secciones y documentos).
 * @param {?Object} plantilla Plantilla.
 * @return {number} Cantidad de vínculos.
 */
function contarVinculos(plantilla) {
  let n = 0;
  ((plantilla && plantilla.secciones) || []).forEach((s) => {
    if (s.requerimientoId) n++;
    [...(s.archivosSeccion || []), ...(s.documentos || [])].forEach((d) => {
      if (d.requerimientoId) n++;
    });
  });
  return n;
}

const celda = (v) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
};

/**
 * Lee y compara.
 * @return {Promise<void>}
 */
async function main() {
  if (process.env.USE_EMULATOR === "true") {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  }
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    if (process.env.USE_EMULATOR === "true") {
      admin.initializeApp({projectId: "smartone-v3"});
    } else {
      admin.initializeApp({credential: admin.credential.cert(require(
          path.join(__dirname, "../../serviceAccountKey.json")))});
    }
  }
  const db = admin.firestore();
  const CSV = process.argv.includes("--csv");
  const leer = async (q) => (await q.get()).docs
      .map((d) => ({id: d.id, ...d.data()}));
  const [plantillas, tipos, requerimientos, expedientes, instancias,
    configs] = await Promise.all([
    leer(db.collection("plantillasEstructura").where("estado", "==",
        "activa")),
    leer(db.collection("tiposDocumentales")),
    leer(db.collection("requerimientos")),
    leer(db.collection("expedientes")),
    leer(db.collection("expedienteRequerimientos").where("estado", "==",
        "activo")),
    leer(db.collection("configRevisionExpediente")),
  ]);
  const plantillaDe = new Map();
  plantillas.forEach((p) => {
    if (!plantillaDe.has(p.mandanteId)) plantillaDe.set(p.mandanteId, p);
  });
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
  const reqPorId = new Map(requerimientos.map((r) => [r.id, r]));
  const configDe = new Map(configs.map((c) => [c.id, c]));
  const abiertos = expedientes.filter((e) => e.estado !== "cerrado");
  const porExpediente = new Map();
  instancias.forEach((i) => {
    if (!porExpediente.has(i.expedienteId)) {
      porExpediente.set(i.expedienteId, new Map());
    }
    porExpediente.get(i.expedienteId).set(i.requerimientoId, i.tipoEntidad);
  });

  const cambios = [];
  let pares = 0;
  abiertos.forEach((e) => {
    const config = configDe.get(e.id) || null;
    const libre = config?.modoEstructura === "libre";
    const mapeo = config?.repositorioDocumental?.mapeo || null;
    const plantilla = plantillaDe.get(e.mandanteId) || null;
    const habilitados = new Set(config?.requerimientosIA || []);
    (porExpediente.get(e.id) || new Map()).forEach((tipoEntidad, reqId) => {
      const requerimiento = reqPorId.get(reqId);
      if (!requerimiento) return;
      pares++;
      const tipo = requerimiento.tipoDocumentalId ?
        tipoPorId.get(requerimiento.tipoDocumentalId) || null : null;
      const antes = elegibilidadAnterior({requerimiento, tipo, plantilla,
        libre});
      const ahora = elegibilidadDesplegada({requerimiento, tipo,
        tipoEntidad: tipoEntidad || requerimiento.tipoEntidad || "persona",
        plantilla, mapeo, libre});
      if (antes.elegible === ahora.elegible && antes.motivo === ahora.motivo) {
        return;
      }
      cambios.push({expedienteId: e.id, mandanteId: e.mandanteId,
        requerimientoId: reqId,
        requerimiento: requerimiento.nombreCorto || requerimiento.nombre,
        tipoEntidad, antes: antes.elegible ? "elegible" : antes.motivo,
        ahora: ahora.elegible ? "elegible" : ahora.motivo, nivel: ahora.nivel,
        habilitadoIA: habilitados.has(reqId)});
    });
  });

  if (CSV) {
    const cols = ["expedienteId", "mandanteId", "requerimientoId",
      "requerimiento", "tipoEntidad", "antes", "ahora", "nivel",
      "habilitadoIA"];
    console.log(cols.join(","));
    cambios.forEach((c) => console.log(cols.map((k) => celda(c[k])).join(",")));
    return;
  }
  const conVinculos = plantillas.filter((p) => contarVinculos(p) > 0);
  const conMapeo = abiertos.filter((e) => Object.keys(configDe.get(e.id)
      ?.repositorioDocumental?.mapeo?.requerimientos || {}).length > 0);
  console.log(`Plantillas activas: ${plantillas.length}; con vínculos a ` +
    `requerimientos (Parte C): ${conVinculos.length}` +
    (conVinculos.length ? ` (${conVinculos.map((p) => `${p.nombre || p.id}` +
      `: ${contarVinculos(p)}`).join(", ")})` : ""));
  console.log(`Expedientes abiertos: ${abiertos.length}; con carpeta ` +
    `asignada a mano por requerimiento: ${conMapeo.length}`);
  console.log(`Pares expediente × requerimiento revisados: ${pares}`);
  const perdieron = cambios.filter((c) => c.antes === "elegible");
  const ganaron = cambios.filter((c) => c.ahora === "elegible");
  const otroMotivo = cambios.length - perdieron.length - ganaron.length;
  console.log(`Cambios: ${cambios.length} (dejaron de ser elegibles: ` +
    `${perdieron.length}; pasaron a elegibles: ${ganaron.length}; otro ` +
    `motivo de no elegibilidad: ${otroMotivo})`);
  const porMotivo = {};
  perdieron.forEach((c) => {
    porMotivo[c.ahora] = (porMotivo[c.ahora] || 0) + 1;
  });
  Object.entries(porMotivo).forEach(([m, n]) =>
    console.log(`  - ahora ${m}: ${n}`));
  const rotos = perdieron.filter((c) => c.habilitadoIA);
  console.log(`HABILITADOS para IA que ya no son elegibles (guardar la ` +
    `configuración de Revisiones IA daría 400): ${rotos.length}`);
  rotos.forEach((c) => console.log(`  ${c.requerimiento} ` +
    `[${c.requerimientoId}] en expediente ${c.expedienteId}: ${c.ahora}`));
}

module.exports = {elegibilidadAnterior, elegibilidadDesplegada,
  contarVinculos};

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
