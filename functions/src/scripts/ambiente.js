/**
 * Ambiente de los scripts de functions/src/scripts. Ningún script elige el
 * proyecto por su cuenta: lo decide la variable SMARTONE_ENV.
 *
 *   SMARTONE_ENV=qa   node src/scripts/x.js   → smartone-v3-qa
 *   SMARTONE_ENV=prod node src/scripts/x.js   → smartone-v3 (si el script
 *       escribe, exige además --confirmar-prod)
 *   USE_EMULATOR=true node src/scripts/x.js   → emuladores locales
 *       (proyecto smartone-v3-qa)
 *
 * Cada ambiente usa su propia cuenta de servicio:
 *   functions/serviceAccountKey.qa.json y functions/serviceAccountKey.prod.json
 * (ignoradas por git). Si el project_id de la clave no es el del ambiente, el
 * script se detiene antes de leer o escribir nada.
 */
const path = require("path");
const fs = require("fs");

const PROYECTOS = {qa: "smartone-v3-qa", prod: "smartone-v3"};

/**
 * Detiene el script con un mensaje.
 * @param {string} mensaje Motivo.
 */
function detener(mensaje) {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
}

/**
 * Credencial de un ambiente, verificada contra su proyecto.
 * @param {string} ambiente "qa" | "prod".
 * @return {Object} Cuenta de servicio.
 */
function cuentaDeServicio(ambiente) {
  const archivo = path.join(__dirname,
      `../../serviceAccountKey.${ambiente}.json`);
  if (!fs.existsSync(archivo)) {
    detener(`Falta ${path.basename(archivo)} en functions/ (cuenta de ` +
        `servicio del proyecto ${PROYECTOS[ambiente]}).`);
  }
  const cuenta = JSON.parse(fs.readFileSync(archivo, "utf8"));
  if (cuenta.project_id !== PROYECTOS[ambiente]) {
    detener(`${path.basename(archivo)} es del proyecto ` +
        `${cuenta.project_id}, no de ${PROYECTOS[ambiente]}.`);
  }
  return cuenta;
}

/**
 * Inicia firebase-admin (app por defecto) en el ambiente pedido.
 * @param {Object} opciones Opciones.
 * @param {boolean} opciones.escribe true si el script escribe datos: en
 *     producción exige --confirmar-prod.
 * @return {{admin: Object, ambiente: string, projectId: string}} Datos.
 */
function iniciarAmbiente({escribe}) {
  // eslint-disable-next-line global-require
  const admin = require("firebase-admin");
  if (process.env.USE_EMULATOR === "true") {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    if (!admin.apps.length) admin.initializeApp({projectId: PROYECTOS.qa});
    console.log(`Ambiente: EMULADORES (${PROYECTOS.qa})`);
    return {admin, ambiente: "emuladores", projectId: PROYECTOS.qa};
  }
  const ambiente = process.env.SMARTONE_ENV;
  if (!PROYECTOS[ambiente]) {
    detener("Indique el ambiente: SMARTONE_ENV=qa (o prod), o " +
        "USE_EMULATOR=true para los emuladores.");
  }
  if (ambiente === "prod" && escribe &&
      !process.argv.includes("--confirmar-prod")) {
    detener("Este script escribe datos. Para hacerlo en PRODUCCIÓN agregue " +
        "--confirmar-prod.");
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(cuentaDeServicio(ambiente)),
    });
  }
  console.log(`Ambiente: ${ambiente.toUpperCase()} (${PROYECTOS[ambiente]})` +
      `${escribe ? "" : " · solo lectura"}`);
  return {admin, ambiente, projectId: PROYECTOS[ambiente]};
}

/**
 * Abre una app con nombre propio en un ambiente (para scripts que leen de uno
 * y escriben en otro, como la copia de configuración).
 * @param {string} ambiente "qa" | "prod".
 * @return {Object} App de firebase-admin.
 */
function abrirApp(ambiente) {
  // eslint-disable-next-line global-require
  const admin = require("firebase-admin");
  const existente = admin.apps.find((a) => a?.name === ambiente);
  if (existente) return existente;
  return admin.initializeApp({
    credential: admin.credential.cert(cuentaDeServicio(ambiente)),
  }, ambiente);
}

module.exports = {PROYECTOS, iniciarAmbiente, abrirApp, detener};
