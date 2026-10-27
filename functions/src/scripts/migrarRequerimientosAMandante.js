/**
 * Migración: los Requerimientos dejan de ser un catálogo global y pasan a
 * pertenecer a un Mandante (`mandanteId`).
 *
 * Escribe DIRECTO en Firestore. No llama servicios: no sincroniza
 * Expedientes, no genera instancias ni corre la reutilización documental.
 *
 * Qué hace con cada Requerimiento, según los Mandantes que lo usan (por sus
 * vínculos perfilRequerimientos de cualquier estado, las reglas manuales
 * de Expedientes y las instancias expedienteRequerimientos):
 *  - Un solo Mandante: le asigna ese `mandanteId`. No cambia ningún ID.
 *  - Varios Mandantes: el documento original queda para el Mandante con
 *    más historial (más instancias; en empate, más vínculos; luego por
 *    ID). Para cada Mandante restante:
 *      · si NO tiene instancias ni evaluaciones de ese Requerimiento, crea
 *        una copia (ID `<original>__<mandanteId>`, mismos nombre,
 *        nombreCorto, descripcion, tipoEntidad, requiereVencimiento,
 *        esDocumentoIdentidad y estado) y le reapunta sus vínculos y sus
 *        reglas manuales;
 *      · si las tiene, NO lo migra: queda "pendiente de decisión manual"
 *        (sus vínculos siguen apuntando al original).
 *  - Ninguno (huérfano): si en el sistema hay un solo Mandante, se le
 *    asigna a ese. Si hay varios, queda sin `mandanteId` y se lista; con
 *    `--mandante-huerfanos=<id>` se asignan a ese Mandante.
 * Además crea el índice de unicidad `requerimientosNombre` de cada
 * Requerimiento ACTIVO con Mandante. Si dos chocan (mismo Mandante, tipo y
 * nombre normalizado) el índice queda para el primero y el otro se
 * reporta como choque de nombre, sin más cambios.
 *
 * Idempotente: se puede correr varias veces; lo ya migrado no se repite y
 * los pendientes se vuelven a evaluar.
 *
 * Uso (por defecto es dry-run: solo muestra lo que haría):
 *   USE_EMULATOR=true node src/scripts/migrarRequerimientosAMandante.js
 *   USE_EMULATOR=true node src/scripts/migrarRequerimientosAMandante.js \
 *       --ejecutar [--mandante-huerfanos=<mandanteId>]
 *   Sin USE_EMULATOR opera sobre el proyecto real (requiere
 *   functions/serviceAccountKey.json).
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
const {
  COLECCION_INDICE, claveNombre,
} = require("../utils/nombreRequerimiento");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");

const db = admin.firestore();
const EJECUTAR = process.argv.includes("--ejecutar");
const argHuerfanos = process.argv.find(
    (a) => a.startsWith("--mandante-huerfanos="),
);
const MANDANTE_HUERFANOS = argHuerfanos ? argHuerfanos.split("=")[1] : null;
const LOTE = 400;
const CAMPOS_COPIA = [
  "nombre", "nombreCorto", "descripcion", "tipoEntidad",
  "requiereVencimiento", "esDocumentoIdentidad", "estado",
];

const log = (...args) => console.log(...args);

/**
 * Lee una colección completa.
 * @param {string} nombre Nombre de la colección.
 * @param {string[]} [campos] Proyección opcional.
 * @return {Promise<Object[]>} Documentos con su id.
 */
async function leer(nombre, campos) {
  let query = db.collection(nombre);
  if (campos) query = query.select(...campos);
  return (await query.get()).docs.map((d) => ({id: d.id, ...d.data()}));
}

/**
 * Suma 1 en un contador anidado mapa[a][b].
 * @param {Object} mapa Contadores.
 * @param {string} a Primera clave.
 * @param {string} b Segunda clave.
 * @return {void}
 */
function contar(mapa, a, b) {
  if (!a || !b) return;
  if (!mapa[a]) mapa[a] = {};
  mapa[a][b] = (mapa[a][b] || 0) + 1;
}

/**
 * Ejecuta la migración (o la simula en dry-run).
 * @return {Promise<void>}
 */
async function main() {
  log(`\n=== Migración de Requerimientos a Mandante — ${
    EJECUTAR ? "EJECUCIÓN REAL" : "DRY-RUN (no escribe nada)"} ===`);
  log(`Destino: ${process.env.USE_EMULATOR === "true" ?
    "emulador local" : "PROYECTO REAL"}`);

  const [
    requerimientos, vinculos, mandantes, expedientes, instancias,
    evaluaciones, indiceActual, perfilesParticipacion,
  ] = await Promise.all([
    leer("requerimientos"),
    leer("perfilRequerimientos"),
    leer("mandantes"),
    leer("expedientes", ["mandanteId", "requerimientosManuales"]),
    leer("expedienteRequerimientos", ["requerimientoId", "mandanteId"]),
    leer("evaluaciones", ["requerimientoId", "mandanteId"]),
    leer(COLECCION_INDICE),
    leer("perfilesParticipacion", ["mandanteId"]),
  ]);

  // Mandante de los huérfanos: el indicado por parámetro o, si en el
  // sistema hay un solo Mandante, ese (no hay otro dueño posible).
  const mandanteHuerfanos = MANDANTE_HUERFANOS ||
      (mandantes.length === 1 ? mandantes[0].id : null);
  const mandanteDePerfil = new Map(
      perfilesParticipacion.map((p) => [p.id, p.mandanteId]),
  );

  const nombreMandante = (id) => {
    const m = mandantes.find((x) => x.id === id);
    return m ? `${getMandanteDisplayName(m) || id} (${id})` : id;
  };
  if (MANDANTE_HUERFANOS &&
      !mandantes.some((m) => m.id === MANDANTE_HUERFANOS)) {
    console.error(`❌ --mandante-huerfanos: no existe el Mandante ${
      MANDANTE_HUERFANOS}.`);
    process.exit(1);
  }

  // Uso de cada Requerimiento por Mandante: requerimientoId -> mandanteId
  // -> cantidad.
  const usoVinculos = {};
  const usoInstancias = {};
  const usoEvaluaciones = {};
  const usoManuales = {};
  // Un vínculo sin `mandanteId` toma el de su Perfil de Participación.
  vinculos.forEach((v) => {
    v.mandanteId = v.mandanteId ||
        mandanteDePerfil.get(v.perfilParticipacionId) || null;
    contar(usoVinculos, v.requerimientoId, v.mandanteId);
  });
  instancias.forEach((i) =>
    contar(usoInstancias, i.requerimientoId, i.mandanteId));
  evaluaciones.forEach((e) =>
    contar(usoEvaluaciones, e.requerimientoId, e.mandanteId));
  expedientes.forEach((e) => (e.requerimientosManuales || []).forEach((m) =>
    contar(usoManuales, m.requerimientoId, e.mandanteId)));

  const porId = new Map(requerimientos.map((r) => [r.id, r]));
  const escrituras = []; // {tipo: "set"|"update", ref, data}
  const resumen = {}; // mandanteId -> {asignados, copiados, pendientes, ...}
  const huerfanos = [];
  const de = (mandanteId) => {
    if (!resumen[mandanteId]) {
      resumen[mandanteId] = {
        asignados: [], copiados: [], pendientes: [], choques: [],
      };
    }
    return resumen[mandanteId];
  };
  const etiqueta = (r) => `"${r.nombre}" [${r.tipoEntidad}] (${r.id})`;
  // Estado final (en memoria) de cada Requerimiento, para el índice.
  const finales = new Map(); // id -> {mandanteId, tipoEntidad, nombre, estado}

  for (const r of requerimientos) {
    // Las copias de una corrida anterior ya están resueltas.
    const mandantesUso = [...new Set([
      ...Object.keys(usoVinculos[r.id] || {}),
      ...Object.keys(usoInstancias[r.id] || {}),
      ...Object.keys(usoEvaluaciones[r.id] || {}),
      ...Object.keys(usoManuales[r.id] || {}),
    ])];

    let duenio = r.mandanteId || null;
    if (!duenio) {
      if (mandantesUso.length === 0) {
        if (mandanteHuerfanos) {
          duenio = mandanteHuerfanos;
        } else {
          huerfanos.push(r);
          continue;
        }
      } else {
        // El de más historial: instancias, luego vínculos, luego ID.
        duenio = [...mandantesUso].sort((a, b) =>
          ((usoInstancias[r.id] || {})[b] || 0) -
              ((usoInstancias[r.id] || {})[a] || 0) ||
          ((usoVinculos[r.id] || {})[b] || 0) -
              ((usoVinculos[r.id] || {})[a] || 0) ||
          a.localeCompare(b))[0];
      }
      escrituras.push({
        tipo: "update",
        ref: db.collection("requerimientos").doc(r.id),
        data: {mandanteId: duenio, updatedAt: FieldValue.serverTimestamp()},
      });
      de(duenio).asignados.push(etiqueta(r));
    }
    finales.set(r.id, {...r, mandanteId: duenio});

    // Otros Mandantes que también lo usan.
    for (const otro of mandantesUso.filter((m) => m !== duenio)) {
      const conHistorial = ((usoInstancias[r.id] || {})[otro] || 0) +
          ((usoEvaluaciones[r.id] || {})[otro] || 0);
      if (conHistorial > 0) {
        de(otro).pendientes.push(`${etiqueta(r)} — ${
          (usoInstancias[r.id] || {})[otro] || 0} instancias, ${
          (usoEvaluaciones[r.id] || {})[otro] || 0} evaluaciones; queda ` +
          `del Mandante ${nombreMandante(duenio)}`);
        continue;
      }
      const copiaId = `${r.id}__${otro}`;
      const copiaRef = db.collection("requerimientos").doc(copiaId);
      if (!porId.has(copiaId)) {
        const copia = {mandanteId: otro, migradoDesde: r.id};
        CAMPOS_COPIA.forEach((c) => {
          copia[c] = r[c] === undefined ? null : r[c];
        });
        escrituras.push({
          tipo: "set",
          ref: copiaRef,
          data: {
            ...copia,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        });
        finales.set(copiaId, {...copia, id: copiaId});
      }
      // Reapunta los vínculos y las reglas manuales de ese Mandante.
      vinculos
          .filter((v) => v.requerimientoId === r.id && v.mandanteId === otro)
          .forEach((v) => escrituras.push({
            tipo: "update",
            ref: db.collection("perfilRequerimientos").doc(v.id),
            data: {
              requerimientoId: copiaId,
              updatedAt: FieldValue.serverTimestamp(),
            },
          }));
      expedientes
          .filter((e) => e.mandanteId === otro &&
              (e.requerimientosManuales || [])
                  .some((m) => m.requerimientoId === r.id))
          .forEach((e) => escrituras.push({
            tipo: "update",
            ref: db.collection("expedientes").doc(e.id),
            data: {
              requerimientosManuales: e.requerimientosManuales.map((m) =>
                (m.requerimientoId === r.id ?
                  {...m, requerimientoId: copiaId} : m)),
              updatedAt: FieldValue.serverTimestamp(),
            },
          }));
      de(otro).copiados.push(`${etiqueta(r)} → ${copiaId}`);
    }
  }

  // Índice de unicidad: un documento por nombre de Requerimiento ACTIVO.
  const tomadas = new Map(
      indiceActual.map((d) => [d.id, d.requerimientoId]),
  );
  let indicesNuevos = 0;
  [...finales.values()]
      .filter((r) => r.estado === "activo")
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .forEach((r) => {
        const clave = claveNombre(r.mandanteId, r.tipoEntidad, r.nombre);
        const ocupante = tomadas.get(clave);
        if (ocupante === r.id) return;
        if (ocupante) {
          de(r.mandanteId).choques.push(
              `${etiqueta(r)} choca con el Requerimiento ${ocupante}`,
          );
          return;
        }
        tomadas.set(clave, r.id);
        indicesNuevos++;
        escrituras.push({
          tipo: "set",
          ref: db.collection(COLECCION_INDICE).doc(clave),
          data: {
            requerimientoId: r.id,
            mandanteId: r.mandanteId,
            tipoEntidad: r.tipoEntidad,
            createdAt: FieldValue.serverTimestamp(),
          },
        });
      });

  if (EJECUTAR) {
    for (let i = 0; i < escrituras.length; i += LOTE) {
      const batch = db.batch();
      escrituras.slice(i, i + LOTE).forEach((e) => {
        if (e.tipo === "set") batch.set(e.ref, e.data);
        else batch.update(e.ref, e.data);
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
  }

  // Resumen.
  log(`\nRequerimientos leídos: ${requerimientos.length}`);
  if (mandanteHuerfanos) {
    log(`Requerimientos sin uso: se asignan a ${
      nombreMandante(mandanteHuerfanos)}${
      MANDANTE_HUERFANOS ? "" : " (único Mandante del sistema)"}`);
  }
  log(`Escrituras ${EJECUTAR ? "aplicadas" : "que se harían"}: ${
    escrituras.length} (índices de nombre nuevos: ${indicesNuevos})`);
  const imprimir = (titulo, lista) => {
    log(`  ${titulo}: ${lista.length}`);
    lista.forEach((x) => log(`    - ${x}`));
  };
  Object.keys(resumen).sort().forEach((mandanteId) => {
    log(`\nMandante ${nombreMandante(mandanteId)}`);
    imprimir("Asignados", resumen[mandanteId].asignados);
    imprimir("Copiados", resumen[mandanteId].copiados);
    imprimir("Pendientes de decisión manual", resumen[mandanteId].pendientes);
    imprimir("Choques de nombre", resumen[mandanteId].choques);
  });
  log(`\nHuérfanos (sin vínculos ni uso; quedan sin Mandante): ${
    huerfanos.length}`);
  huerfanos.forEach((r) => log(`  - ${etiqueta(r)}`));
  if (huerfanos.length > 0) {
    log("  Para asignarlos: --mandante-huerfanos=<mandanteId>");
  }
  if (!EJECUTAR) log("\nDRY-RUN: no se escribió nada. Use --ejecutar.");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ La migración falló:", err);
      process.exit(1);
    });
