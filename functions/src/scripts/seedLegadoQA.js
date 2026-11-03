/**
 * SOLO QA o emuladores. Deja expedientes con la configuración ANTERIOR de su
 * carpeta (configRevisionExpediente.repositorioDocumental) que cubren todas
 * las clasificaciones del diagnóstico de la migración E6, para probarla
 * antes que en producción. Datos sintéticos; idempotente.
 *
 * Usa los expedientes de seedDatosPrueba.js:
 *   - migrable:                Transportes del Valle (en ejecución)
 *   - carpeta_en_uso:          Transportes del Valle, otro proyecto
 *   - no_corresponde_empresa:  Logística Puerto Sur
 *   - fuente_distinta:         Ingeniería Cordillera (carpeta en SharePoint)
 *   - sin_fuente:              un expediente de Minera del Sur
 * y crea tres copias (IDs fijos, marcadas seedLegadoQA) para cerrado,
 * ya_migrado y ruta_invalida. El Mandante Constructora Andina queda con una
 * fuente local activa; Minera del Sur, sin fuente.
 *
 * Uso (desde functions/):
 *   SMARTONE_ENV=qa node src/scripts/seedLegadoQA.js
 */
const {iniciarAmbiente, detener} = require("./ambiente");

const {admin, ambiente} = iniciarAmbiente({escribe: true});
if (ambiente === "prod") detener("seedLegadoQA solo corre en QA o emuladores.");
const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");

const fuenteDocumentalService = require("../services/fuenteDocumentalService");
const configRepository =
    require("../repositories/configRevisionExpedienteRepository");

const ACTOR = {uid: "seed-legado-qa", rol: "superadmin",
  email: "Seed legado QA"};
const clave = (s) => String(s || "").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Configuración anterior de un expediente.
 * @param {string} expedienteId Expediente.
 * @param {Object} repositorioDocumental Datos.
 * @return {Promise<void>}
 */
async function legado(expedienteId, repositorioDocumental) {
  await configRepository.guardar(expedienteId, {repositorioDocumental: {
    url: null, ...repositorioDocumental,
    updatedByNombre: "Seed legado QA"}});
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  const [mandantes, empresas, expedientes] = await Promise.all([
    db.collection("mandantes").get(), db.collection("empresas").get(),
    db.collection("expedientes").get()]);
  const mandante = (nombre) => mandantes.docs.find((d) =>
    clave(d.data().nombreFantasia || d.data().razonSocial || d.data().nombre)
        .includes(nombre));
  const andina = mandante("andina");
  const minera = mandante("minera");
  if (!andina || !minera) {
    detener("Faltan los Mandantes del seed (Constructora Andina y Minera " +
        "del Sur): ejecute antes seedDatosPrueba.js.");
  }
  const empresaId = (nombre) => empresas.docs.find((d) =>
    clave(d.data().razonSocial).includes(nombre))?.id;
  const delSeed = expedientes.docs.filter((d) => !d.data().seedLegadoQA);
  const exp = (mandanteId, empresa, filtro = () => true) => delSeed.find((d) =>
    d.data().mandanteId === mandanteId &&
    d.data().empresaId === empresaId(empresa) && filtro(d.data()));

  const migrable = exp(andina.id, "transportes del valle",
      (x) => x.estado !== "cerrado");
  const enUso = migrable && exp(andina.id, "transportes del valle",
      (x) => x.proyectoId !== migrable.data().proyectoId);
  const otraEmpresa = exp(andina.id, "logistica puerto sur");
  const sharepoint = exp(andina.id, "ingenieria cordillera");
  const sinFuente = delSeed.find((d) => d.data().mandanteId === minera.id);
  const faltan = Object.entries({migrable, enUso, otraEmpresa, sharepoint,
    sinFuente}).filter(([, v]) => !v).map(([k]) => k);
  if (faltan.length) detener(`No hay expedientes para: ${faltan.join(", ")}.`);

  // Fuentes: Andina con carpeta local activa; Minera sin fuente activa.
  const fuentes = await db.collection("fuentesDocumentales")
      .where("mandanteId", "in", [andina.id, minera.id]).get();
  if (fuentes.docs.some((d) => d.data().mandanteId === minera.id &&
      d.data().estado === "activa")) {
    detener("Minera del Sur tiene una fuente activa: desactívela para " +
        "cubrir el caso sin_fuente.");
  }
  if (!fuentes.docs.some((d) => d.data().mandanteId === andina.id &&
      d.data().estado === "activa")) {
    await fuenteDocumentalService.guardarLocal(andina.id,
        {etiqueta: "Repositorio Empresas"}, ACTOR);
    console.log("  ✓ Fuente local activa para Constructora Andina");
  }

  // Requerimientos de Empresa del expediente migrable, para su mapeo.
  const instancias = await db.collection("expedienteRequerimientos")
      .where("expedienteId", "==", migrable.id).get();
  const reqEmpresa = [...new Set(instancias.docs.map((d) => d.data())
      .filter((i) => !i.personaId && !i.recursoId)
      .map((i) => i.requerimientoId))];
  const requerimientos = {};
  const rutas = ["01. Certificado de Antecedentes", "02. Poliza de Seguro",
    // Dentro de la carpeta del personal: la migración la omite con motivo.
    "10. Trabajadores/Ana Rojas Demo"];
  reqEmpresa.slice(0, rutas.length).forEach((id, i) => {
    requerimientos[id] = rutas[i];
  });
  const MAPEO = {carpetaPersonas: "10. Trabajadores",
    carpetaRecursos: "14. Vehiculos y Maquinarias", requerimientos};
  const CARPETA = "1. TRANSPORTES DEL VALLE";

  // Copias del expediente migrable (IDs fijos) para los casos sin datos.
  const copia = async (id, cambios) => {
    const datos = {...migrable.data()};
    delete datos.repositorioDocumental;
    await db.collection("expedientes").doc(id).set({...datos, ...cambios,
      seedLegadoQA: true, createdAt: FieldValue.serverTimestamp()});
    return id;
  };
  const cerrado = await copia("qa-legado-cerrado", {estado: "cerrado"});
  const migrado = await copia("qa-legado-migrado", {});
  const invalida = await copia("qa-legado-ruta-invalida", {});

  const casos = [
    [migrable.id, "migrable", {tipo: "local", etiqueta: CARPETA,
      mapeo: MAPEO}],
    [enUso.id, "carpeta_en_uso", {tipo: "local", etiqueta: CARPETA,
      mapeo: {requerimientos: {}}}],
    [otraEmpresa.id, "no_corresponde_empresa", {tipo: "local",
      etiqueta: "Carpeta sin identificar", mapeo: {requerimientos: {}}}],
    [sharepoint.id, "fuente_distinta", {tipo: "sharepoint", etiqueta:
      "2. INGENIERIA CORDILLERA", url: "https://contoso.sharepoint.com/" +
      "sites/qa/Shared%20Documents/2.%20INGENIERIA%20CORDILLERA",
    mapeo: {requerimientos: {}}}],
    [sinFuente.id, "sin_fuente", {tipo: "local",
      etiqueta: "3. SERVICIOS INDUSTRIALES MAULE",
      mapeo: {requerimientos: {}}}],
    [cerrado, "cerrado", {tipo: "local", etiqueta: CARPETA,
      mapeo: {requerimientos: {}}}],
    [migrado, "ya_migrado", {tipo: "local", etiqueta: CARPETA,
      mapeo: {requerimientos: {}}, migradoA: "qa-carpeta-previa"}],
    [invalida, "ruta_invalida", {tipo: "local",
      etiqueta: "Repositorio/Transportes", mapeo: {requerimientos: {}}}],
  ];
  for (const [id, esperado, datos] of casos) {
    // eslint-disable-next-line no-await-in-loop
    await legado(id, datos);
    console.log(`  ✓ ${esperado.padEnd(24)} ${id}`);
  }
  console.log(`\nListo: ${casos.length} expedientes con configuración ` +
      "anterior. Ejecute el diagnóstico: SMARTONE_ENV=qa node " +
      "src/scripts/migrarExpedientesLegado.js");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
