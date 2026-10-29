/**
 * SOLO LECTURA: lista los Expedientes cuya carpeta no pasa la validación
 * estricta (validarCarpetaEmpresa: la carpeta debe contener la razón
 * social, el nombre de fantasía o el RUT de la Empresa). Revisa:
 *   - el repositorio documental (pestaña Documentación / Acreditación):
 *     carpeta local, o la carpeta de la URL de SharePoint;
 *   - la carpeta de Revisiones IA (carpetaNombre), cuando es distinta de
 *     la del repositorio (p. ej. una carpeta libre).
 * No escribe nada: no corrige, no borra, no marca.
 *
 * Uso:
 *   node src/scripts/listarCarpetasNoValidas.js
 *   node src/scripts/listarCarpetasNoValidas.js --csv   (salida CSV)
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
  validarCarpetaEmpresa, carpetaDeUrlSharePoint,
} = require("../utils/carpetaEmpresa");

const db = admin.firestore();
const CSV = process.argv.includes("--csv");

/**
 * Documentos por ID (de a 300).
 * @param {string} coleccion Colección.
 * @param {string[]} ids IDs.
 * @return {Promise<Map<string, Object>>} ID → datos.
 */
async function leerPorIds(coleccion, ids) {
  const mapa = new Map();
  const unicos = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 300) {
    const refs = unicos.slice(i, i + 300)
        .map((id) => db.collection(coleccion).doc(id));
    // eslint-disable-next-line no-await-in-loop
    (await db.getAll(...refs)).forEach((d) => {
      if (d.exists) mapa.set(d.id, {id: d.id, ...d.data()});
    });
  }
  return mapa;
}

/**
 * Motivo por el que una carpeta no pasa, o null si pasa.
 * @param {?string} nombre Nombre de la carpeta (null: URL sin carpeta).
 * @param {Object} empresa Empresa.
 * @return {?string} Motivo.
 */
function motivo(nombre, empresa) {
  if (!nombre) return "La URL de SharePoint no apunta a una carpeta";
  const r = validarCarpetaEmpresa(nombre, empresa);
  return r.valida ? null : "No contiene: " +
    r.terminosBuscados.map((t) => `«${t}»`).join(", ");
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  const snap = await db.collection("configRevisionExpediente").get();
  const configs = snap.docs.map((d) => ({id: d.id, ...d.data()}));
  const expedientes = await leerPorIds("expedientes",
      configs.map((c) => c.id));
  const empresas = await leerPorIds("empresas",
      [...expedientes.values()].map((e) => e.empresaId));

  const filas = [];
  let revisadas = 0;
  configs.forEach((c) => {
    const exp = expedientes.get(c.id);
    const empresa = exp ? empresas.get(exp.empresaId) : null;
    const agregar = (origen, carpeta, m) => filas.push({
      expedienteId: c.id, estado: exp?.estado || "—",
      empresa: empresa?.razonSocial || "—", origen, carpeta, motivo: m,
    });
    const repo = c.repositorioDocumental || null;
    const nombreRepo = !repo ? null : repo.tipo === "local" ? repo.etiqueta :
      carpetaDeUrlSharePoint(repo.url);
    if (repo) revisadas++;
    if (c.carpetaNombre && c.carpetaNombre !== nombreRepo) revisadas++;
    if (!exp || !empresa) {
      if (repo || c.carpetaNombre) {
        agregar("—", nombreRepo || c.carpetaNombre,
            exp ? "La empresa no existe" : "El expediente no existe");
      }
      return;
    }
    if (repo) {
      const m = motivo(nombreRepo, empresa);
      if (m) {
        agregar(repo.tipo === "local" ? "Documentación (carpeta local)" :
          "Documentación (SharePoint)", nombreRepo || repo.url, m);
      }
    }
    if (c.carpetaNombre && c.carpetaNombre !== nombreRepo) {
      const m = motivo(c.carpetaNombre, empresa);
      if (m) {
        agregar(`Revisiones IA (${c.modoEstructura === "libre" ?
          "carpeta libre" : "carpeta"})`, c.carpetaNombre, m);
      }
    }
  });

  if (CSV) {
    const celda = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
    console.log(["Expediente", "Estado", "Empresa", "Origen", "Carpeta",
      "Motivo"].map(celda).join(";"));
    filas.forEach((f) => console.log([f.expedienteId, f.estado, f.empresa,
      f.origen, f.carpeta, f.motivo].map(celda).join(";")));
    return;
  }
  console.log(`Proyecto: smartone-v3${process.env.USE_EMULATOR === "true" ?
    " (EMULADOR)" : ""} · SOLO LECTURA\n`);
  console.log(`Configuraciones de expediente: ${configs.length} · ` +
    `carpetas revisadas: ${revisadas} · no válidas: ${filas.length}\n`);
  filas.forEach((f) => {
    console.log(`- Expediente ${f.expedienteId} (${f.estado}) · ` +
      `${f.empresa}\n    ${f.origen}: «${f.carpeta}»\n    ${f.motivo}`);
  });
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
