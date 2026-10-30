/**
 * Backfill del registro de consumo de IA (consumosIA) desde los registros
 * que ya existían por flujo:
 *   - procesamientosIA          → origen "revision_carpeta" (sin los
 *     reutilizados: no llamaron a la IA);
 *   - pruebasReglasIA           → origen "prueba_reglas";
 *   - revisionesRequerimientoIA → origen "revision_requerimiento".
 * "Probar conexión" no dejaba registro: no hay histórico que recuperar.
 *
 * Cada consumo usa el ID "<coleccion>_<id>" (el mismo que escribe el
 * backend al registrar una llamada nueva), así que no duplica y se puede
 * volver a correr: solo crea los que faltan. Copia el costo ya calculado
 * (no lo recalcula) y la fecha original. El precio vigente de entonces no
 * quedó guardado: precioEntradaUsdMillon / precioSalidaUsdMillon quedan en
 * null y el registro lleva `retroactivo: true`.
 *
 * mandanteId: el del registro; si no tiene, se deriva del Expediente
 * (expedienteId) o del Requerimiento (requerimientoId). Lo que no se
 * resuelve queda en null ("Interno / sin Mandante").
 *
 * No modifica las colecciones de origen.
 *
 * Uso:
 *   node src/scripts/backfillConsumosIA.js              (DRY RUN por
 *       defecto: solo muestra qué crearía, no escribe)
 *   node src/scripts/backfillConsumosIA.js --ejecutar    (crea los que
 *       faltan)
 *   USE_EMULATOR=true ... para correrlo contra el emulador local.
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

const db = admin.firestore();
const EJECUTAR = process.argv.includes("--ejecutar");
const LOTE = 400;

// Lecturas de apoyo, con caché por ID.
const cache = new Map();

/**
 * Documento por ID (con caché).
 * @param {string} coleccion Colección.
 * @param {?string} id ID.
 * @return {Promise<?Object>} Datos o null.
 */
async function leer(coleccion, id) {
  if (!id) return null;
  const clave = `${coleccion}/${id}`;
  if (!cache.has(clave)) {
    cache.set(clave, db.collection(coleccion).doc(id).get()
        .then((d) => (d.exists ? {id: d.id, ...d.data()} : null)));
  }
  return cache.get(clave);
}

/**
 * Tipo documental por código (con caché).
 * @param {?string} codigo Código ("CEDULA_CL").
 * @return {Promise<?Object>} Tipo o null.
 */
async function tipoPorCodigo(codigo) {
  if (!codigo) return null;
  const clave = `codigo/${codigo}`;
  if (!cache.has(clave)) {
    cache.set(clave, db.collection("tiposDocumentales")
        .where("codigo", "==", codigo).limit(1).get()
        .then((s) => (s.empty ? null : {id: s.docs[0].id,
          ...s.docs[0].data()})));
  }
  return cache.get(clave);
}

/**
 * Mandante del registro, o derivado de su Expediente o Requerimiento.
 * @param {Object} r Registro de origen.
 * @param {?string} expedienteId Expediente asociado.
 * @return {Promise<{mandanteId: ?string, via: string}>} Mandante y cómo se
 *     obtuvo ("registro", "expediente", "requerimiento" o "sin_resolver").
 */
async function resolverMandante(r, expedienteId) {
  if (r.mandanteId) return {mandanteId: r.mandanteId, via: "registro"};
  const exp = await leer("expedientes", expedienteId);
  if (exp?.mandanteId) return {mandanteId: exp.mandanteId, via: "expediente"};
  const req = await leer("requerimientos", r.requerimientoId);
  if (req?.mandanteId) {
    return {mandanteId: req.mandanteId, via: "requerimiento"};
  }
  return {mandanteId: null, via: "sin_resolver"};
}

/**
 * Consumo a crear desde un registro de origen.
 * @param {string} coleccion Colección de origen.
 * @param {Object} r Registro.
 * @return {Promise<?{id: string, data: Object, via: string}>} Consumo, o
 *     null si el registro no fue una llamada a la IA.
 */
async function aConsumo(coleccion, r) {
  let origen;
  let expedienteId = r.expedienteId || null;
  let createdBy = r.createdBy || null;
  let tipo = null;
  let costoUsd;
  if (coleccion === "procesamientosIA") {
    if (r.reutilizadoDe) return null;
    origen = "revision_carpeta";
    const sesion = await leer("sesionesRevision", r.sesionId);
    expedienteId = sesion?.expedienteId || null;
    createdBy = sesion?.createdBy || null;
    const t = await tipoPorCodigo(r.tipoDetectado);
    tipo = {id: t?.id || null, nombre: t?.nombre || r.tipoDetectado || null};
    costoUsd = r.costoUsd || 0;
  } else {
    origen = coleccion === "pruebasReglasIA" ? "prueba_reglas" :
      "revision_requerimiento";
    const t = await leer("tiposDocumentales", r.tipoDocumentalId);
    tipo = {id: r.tipoDocumentalId || null,
      nombre: r.tipoDocumentalNombre || t?.nombre || null};
    costoUsd = r.costoEstimado || 0;
  }
  const {mandanteId, via} = await resolverMandante(r, expedienteId);
  return {
    id: `${coleccion}_${r.id}`, via,
    data: {
      mandanteId, origen, expedienteId,
      requerimientoId: r.requerimientoId || null,
      tipoDocumentalId: tipo.id, tipoDocumentalNombre: tipo.nombre,
      modelo: r.modelo || null,
      tokensEntrada: r.tokensEntrada || 0,
      tokensSalida: r.tokensSalida || 0,
      precioEntradaUsdMillon: null, precioSalidaUsdMillon: null,
      costoUsd, createdBy,
      fuente: {coleccion, id: r.id},
      retroactivo: true,
      createdAt: r.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

/**
 * Punto de entrada.
 * @return {Promise<void>}
 */
async function main() {
  console.log(`Proyecto: ${process.env.USE_EMULATOR === "true" ?
    "smartone-v3 (EMULADOR)" : "smartone-v3"}`);
  console.log(EJECUTAR ? "MODO EJECUTAR\n" : "MODO DRY RUN (no escribe)\n");

  const colecciones = ["procesamientosIA", "pruebasReglasIA",
    "revisionesRequerimientoIA"];
  const aCrear = [];
  const via = {registro: 0, expediente: 0, requerimiento: 0,
    sin_resolver: 0};
  for (const coleccion of colecciones) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await db.collection(coleccion).get();
    const registros = snap.docs.map((d) => ({id: d.id, ...d.data()}));
    // eslint-disable-next-line no-await-in-loop
    const consumos = (await Promise.all(registros.map((r) =>
      aConsumo(coleccion, r)))).filter(Boolean);
    const refs = consumos.map((c) => db.collection("consumosIA").doc(c.id));
    // eslint-disable-next-line no-await-in-loop
    const existentes = new Set((refs.length ? await db.getAll(...refs) : [])
        .filter((d) => d.exists).map((d) => d.id));
    const faltan = consumos.filter((c) => !existentes.has(c.id));
    faltan.forEach((c) => via[c.via]++);
    aCrear.push(...faltan);
    const costo = faltan.reduce((s, c) => s + c.data.costoUsd, 0);
    console.log(`${coleccion}: ${registros.length} registros · ` +
      `${registros.length - consumos.length} sin llamada (reutilizados) · ` +
      `${existentes.size} ya en consumosIA · ${faltan.length} a crear ` +
      `(US$${costo.toFixed(4)})`);
  }

  console.log("\nMandante de los consumos a crear:");
  console.log(`  Del propio registro:      ${via.registro}`);
  console.log(`  Derivado del Expediente:  ${via.expediente}`);
  console.log(`  Derivado del Requerim.:   ${via.requerimiento}`);
  console.log(`  Sin resolver (Interno):   ${via.sin_resolver}`);
  console.log(`\nTotal a crear: ${aCrear.length}`);

  if (!EJECUTAR) {
    console.log("\nDry run: no se escribió nada. Use --ejecutar para aplicar.");
    return;
  }
  for (let i = 0; i < aCrear.length; i += LOTE) {
    const lote = db.batch();
    aCrear.slice(i, i + LOTE).forEach((c) =>
      lote.create(db.collection("consumosIA").doc(c.id), c.data));
    // eslint-disable-next-line no-await-in-loop
    await lote.commit();
    console.log(`  Lote ${i / LOTE + 1}: ${Math.min(LOTE, aCrear.length - i)}`);
  }
  console.log("\nBackfill aplicado.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
