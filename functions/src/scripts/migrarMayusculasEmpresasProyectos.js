/**
 * Migración: deja en MAYÚSCULAS los nombres ya guardados de Empresas
 * (razonSocial y nombreFantasia) y de Proyectos (nombre). Desde este cambio
 * el backend los guarda siempre así; esta migración alinea los existentes.
 *
 * Solo toca esos tres campos (y updatedAt). No cambia IDs, RUT ni códigos de
 * Proyecto. Idempotente: un nombre que ya está en mayúsculas no se reescribe.
 * Los nombres que la Bitácora guardó dentro de eventos pasados no se tocan
 * (son registro histórico).
 *
 * Uso (por defecto es dry-run: solo muestra lo que haría):
 *   USE_EMULATOR=true node src/scripts/migrarMayusculasEmpresasProyectos.js
 *   node src/scripts/migrarMayusculasEmpresasProyectos.js       (dry-run)
 *   node src/scripts/migrarMayusculasEmpresasProyectos.js --ejecutar
 *   Sin USE_EMULATOR opera sobre el proyecto real (requiere
 *   functions/serviceAccountKey.json).
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

const {FieldValue} = require("firebase-admin/firestore");
const {aMayusculas} = require("../utils/mayusculas");

const db = admin.firestore();
const EJECUTAR = process.argv.includes("--ejecutar");
const LOTE = 400;

// Colección → campos de nombre que van en mayúsculas.
const CAMPOS = {
  empresas: ["razonSocial", "nombreFantasia"],
  proyectos: ["nombre"],
};

/**
 * Cambios de una colección: documentos con algún nombre que no está en
 * mayúsculas.
 * @param {string} coleccion Nombre de la colección.
 * @param {string[]} campos Campos a revisar.
 * @return {Promise<Array<{ref: Object, cambios: Object, antes: Object}>>}
 *     Documentos a actualizar.
 */
async function detectar(coleccion, campos) {
  const snap = await db.collection(coleccion).get();
  const resultado = [];
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const cambios = {};
    const antes = {};
    campos.forEach((campo) => {
      const valor = data[campo];
      if (typeof valor !== "string") return;
      const nuevo = aMayusculas(valor);
      if (nuevo !== valor) {
        cambios[campo] = nuevo;
        antes[campo] = valor;
      }
    });
    if (Object.keys(cambios).length) {
      resultado.push({ref: doc.ref, cambios, antes});
    }
  });
  return resultado;
}

/**
 * Ejecuta la migración (o la simula en dry-run).
 * @return {Promise<void>}
 */
async function main() {
  console.log(`\n=== Nombres de Empresas y Proyectos en MAYÚSCULAS — ${
    EJECUTAR ? "EJECUCIÓN REAL" : "DRY-RUN (no escribe nada)"} ===`);
  console.log(`Destino: ${process.env.USE_EMULATOR === "true" ?
    "emulador local" : "PROYECTO REAL"}`);

  const pendientes = [];
  for (const [coleccion, campos] of Object.entries(CAMPOS)) {
    // eslint-disable-next-line no-await-in-loop
    const cambios = await detectar(coleccion, campos);
    console.log(`\n${coleccion}: ${cambios.length} documento(s) a actualizar`);
    cambios.forEach((c) => {
      Object.keys(c.cambios).forEach((campo) => {
        console.log(`  - ${c.ref.id}.${campo}: "${c.antes[campo]}" → ` +
            `"${c.cambios[campo]}"`);
      });
    });
    pendientes.push(...cambios);
  }

  if (EJECUTAR) {
    for (let i = 0; i < pendientes.length; i += LOTE) {
      const batch = db.batch();
      pendientes.slice(i, i + LOTE).forEach((c) => batch.update(c.ref, {
        ...c.cambios,
        updatedAt: FieldValue.serverTimestamp(),
      }));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
    console.log(`\nActualizados: ${pendientes.length} documento(s).`);
  } else {
    console.log("\nDRY-RUN: no se escribió nada. Use --ejecutar.");
  }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ La migración falló:", err);
      process.exit(1);
    });
