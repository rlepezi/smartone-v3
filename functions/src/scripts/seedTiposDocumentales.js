/**
 * Script de seed: crea los Tipos Documentales del piloto de Revisiones IA
 * (CEDULA_CL y LICENCIA_CL) en estado "piloto". El ID de cada documento es
 * su código, así que es idempotente: si ya existe, no lo toca (conserva sus
 * métricas y ajustes).
 *
 * La versión debe coincidir con VERSION_ESQUEMA de config/iaExtraccion.js.
 *
 * Uso:
 *   USE_EMULATOR=true node src/scripts/seedTiposDocumentales.js
 *       (emulador local)
 *   node src/scripts/seedTiposDocumentales.js
 *       (proyecto real, requiere functions/serviceAccountKey.json)
 */

const path = require("path");

if (process.env.USE_EMULATOR === "true") {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
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
const {VERSION_ESQUEMA} = require("../../config/iaExtraccion");

const TIPOS = [
  {
    codigo: "CEDULA_CL",
    nombre: "Cédula de identidad",
    reglas: ["CI-01", "CI-02", "CI-03", "CI-04", "CI-05", "CI-06"],
  },
  {
    codigo: "LICENCIA_CL",
    nombre: "Licencia de conducir",
    reglas: ["LC-01", "LC-02", "LC-03", "LC-04", "LC-05", "LC-06"],
  },
];

/**
 * Crea los tipos que falten.
 * @return {Promise<void>}
 */
async function main() {
  const db = admin.firestore();
  for (const tipo of TIPOS) {
    const ref = db.collection("tiposDocumentales").doc(tipo.codigo);
    // eslint-disable-next-line no-await-in-loop
    const doc = await ref.get();
    if (doc.exists) {
      console.log(`= ${tipo.codigo} ya existe; sin cambios.`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await ref.set({
      codigo: tipo.codigo,
      nombre: tipo.nombre,
      estadoIA: "piloto",
      version: VERSION_ESQUEMA,
      reglas: tipo.reglas,
      modeloPreferido: null,
      umbralLegibilidad: 0.8,
      metricas: {
        procesados: 0, aceptadosSinCambio: 0, corregidos: 0, costoTotalUsd: 0,
      },
      estado: "activo",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`+ ${tipo.codigo} creado.`);
  }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Error en el seed de tipos documentales:", error);
      process.exit(1);
    });
