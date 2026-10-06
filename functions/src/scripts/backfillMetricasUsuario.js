/**
 * Backfill de `metricasUsuarioDiarias` (Fase C) a partir del historial
 * completo (inmutable) de Bitácora: recalcula `expedientesCreados`,
 * `evaluacionesRealizadas`, `empresasEvaluadas`, `personasEvaluadas` y
 * `maquinasEvaluadas` de CADA día/usuario desde cero, y los escribe con
 * `set({...}, {merge:true})` como TOTALES ABSOLUTOS (no `increment`).
 *
 * Idempotente por diseño: como recalcula el total completo desde la
 * fuente inmutable (Bitácora) en cada corrida, correrlo más de una vez
 * (o después de que el trigger `onBitacoraCreada` ya haya procesado
 * eventos nuevos) siempre converge al mismo resultado correcto — nunca
 * duplica, porque no incrementa, sobrescribe.
 *
 * NO toca `accesos` ni `segundosConectado` (quedan fuera del objeto que
 * se escribe): esos campos son de Sesiones, que el propio prompt aclara
 * que NO se pueden reconstruir retroactivamente. Las métricas de acceso
 * parten desde la fecha de despliegue de la Fase B — la UI debe indicarlo
 * ("Datos de acceso desde dd-mm-aaaa").
 *
 * Uso:
 *   USE_EMULATOR=true node src/scripts/backfillMetricasUsuario.js
 *     (emulador, DRY RUN)
 *   USE_EMULATOR=true node src/scripts/backfillMetricasUsuario.js --ejecutar
 *     (emulador, aplica)
 *   node src/scripts/backfillMetricasUsuario.js
 *     (proyecto real, DRY RUN)
 *   node src/scripts/backfillMetricasUsuario.js --ejecutar
 *     (proyecto real, aplica)
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
    admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
  }
}

const db = admin.firestore();
const expedienteRepository = require("../repositories/expedienteRepository");
const {fechaSantiago} = require("../utils/fechaSantiago");

/**
 * @param {object} detalle El `detalle` de un evento `evaluacion/creado`.
 * @param {Map<string, object>} cacheExpedientes Cache local de
 *     Expediente por id, para no repetir lecturas dentro de la corrida.
 * @return {Promise<{empresaId: (string|undefined), personaId:
 *     (string|undefined), recursoId: (string|undefined)}>}
 */
async function resolverSujeto(detalle, cacheExpedientes) {
  if (detalle?.personaId) return {personaId: detalle.personaId};
  if (detalle?.recursoId) return {recursoId: detalle.recursoId};
  const expedienteId = detalle?.expedienteId;
  if (!expedienteId) return {};
  if (!cacheExpedientes.has(expedienteId)) {
    cacheExpedientes.set(
        expedienteId, await expedienteRepository.getById(expedienteId),
    );
  }
  const expediente = cacheExpedientes.get(expedienteId);
  return {empresaId: expediente?.empresaId};
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  const ejecutar = process.argv.includes("--ejecutar");
  console.log(
      `=== Backfill metricasUsuarioDiarias — ` +
      `${ejecutar ? "EJECUTANDO" : "DRY RUN"} ===`,
  );

  const snapshot = await db.collection("bitacora")
      .where("entidad", "in", ["expediente", "evaluacion"])
      .where("accion", "==", "creado")
      .get();
  console.log(`Eventos de Bitácora relevantes encontrados: ${snapshot.size}`);

  // Acumulador en memoria: clave "{usuarioId}_{fecha}" -> totales.
  const acumulado = new Map();
  const cacheExpedientes = new Map();

  const clave = (usuarioId, fecha) => `${usuarioId}_${fecha}`;
  const obtenerBucket = (usuarioId, mandanteId, fecha) => {
    const k = clave(usuarioId, fecha);
    if (!acumulado.has(k)) {
      acumulado.set(k, {
        usuarioId, mandanteId: mandanteId ?? null, fecha,
        expedientesCreados: 0, evaluacionesRealizadas: 0,
        empresasEvaluadas: new Set(), personasEvaluadas: new Set(),
        maquinasEvaluadas: new Set(),
      });
    }
    return acumulado.get(k);
  };

  for (const doc of snapshot.docs) {
    const registro = doc.data();
    if (!registro.actorUid || !registro.createdAt) continue;
    const fecha = fechaSantiago(registro.createdAt.toDate());
    const bucket = obtenerBucket(registro.actorUid, registro.mandanteId, fecha);

    if (registro.entidad === "expediente") {
      bucket.expedientesCreados++;
    } else if (registro.entidad === "evaluacion") {
      bucket.evaluacionesRealizadas++;
      const sujeto = await resolverSujeto(registro.detalle, cacheExpedientes);
      if (sujeto.empresaId) bucket.empresasEvaluadas.add(sujeto.empresaId);
      else if (sujeto.personaId) bucket.personasEvaluadas.add(sujeto.personaId);
      else if (sujeto.recursoId) bucket.maquinasEvaluadas.add(sujeto.recursoId);
    }
  }

  console.log(`Documentos usuario/día a escribir: ${acumulado.size}`);

  if (!ejecutar) {
    let mostrados = 0;
    for (const bucket of acumulado.values()) {
      if (mostrados >= 20) {
        console.log(
            `  ... (${acumulado.size - 20} más, omitidos en el dry run)`,
        );
        break;
      }
      console.log(
          `  ${bucket.usuarioId}_${bucket.fecha}: ` +
          `expedientesCreados=${bucket.expedientesCreados}, ` +
          `evaluacionesRealizadas=${bucket.evaluacionesRealizadas}, ` +
          `empresas=${bucket.empresasEvaluadas.size}, ` +
          `personas=${bucket.personasEvaluadas.size}, ` +
          `maquinas=${bucket.maquinasEvaluadas.size}`,
      );
      mostrados++;
    }
    console.log(
        "\nDRY RUN — nada escrito. Ejecuta con --ejecutar para aplicar.",
    );
    return;
  }

  let escritos = 0;
  const buckets = [...acumulado.values()];
  for (let i = 0; i < buckets.length; i += 400) {
    const lote = buckets.slice(i, i + 400);
    const batch = db.batch();
    lote.forEach((bucket) => {
      const ref = db.collection("metricasUsuarioDiarias")
          .doc(`${bucket.usuarioId}_${bucket.fecha}`);
      batch.set(ref, {
        usuarioId: bucket.usuarioId,
        mandanteId: bucket.mandanteId,
        fecha: bucket.fecha,
        expedientesCreados: bucket.expedientesCreados,
        evaluacionesRealizadas: bucket.evaluacionesRealizadas,
        empresasEvaluadas: [...bucket.empresasEvaluadas],
        personasEvaluadas: [...bucket.personasEvaluadas],
        maquinasEvaluadas: [...bucket.maquinasEvaluadas],
      }, {merge: true});
    });
    await batch.commit();
    escritos += lote.length;
    console.log(`Escritos ${escritos}/${buckets.length}...`);
  }

  console.log(`\n=== Backfill completo: ${escritos} documentos escritos. ===`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Error en el backfill:", err);
  process.exit(1);
});
