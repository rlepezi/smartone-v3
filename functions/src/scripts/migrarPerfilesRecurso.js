/**
 * Migración única: backfill de Perfil de Recurso (entidad 18, ver
 * decisions.md) — reemplaza los catálogos fijos ROLES_ASIGNACION
 * (asignacionService.js) y TIPOS_RECURSO (recursoService.js) por
 * registros configurables en la nueva colección `perfilesRecurso`.
 *
 * IMPORTANTE — esto es un backfill, NO una recuperación de datos
 * históricos reales: crea catálogo nuevo a partir de los valores que ya
 * estaban hardcodeados en el código, más los valores "personalizados" ya
 * en uso en Recursos existentes. No modifica ni reescribe ningún
 * documento de `asignaciones` ni `recursos` — sus campos `rol`/`tipo`
 * existentes quedan intactos con su valor histórico.
 *
 * Conflicto de diseño resuelto antes de escribir esta migración (ver
 * decisions.md, Entidad 18): Recurso NO tiene mandanteId propio (RN-021,
 * catálogo global compartido entre Mandantes) — una misma Empresa (y sus
 * Recursos) puede aportar a Proyectos de Mandantes distintos. Por eso
 * NO es posible backfillear los tipos "personalizados en uso" solo para
 * "el Mandante que los usa" (no existe tal Mandante único). En su lugar,
 * esta migración backfillea el MISMO catálogo completo (los 4 roles +
 * los 7 tipos fijos + TODOS los tipos personalizados detectados en
 * Recursos existentes, sin importar quién los usa) en TODOS los
 * Mandantes existentes — garantiza cero regresiones: cualquier Recurso u
 * Asignación con un valor histórico sigue validando en asignacionService
 * contra CUALQUIER Mandante al que se lo asigne de ahora en más. Un
 * mandante_admin puede luego desactivar o renombrar, vía el nuevo CRUD
 * "Perfiles de Recurso", los que no le apliquen — eso no afecta datos ya
 * creados (solo condiciona asignaciones NUEVAS).
 *
 * Uso (mismo patrón que seedDatosPrueba.js):
 *   USE_EMULATOR=true node src/scripts/migrarPerfilesRecurso.js
 *       (DRY RUN contra el emulador local — requiere
 *       `firebase emulators:start --only functions,firestore,auth`
 *       corriendo en otra terminal)
 *   USE_EMULATOR=true node src/scripts/migrarPerfilesRecurso.js --ejecutar
 *       (aplica los cambios reales, contra el emulador local)
 *   node src/scripts/migrarPerfilesRecurso.js              (DRY RUN contra
 *       el proyecto real, requiere functions/serviceaccountkey.json)
 *   node src/scripts/migrarPerfilesRecurso.js --ejecutar    (aplica los
 *       cambios reales contra el proyecto real)
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
        path.join(__dirname, "../../serviceaccountkey.json"),
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

const db = admin.firestore();
const {FieldValue} = require("firebase-admin/firestore");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");

// Roles ya hardcodeados en ROLES_ASIGNACION (asignacionService.js) antes
// de esta migración. Se preserva el valor EXACTO (minúsculas) ya
// almacenado en documentos `asignaciones.rol` existentes — no se
// recasea a un nombre "lindo" porque eso rompería la validación de
// asignacionService contra Asignaciones/Recursos ya creados.
const ROLES_PERSONA_FIJOS = [
  "trabajador", "operador", "prevencionista",
];

// Tipos ya hardcodeados en TIPOS_RECURSO (recursoService.js) antes de
// esta migración. Se preservan los 7 originales completos (no solo los
// 4 mencionados en la especificación de forma abreviada) para no quitar
// clasificaciones que ya estaban disponibles.
const TIPOS_RECURSO_FIJOS = [
  "retroexcavadora", "camion_pluma", "camioneta", "grua",
  "dron", "equipo_especial", "otro",
];

/**
 * Detecta los tipos "personalizados" en uso en la colección `recursos`
 * (valores de `tipo` que no están en TIPOS_RECURSO_FIJOS). Recurso no
 * tiene mandanteId — la detección es GLOBAL, no por Mandante (ver nota
 * de conflicto arriba).
 * @return {Promise<string[]>} Lista de tipos personalizados distintos.
 */
async function detectarTiposPersonalizados() {
  const snapshot = await db.collection("recursos").get();
  const usados = new Set();
  snapshot.forEach((doc) => {
    const tipo = doc.data().tipo;
    if (tipo && !TIPOS_RECURSO_FIJOS.includes(tipo)) {
      usados.add(tipo);
    }
  });
  return [...usados].sort();
}

/**
 * Arma el plan de creación: para cada Mandante existente, un registro
 * `perfilesRecurso` activo por cada (tipo, nombre) del catálogo
 * combinado, salvo que ya exista uno con ese mandanteId/tipo/
 * nombre (idempotencia — permite re-correr el script sin duplicar).
 * @return {Promise<{plan: Object[], tiposPersonalizados: string[],
 *     mandantesCount: number}>} El plan de cambios y datos de contexto
 *     para el resumen.
 */
async function detectarCambios() {
  const [mandantesSnap, perfilesExistentesSnap, tiposPersonalizados] =
      await Promise.all([
        db.collection("mandantes").get(),
        db.collection("perfilesRecurso").get(),
        detectarTiposPersonalizados(),
      ]);

  // NOTA: el campo se llamaba `nombre` cuando se escribió esta migración;
  // se renombró a `funcion` en una migración posterior
  // (migrarRenombrarFuncionPerfilRecurso.js) — este chequeo de
  // idempotencia lee `funcion` para seguir detectando correctamente los
  // perfiles ya existentes si este script se vuelve a correr.
  const existentesSet = new Set();
  perfilesExistentesSnap.forEach((doc) => {
    const d = doc.data();
    existentesSet.add(`${d.mandanteId}::${d.tipo}::${d.funcion}`);
  });

  const catalogoRecurso = [...TIPOS_RECURSO_FIJOS, ...tiposPersonalizados];

  const plan = [];
  mandantesSnap.forEach((doc) => {
    const mandanteId = doc.id;
    const mandanteNombre = getMandanteDisplayName(doc.data()) || mandanteId;

    ROLES_PERSONA_FIJOS.forEach((nombre) => {
      const clave = `${mandanteId}::persona::${nombre}`;
      if (existentesSet.has(clave)) return;
      plan.push({mandanteId, mandanteNombre, tipo: "persona", nombre});
    });

    catalogoRecurso.forEach((nombre) => {
      const clave = `${mandanteId}::recurso::${nombre}`;
      if (existentesSet.has(clave)) return;
      plan.push({mandanteId, mandanteNombre, tipo: "recurso", nombre});
    });
  });

  return {plan, tiposPersonalizados, mandantesCount: mandantesSnap.size};
}

/**
 * Imprime el resumen del plan de migración antes de ejecutar.
 * @param {Object[]} plan Plan detectado por detectarCambios().
 * @param {string[]} tiposPersonalizados Tipos personalizados detectados.
 * @param {number} mandantesCount Cantidad total de Mandantes.
 * @return {void}
 */
function imprimirDryRun(plan, tiposPersonalizados, mandantesCount) {
  console.log(
      `\n=== DRY RUN — ${mandantesCount} Mandante(s) en el sistema ===`,
  );
  const listaPersonalizados = tiposPersonalizados.length ?
      tiposPersonalizados.join(", ") : "(ninguno)";
  console.log(
      `Tipos personalizados detectados en Recursos existentes ` +
      `(GLOBAL, no por Mandante): ${listaPersonalizados}`,
  );

  const porMandante = plan.reduce((acc, c) => {
    if (!acc[c.mandanteId]) {
      acc[c.mandanteId] = {mandanteNombre: c.mandanteNombre, items: []};
    }
    acc[c.mandanteId].items.push(c);
    return acc;
  }, {});

  Object.entries(porMandante).forEach(([mandanteId, info]) => {
    const roles = info.items.filter((i) => i.tipo === "persona");
    const tipos = info.items.filter((i) => i.tipo === "recurso");
    console.log(`\n  ${info.mandanteNombre} (${mandanteId})`);
    if (roles.length) {
      const nombresRoles = roles.map((r) => r.nombre).join(", ");
      console.log(`    + Roles de Persona: ${nombresRoles}`);
    }
    if (tipos.length) {
      const nombresTipos = tipos.map((t) => t.nombre).join(", ");
      console.log(`    + Clasificaciones de Maquinaria: ${nombresTipos}`);
    }
  });

  console.log(`\nTotal a crear: ${plan.length} Perfil(es) de Recurso.`);
}

/**
 * Aplica el plan detectado en batches de Firestore (máx. 400
 * operaciones por batch, margen bajo el límite de 500).
 * @param {Object[]} plan Plan a aplicar.
 * @return {Promise<void>}
 */
async function ejecutarCambios(plan) {
  console.log("\n=== Ejecutando escritura real ===");
  const TAMANO_BATCH = 400;

  for (let i = 0; i < plan.length; i += TAMANO_BATCH) {
    const lote = plan.slice(i, i + TAMANO_BATCH);
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    lote.forEach((c) => {
      const ref = db.collection("perfilesRecurso").doc();
      batch.set(ref, {
        mandanteId: c.mandanteId,
        tipo: c.tipo,
        funcion: c.nombre,
        estado: "activo",
        createdAt: now,
        updatedAt: now,
      });
    });

    await batch.commit();
    const numeroLote = Math.floor(i / TAMANO_BATCH) + 1;
    console.log(
        `  Lote ${numeroLote}: ${lote.length} Perfil(es) creado(s).`,
    );
  }

  console.log(
      `Listo: ${plan.length} Perfil(es) de Recurso creado(s) en total.`,
  );
}

/**
 * Punto de entrada. Sin --ejecutar, solo hace dry run.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");

  console.log(
      "=== SmartOne v3 — Migración: backfill de Perfil de Recurso ===",
  );
  const modo = ejecutar ? "EJECUCIÓN REAL" : "DRY RUN (solo lectura)";
  console.log(`Modo: ${modo}`);

  const {plan, tiposPersonalizados, mandantesCount} = await detectarCambios();
  imprimirDryRun(plan, tiposPersonalizados, mandantesCount);

  if (plan.length === 0) {
    console.log("\nNada que migrar.");
    return;
  }

  if (!ejecutar) {
    console.log(
        "\nDRY RUN únicamente — no se escribió nada en Firestore. " +
        "Ejecuta con --ejecutar para aplicar estos cambios.",
    );
    return;
  }

  await ejecutarCambios(plan);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal en la migración:", err);
      process.exit(1);
    });
