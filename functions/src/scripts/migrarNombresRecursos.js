/**
 * Migración única: limpia el nombre de Recursos (Maquinarias) cuyo seed
 * generó el string con la Empresa embebida, ej.
 * "grua 1 (Servicios Industriales Maule Ltda.)" en vez de solo "grua 1".
 *
 * Verificado antes de escribir esta migración (diagnóstico de solo
 * lectura contra el proyecto real): en TODOS los casos detectados,
 * `empresaId` ya apunta correctamente a la misma Empresa que aparece en
 * el paréntesis del nombre — no hace falta resolver empresaId por
 * nombre, solo recortar el string.
 *
 * Detecta el patrón `nombre (Empresa X)` en `recursos.nombre` y:
 *   1. Deja `nombre` = solo la parte antes del paréntesis.
 *   2. Verifica que `empresaId` ya apunte a la Empresa del paréntesis —
 *      si NO coincide (o falta empresaId), NO toca ese documento y lo
 *      reporta aparte para revisión manual (evita corregir a ciegas un
 *      caso donde el dato real podría estar mal por otro motivo).
 *
 * Uso:
 *   node src/scripts/migrarNombresRecursos.js              (DRY RUN —
 *       solo imprime qué se modificaría, no escribe nada)
 *   node src/scripts/migrarNombresRecursos.js --ejecutar    (aplica los
 *       cambios reales)
 */

const path = require("path");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = require(
      path.join(__dirname, "../../serviceAccountKey.json"),
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");

const PATRON_SUFIJO_EMPRESA = /^(.*?)\s*\(([^)]+)\)\s*$/;

/**
 * Detecta los Recursos con el patrón "nombre (Empresa)" y separa los que
 * son seguros de corregir automáticamente (empresaId ya coincide) de los
 * que necesitan revisión manual (no coincide o falta empresaId).
 * @return {Promise<{cambios: Object[], revisionManual: Object[]}>}
 */
async function detectarCambios() {
  const [recursosSnap, empresasSnap] = await Promise.all([
    db.collection("recursos").get(),
    db.collection("empresas").get(),
  ]);

  const empresaNombrePorId = {};
  empresasSnap.forEach((doc) => {
    empresaNombrePorId[doc.id] = doc.data().razonSocial;
  });

  const cambios = [];
  const revisionManual = [];

  recursosSnap.forEach((doc) => {
    const data = doc.data();
    const match = data.nombre?.match(PATRON_SUFIJO_EMPRESA);
    if (!match) return;

    const nombreLimpio = match[1].trim();
    const empresaEnNombre = match[2].trim();
    const empresaActualNombre = empresaNombrePorId[data.empresaId] || null;

    if (empresaActualNombre === empresaEnNombre) {
      cambios.push({
        id: doc.id,
        nombreActual: data.nombre,
        nombreLimpio,
        empresaId: data.empresaId,
        empresaNombre: empresaActualNombre,
      });
    } else {
      revisionManual.push({
        id: doc.id,
        nombreActual: data.nombre,
        empresaEnNombre,
        empresaIdActual: data.empresaId || "(sin empresaId)",
        empresaActualNombre: empresaActualNombre || "(no encontrada)",
      });
    }
  });

  return {cambios, revisionManual};
}

/**
 * Imprime el resultado del diagnóstico.
 * @param {Object[]} cambios Cambios seguros a aplicar.
 * @param {Object[]} revisionManual Casos que necesitan revisión manual.
 * @return {void}
 */
function imprimirDryRun(cambios, revisionManual) {
  console.log(`\n=== DRY RUN — ${cambios.length} Recurso(s) a corregir ===`);
  for (const c of cambios) {
    console.log(
        `  [${c.id}] "${c.nombreActual}" → "${c.nombreLimpio}" ` +
        `(empresaId ya correcto: ${c.empresaNombre})`,
    );
  }

  if (revisionManual.length > 0) {
    console.log(
        `\n=== ${revisionManual.length} caso(s) con empresaId que NO ` +
        "coincide con el nombre — NO se tocan automáticamente ===",
    );
    for (const r of revisionManual) {
      console.log(
          `  [${r.id}] "${r.nombreActual}" — empresa en el nombre: ` +
          `"${r.empresaEnNombre}", empresaId actual apunta a: ` +
          `"${r.empresaActualNombre}" (${r.empresaIdActual})`,
      );
    }
  }

  console.log(
      `\nTotal: ${cambios.length} a corregir automáticamente, ` +
      `${revisionManual.length} requieren revisión manual.`,
  );
}

/**
 * Aplica los cambios seguros en un solo batch write (recorta solo el
 * campo `nombre`, no toca `empresaId`).
 * @param {Object[]} cambios Cambios a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(cambios) {
  console.log("\n=== Ejecutando escritura real ===");
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  cambios.forEach((c) => {
    const docRef = db.collection("recursos").doc(c.id);
    batch.update(docRef, {nombre: c.nombreLimpio, updatedAt: now});
  });

  await batch.commit();
  console.log(`Listo: ${cambios.length} Recurso(s) corregido(s).`);
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: limpiar nombre de Recursos " +
      "(quitar sufijo de Empresa embebido) ===",
  );
  console.log(
      `Modo: ${ejecutar ? "EJECUCIÓN REAL" : "DRY RUN (solo lectura)"}`,
  );

  const {cambios, revisionManual} = await detectarCambios();
  imprimirDryRun(cambios, revisionManual);

  if (cambios.length === 0) {
    console.log("\nNada que migrar automáticamente.");
    return;
  }

  if (!ejecutar) {
    console.log(
        "\nDRY RUN únicamente — no se escribió nada en Firestore. " +
        "Corré con --ejecutar para aplicar estos cambios.",
    );
    return;
  }

  await ejecutarCambios(cambios);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal en la migración:", err);
      process.exit(1);
    });
