/**
 * SOLO LECTURA: requerimientos que tienen tipoDocumentalId guardado y si ese
 * tipo coincide con el del documento de la plantilla activa vinculado a él
 * (el que ahora rige; el guardado queda solo como respaldo). No escribe
 * nada: no migra, no borra, no marca.
 *
 * Clasificación de cada requerimiento con tipo guardado:
 *   - coincide: el tipo del documento vinculado es el mismo;
 *   - difiere: el documento vinculado es de otro tipo (rige el vinculado);
 *   - vinculo_sin_tipo: está vinculado, pero el documento no tiene tipo
 *     (rige el guardado como respaldo);
 *   - sin_vinculo: no está vinculado en la plantilla (rige el guardado);
 *   - sin_plantilla: su Mandante no tiene plantilla activa (rige el
 *     guardado).
 * Además se marca si el vínculo tiene varios tipos distintos (se usa el
 * primero) y si el tipo guardado ya no existe en el catálogo.
 *
 * Uso:
 *   node src/scripts/compararTiposRequerimientos.js
 *   node src/scripts/compararTiposRequerimientos.js --csv   (salida CSV)
 *   USE_EMULATOR=true ... para leer del emulador local.
 */

const path = require("path");

if (process.env.USE_EMULATOR === "true") {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}

const admin = require("firebase-admin");

if (!admin.apps.length) {
  if (process.env.USE_EMULATOR === "true") {
    admin.initializeApp({projectId: "smartone-v3"});
  } else {
    const serviceAccount = require(
        path.join(__dirname, "../../serviceAccountKey.json"),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

const {
  tipoDeRequerimiento, vinculadosEnPlantilla,
} = require("../utils/ubicacionRequerimiento");

const db = admin.firestore();
const CSV = process.argv.includes("--csv");
const ETIQUETAS = {
  coincide: "Coincide",
  difiere: "Difiere (rige el del documento vinculado)",
  vinculo_sin_tipo: "Vinculado, documento sin tipo (rige el guardado)",
  sin_vinculo: "Sin vínculo en la plantilla (rige el guardado)",
  sin_plantilla: "Mandante sin plantilla activa (rige el guardado)",
};

const celda = (v) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
};

/**
 * Lee y clasifica.
 * @return {Promise<void>}
 */
async function main() {
  const [snapReqs, snapTipos, snapPlantillas] = await Promise.all([
    db.collection("requerimientos").get(),
    db.collection("tiposDocumentales").get(),
    db.collection("plantillasEstructura").where("estado", "==", "activa")
        .get(),
  ]);
  const tipos = snapTipos.docs.map((d) => ({id: d.id, ...d.data()}));
  const tipoPorId = new Map(tipos.map((t) => [t.id, t]));
  const tiposPorCodigo = new Map(tipos.map((t) => [t.codigo, t]));
  const plantillaPorMandante = new Map();
  snapPlantillas.docs.forEach((d) => {
    const p = {id: d.id, ...d.data()};
    if (!plantillaPorMandante.has(p.mandanteId)) {
      plantillaPorMandante.set(p.mandanteId, p);
    }
  });

  const conTipo = snapReqs.docs.map((d) => ({id: d.id, ...d.data()}))
      .filter((r) => r.tipoDocumentalId);
  const filas = conTipo.map((r) => {
    const guardado = tipoPorId.get(r.tipoDocumentalId) || null;
    const plantilla = plantillaPorMandante.get(r.mandanteId) || null;
    const tipoEntidad = r.tipoEntidad || "persona";
    const vinculados = vinculadosEnPlantilla(plantilla, r.id, tipoEntidad);
    const {tipo, origen, codigos} = tipoDeRequerimiento({requerimiento: r,
      plantilla, tipoEntidad, tiposPorCodigo, tipoGuardado: guardado});
    let clase;
    if (!plantilla) clase = "sin_plantilla";
    else if (!vinculados.length) clase = "sin_vinculo";
    else if (origen !== "plantilla") clase = "vinculo_sin_tipo";
    else clase = tipo.id === r.tipoDocumentalId ? "coincide" : "difiere";
    return {
      id: r.id, nombre: r.nombreCorto || r.nombre || "",
      mandanteId: r.mandanteId || "", tipoEntidad, estado: r.estado || "",
      estadoIA: r.estadoIA || "sin_reglas", clase,
      guardado: guardado ? guardado.codigo :
        `(no existe: ${r.tipoDocumentalId})`,
      vinculado: origen === "plantilla" ? tipo.codigo : "",
      codigosVinculo: codigos.join(" | "),
      variosTipos: codigos.length > 1,
      documentos: vinculados.map((v) => v.documento || v.seccion).join(" | "),
    };
  });

  if (CSV) {
    const cols = ["id", "nombre", "mandanteId", "tipoEntidad", "estado",
      "estadoIA", "clase", "guardado", "vinculado", "codigosVinculo",
      "variosTipos", "documentos"];
    console.log(cols.join(","));
    filas.forEach((f) => console.log(cols.map((c) => celda(f[c])).join(",")));
    return;
  }

  console.log(`Requerimientos en total: ${snapReqs.size}`);
  console.log(`Con tipoDocumentalId guardado: ${conTipo.length}`);
  Object.entries(ETIQUETAS).forEach(([clase, etiqueta]) => {
    const n = filas.filter((f) => f.clase === clase).length;
    console.log(`  - ${etiqueta}: ${n}`);
  });
  const varios = filas.filter((f) => f.variosTipos).length;
  const inexistentes = filas.filter((f) => f.guardado.startsWith("(no"))
      .length;
  console.log(`  Vínculo con varios tipos distintos (se usa el primero): ` +
      `${varios}`);
  console.log(`  Tipo guardado que ya no existe en el catálogo: ` +
      `${inexistentes}`);
  const aRevisar = filas.filter((f) => f.clase === "difiere" ||
    f.variosTipos || f.guardado.startsWith("(no"));
  if (aRevisar.length) {
    console.log("\nA revisar:");
    aRevisar.forEach((f) => console.log(`  ${f.nombre} [${f.id}] ` +
      `(${f.tipoEntidad}, ${f.estadoIA}): guardado ${f.guardado}; ` +
      `vinculado ${f.codigosVinculo || "—"}; documentos: ` +
      `${f.documentos || "—"}`));
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
