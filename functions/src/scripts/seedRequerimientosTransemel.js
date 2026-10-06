/**
 * Script de seed: carga el catálogo REAL de Requerimientos de Transemel
 * (transcrito de los formularios de acreditación que Transemel usa hoy —
 * NO son datos de prueba genéricos, no llevan prefijo "[SEED]") y los
 * vincula a su Perfil de Participación "Temporal". Invoca los Services
 * reales (nunca Firestore directo) para que se apliquen todas las
 * validaciones ya construidas.
 *
 * A qué Perfil de Recurso aplica cada Requerimiento lo define su vínculo
 * (`perfilRecursoId`): los de Persona aplican al perfil "Operador"; uno de
 * Maquinaria aplica solo al perfil "Grúa"; el resto, a "Todos" (null).
 *
 * Requiere que el Mandante "Transemel", su Perfil de Participación
 * "Temporal" y sus Perfiles de Recurso ("Operador", "Grúa") YA EXISTAN —
 * los crea seedDatosPrueba.js; este script los busca pero nunca los crea y
 * aborta con un mensaje claro si no los encuentra.
 *
 * Uso:
 *   USE_EMULATOR=true node src/scripts/seedRequerimientosTransemel.js
 *       (emulador local)
 *   node src/scripts/seedRequerimientosTransemel.js
 *       (proyecto real, requiere functions/serviceAccountKey.json)
 *
 * Idempotente: puede correrse varias veces sin duplicar datos.
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

const requerimientoService = require("../services/requerimientoService");
const perfilRequerimientoService =
    require("../services/perfilRequerimientoService");

const mandanteRepository = require("../repositories/mandanteRepository");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const perfilRequerimientoRepository =
    require("../repositories/perfilRequerimientoRepository");

const ACTOR_FALSO = {
  rol: "superadmin",
  mandanteId: null,
  uid: "seed-transemel-script",
};

const NOMBRE_PERFIL = "Temporal";

const resumen = {creados: {}, omitidos: {}, fallidos: []};

/**
 * Imprime una línea en consola.
 * @param {string} mensaje Mensaje a imprimir.
 * @return {void}
 */
function log(mensaje) {
  console.log(mensaje);
}

/**
 * Ejecuta la creación idempotente de una entidad: si ya existe (según
 * existeFn), la omite y la cuenta; si no, la crea, loguea y cuenta;
 * cualquier error se atrapa, loguea y cuenta sin abortar el script.
 * @param {string} tipo Nombre del tipo de entidad (para el resumen).
 * @param {string} descripcion Descripción legible de este registro.
 * @param {function(): Promise<?Object>} existeFn Chequeo de existencia.
 * @param {function(): Promise<Object>} crearFn Creación real.
 * @return {Promise<?Object>} La entidad (existente o creada), o null si
 *     falló.
 */
async function seedItem(tipo, descripcion, existeFn, crearFn) {
  try {
    const existente = await existeFn();
    if (existente) {
      log(`  ↷ ${tipo}: "${descripcion}" ya existe, omitiendo.`);
      resumen.omitidos[tipo] = (resumen.omitidos[tipo] || 0) + 1;
      return existente;
    }
    const creado = await crearFn();
    log(`  ✓ ${tipo}: "${descripcion}" creado.`);
    resumen.creados[tipo] = (resumen.creados[tipo] || 0) + 1;
    return creado;
  } catch (err) {
    log(`  ✗ ${tipo}: "${descripcion}" falló: ${err.message}`);
    resumen.fallidos.push({tipo, descripcion, motivo: err.message});
    return null;
  }
}

/**
 * Busca el Mandante Transemel por razónSocial/nombreFantasia (no lo
 * crea: debe existir de antemano). Aborta el proceso si no lo encuentra o
 * si hay más de un candidato (ambigüedad que requiere revisión manual).
 * @return {Promise<Object>} El Mandante encontrado.
 */
async function resolverMandanteTransemel() {
  const todos = await mandanteRepository.list({});
  const candidatos = todos.filter((m) => {
    const razonSocial = (m.razonSocial || "").toLowerCase();
    const nombreFantasia = (m.nombreFantasia || "").toLowerCase();
    return razonSocial.includes("transemel") ||
        nombreFantasia.includes("transemel");
  });

  if (candidatos.length === 0) {
    console.error(
        "❌ No se encontró el Mandante Transemel, verifica que exista " +
        "antes de correr este script.",
    );
    process.exit(1);
  }
  if (candidatos.length > 1) {
    console.error(
        `❌ Se encontraron ${candidatos.length} Mandantes que coinciden ` +
        "con \"Transemel\" — ambigüedad, revisa manualmente antes de " +
        "correr este script.",
    );
    process.exit(1);
  }

  const mandante = candidatos[0];
  log(
      `  ✓ Mandante encontrado: "${getMandanteDisplayName(mandante)}" ` +
      `(id: ${mandante.id})`,
  );
  return mandante;
}

/**
 * Busca el Perfil de Participación "Temporal" del Mandante dado (no lo
 * crea: debe existir de antemano). Aborta el proceso si no lo encuentra.
 * @param {string} mandanteId ID del Mandante Transemel ya resuelto.
 * @return {Promise<Object>} El Perfil encontrado.
 */
async function resolverPerfilTemporal(mandanteId) {
  const perfil = await perfilParticipacionRepository.getByNombre(
      mandanteId, NOMBRE_PERFIL,
  );
  if (!perfil) {
    console.error(
        `❌ No se encontró el Perfil de Participación "${NOMBRE_PERFIL}" ` +
        "para el Mandante Transemel, verifica que exista antes de correr " +
        "este script.",
    );
    process.exit(1);
  }
  log(`  ✓ Perfil encontrado: "${perfil.nombre}" (id: ${perfil.id})`);
  return perfil;
}

/**
 * Resuelve el ID de un Perfil de Recurso de Transemel por tipo y nombre (no
 * lo crea). Aborta si no existe.
 * @param {string} mandanteId ID del Mandante Transemel.
 * @param {string} tipo "persona" | "recurso".
 * @param {string} nombre Nombre del Perfil de Recurso.
 * @return {Promise<string>} ID del Perfil de Recurso.
 */
async function resolverPerfilRecurso(mandanteId, tipo, nombre) {
  const perfil = await perfilRecursoRepository.getByNombre(
      mandanteId, tipo, nombre,
  );
  if (!perfil) {
    console.error(
        `❌ No se encontró el Perfil de Recurso "${nombre}" (${tipo}) de ` +
        "Transemel — corre seedDatosPrueba.js antes de este script.",
    );
    process.exit(1);
  }
  log(`  ✓ Perfil de Recurso: "${perfil.nombre}" (${tipo}, ${perfil.id})`);
  return perfil.id;
}

/**
 * Catálogo real de los 38 Requerimientos de Transemel, transcrito de sus
 * formularios de acreditación vigentes. `perfilRecurso` indica a qué
 * Perfil de Recurso aplica su vínculo (null = "Todos").
 * @return {Object[]} Lista de specs de Requerimiento.
 */
function datosRequerimientos() {
  const empresa = [
    {
      nombre: "Cronograma de actividades o trabajos a ejecutar",
      nombreCorto: "Cronograma de actividades",
      descripcion: "Debe indicar Nombre y Rut de EE.CC, Firma de " +
          "Administrador de Contrato, nombre del Proyecto.",
    },
    {
      nombre: "Listado actualizado del personal que participará en el " +
          "servicio",
      nombreCorto: "Listado de personal",
      descripcion: "Nombre, Rut, edad, cargo, fecha vencimiento examen " +
          "pre-ocupacional/ocupacional y matriz de competencias / cargo.",
    },
    {
      nombre: "Carpeta personal de cada trabajador",
      nombreCorto: "Carpeta del trabajador",
      descripcion: "Contrato de trabajo, registro de entrega reglamento " +
          "interno, registro de entrega ODI, registro de entrega EPP, " +
          "exámenes ocupacionales, certificación de especialidad " +
          "(Ingenieros, operadores, eléctricos, riggers, soldadores, etc.).",
    },
    {
      nombre: "Certificado de adhesión organismo administrador del seguro",
      nombreCorto: "Adhesión a mutualidad",
      descripcion: "Mutualidad e Historial de accidentes y enfermedades " +
          "profesionales. Certificado reciente al inicio de las " +
          "actividades, últimos 3 años.",
    },
    {
      nombre: "Registro de Inducción inicial de riesgos laborales",
      nombreCorto: "Inducción de riesgos",
      descripcion: "Obligación de informar los riesgos laborales " +
          "específicos del contrato a todos los trabajadores por parte " +
          "del empleador.",
    },
    {
      nombre: "Registro de difusión de Política HSEQ Transemel",
      nombreCorto: "Difusión Política HSEQ",
      descripcion: "A todo el personal del contrato.",
    },
    {
      nombre: "Antecedentes del Experto Profesional en Prevención de " +
          "Riesgos",
      nombreCorto: "Experto en prevención",
      descripcion: "Currículum, resolución SNS, Registro SNS, " +
          "certificado de título timbrados notarialmente. Solo si aplica.",
    },
    {
      nombre: "Listado y antecedentes de Conductores y personal calificado",
      nombreCorto: "Conductores y personal calificado",
      descripcion: "Licencia municipal, Curso 4x4 teórico-práctico o " +
          "manejo defensivo online, Examen Psicosensotécnico riguroso, " +
          "Hoja de vida del conductor sin anotaciones graves, " +
          "Certificación de operadores de maquinaria pesada.",
    },
    {
      nombre: "Listado de Vehículos y Maquinaria con documentación de " +
          "acreditación",
      nombreCorto: "Listado de vehículos y maquinaria",
      descripcion: "Camioneta, Camiones, Maquinaria. Documentación: " +
          "Padrón, permiso de circulación, seguro obligatorio, revisión " +
          "técnica y revisión de gases, según estándar Transemel.",
    },
    {
      nombre: "Declaración y control de sustancias peligrosas",
      nombreCorto: "Sustancias peligrosas",
      descripcion: "Listado con sus respectivas Hojas de seguridad. Si " +
          "corresponde.",
    },
    {
      nombre: "Listado de Elementos de Protección Personal",
      nombreCorto: "Listado de EPP",
      descripcion: "Asociados a las actividades del contrato y su " +
          "respectiva Certificación.",
    },
    {
      nombre: "Reglamento interno de Orden, Higiene y Seguridad",
      nombreCorto: "Reglamento interno",
      descripcion: "Registro de recepción por Servicio de Salud y " +
          "Dirección del Trabajo. Actualizado, máximo 1 año de recepción.",
    },
    {
      nombre: "Procedimientos de trabajo del contrato",
      nombreCorto: "Procedimientos de trabajo",
      descripcion: "Para las actividades del contrato.",
    },
    {
      nombre: "Registro de difusión de procedimientos de trabajo",
      nombreCorto: "Difusión de procedimientos",
      descripcion: "Incluye evaluación de aprendizaje de la difusión.",
    },
    {
      nombre: "Recepción del Reglamento Especial de Seguridad de " +
          "Transemel",
      nombreCorto: "Reglamento Especial de Seguridad",
      descripcion: "Para Empresas Contratistas y Subcontratistas.",
    },
    {
      nombre: "Declaración de cumplimiento Legal",
      nombreCorto: "Cumplimiento legal",
      descripcion: "Firmada por el representante legal de la empresa o " +
          "administrador de contrato.",
    },
    {
      nombre: "Recepción de 10 Estándares HSEQ Transemel",
      nombreCorto: "10 Estándares HSEQ",
    },
    {
      nombre: "Listado de Subcontratos",
      nombreCorto: "Subcontratos",
      descripcion: "Si es que aplica.",
    },
  ].map((d) => ({
    ...d,
    tipoEntidad: "empresa",
    perfilRecurso: null,
    requiereVencimiento: false,
  }));

  const persona = [
    {
      nombre: "Contrato de trabajo y Anexo",
      nombreCorto: "Contrato de trabajo", requiereVencimiento: true,
    },
    {
      nombre: "Registro de entrega reglamento interno",
      nombreCorto: "Entrega reglamento interno", requiereVencimiento: false,
    },
    {
      nombre: "Registro de entrega ODI",
      nombreCorto: "Entrega ODI", requiereVencimiento: false,
    },
    {
      nombre: "Registro de entrega EPP",
      nombreCorto: "Entrega EPP", requiereVencimiento: false,
    },
    {
      nombre: "Exámenes ocupacionales",
      nombreCorto: "Exámenes ocupacionales", requiereVencimiento: true,
    },
    {
      nombre: "Certificación de especialidad",
      nombreCorto: "Certificación de especialidad",
      descripcion: "Ingenieros, operadores, eléctricos, riggers, " +
          "soldadores, etc.",
      requiereVencimiento: false,
    },
    {
      nombre: "Inducción HSEQ Transemel",
      nombreCorto: "Inducción HSEQ", requiereVencimiento: false,
    },
    {
      nombre: "Registro de difusión de Procedimientos de trabajo",
      nombreCorto: "Difusión de procedimientos", requiereVencimiento: false,
    },
    {
      nombre: "Licencia municipal",
      nombreCorto: "Licencia municipal", requiereVencimiento: true,
    },
    {
      nombre: "Curso 4x4 teórico-práctico",
      nombreCorto: "Curso 4x4", requiereVencimiento: true,
    },
    {
      nombre: "Curso de manejo defensivo Online",
      nombreCorto: "Manejo defensivo", requiereVencimiento: true,
    },
    {
      nombre: "Examen Psicosensotécnico riguroso",
      nombreCorto: "Psicosensotécnico", requiereVencimiento: true,
    },
    {
      nombre: "Hoja de vida del conductor sin anotaciones graves",
      nombreCorto: "Hoja de vida del conductor", requiereVencimiento: false,
    },
    {
      nombre: "Certificación de operadores de maquinaria pesada",
      nombreCorto: "Certificación de operador", requiereVencimiento: true,
    },
  ].map((d) => ({
    ...d,
    tipoEntidad: "persona",
    // El vínculo apunta al Perfil de Recurso "Operador" (misma grafía que
    // el perfil).
    perfilRecurso: "Operador",
  }));

  const maquinaria = [
    {
      nombre: "Padrón Vehículo/maquinaria",
      nombreCorto: "Padrón", requiereVencimiento: false,
    },
    {
      nombre: "Permiso de circulación",
      nombreCorto: "Permiso de circulación", requiereVencimiento: true,
    },
    {
      nombre: "Seguro obligatorio",
      nombreCorto: "Seguro obligatorio", requiereVencimiento: true,
    },
    {
      nombre: "Revisión técnica",
      nombreCorto: "Revisión técnica", requiereVencimiento: true,
    },
    {
      nombre: "Revisión de gases",
      nombreCorto: "Revisión de gases",
      descripcion: "Certificado de Emisiones Contaminantes.",
      requiereVencimiento: true,
    },
    {
      nombre: "Certificación de vehículo y maquinaria según estándar " +
          "Transemel",
      nombreCorto: "Certificación estándar Transemel",
      requiereVencimiento: false,
      // Único de Maquinaria acotado a una clasificación puntual.
      perfilRecurso: "Grúa",
    },
  ].map((d) => ({
    perfilRecurso: null,
    ...d,
    tipoEntidad: "recurso",
  }));

  return [...empresa, ...persona, ...maquinaria];
}

/**
 * Paso 1: crea (o reutiliza) los 38 Requerimientos de Transemel.
 * @return {Promise<Object[]>} [{requerimiento, perfilRecurso}] con el
 *     Requerimiento creado o ya existente.
 */
async function seedRequerimientos() {
  log("\n[1/2] Requerimientos de Transemel");
  const datos = datosRequerimientos();

  const resultado = [];
  for (const d of datos) {
    const item = await seedItem(
        "Requerimiento", `${d.nombreCorto} (${d.tipoEntidad})`,
        () => requerimientoRepository.getByNombreYTipo(
            d.nombre, d.tipoEntidad,
        ),
        () => requerimientoService.crearRequerimiento({
          nombre: d.nombre,
          nombreCorto: d.nombreCorto,
          descripcion: d.descripcion || null,
          tipoEntidad: d.tipoEntidad,
          requiereVencimiento: Boolean(d.requiereVencimiento),
          estado: "activo",
        }),
    );
    if (item) {
      resultado.push({requerimiento: item, perfilRecurso: d.perfilRecurso});
    }
  }
  return resultado;
}

/**
 * Paso 2: vincula cada Requerimiento al Perfil "Temporal" de Transemel,
 * para "Todos" o para el Perfil de Recurso indicado.
 * @param {Object[]} items [{requerimiento, perfilRecurso}].
 * @param {Object} perfil Perfil de Participación "Temporal" ya resuelto.
 * @param {string} mandanteId ID del Mandante Transemel.
 * @return {Promise<void>}
 */
async function seedVinculos(items, perfil, mandanteId) {
  log(`\n[2/2] Vínculos Perfil-Requerimiento ("${perfil.nombre}")`);
  const idsPerfilRecurso = {};
  for (const {requerimiento, perfilRecurso} of items) {
    let perfilRecursoId = null;
    if (perfilRecurso) {
      const clave = `${requerimiento.tipoEntidad}|${perfilRecurso}`;
      if (!(clave in idsPerfilRecurso)) {
        idsPerfilRecurso[clave] = await resolverPerfilRecurso(
            mandanteId, requerimiento.tipoEntidad, perfilRecurso,
        );
      }
      perfilRecursoId = idsPerfilRecurso[clave];
    }
    await seedItem(
        "PerfilRequerimiento",
        `${perfil.nombre} ↔ ${requerimiento.nombreCorto} ` +
        `(${perfilRecurso || "Todos"})`,
        () => perfilRequerimientoRepository.getByCombinacion(
            perfil.id, requerimiento.id, perfilRecursoId,
        ),
        () => perfilRequerimientoService.crearVinculo({
          perfilParticipacionId: perfil.id,
          requerimientoId: requerimiento.id,
          perfilRecursoId,
        }, ACTOR_FALSO),
    );
  }
}

/**
 * Imprime el resumen final: creados/omitidos/fallidos por tipo.
 * @return {void}
 */
function imprimirResumen() {
  log("\n\n=== RESUMEN ===");

  log("\nCreados:");
  const tiposCreados = Object.keys(resumen.creados);
  if (tiposCreados.length === 0) log("  (ninguno)");
  tiposCreados.forEach((tipo) => log(`  ${tipo}: ${resumen.creados[tipo]}`));

  log("\nYa existían (omitidos):");
  const tiposOmitidos = Object.keys(resumen.omitidos);
  if (tiposOmitidos.length === 0) log("  (ninguno)");
  tiposOmitidos.forEach(
      (tipo) => log(`  ${tipo}: ${resumen.omitidos[tipo]}`),
  );

  log("\nFallidos:");
  if (resumen.fallidos.length === 0) {
    log("  (ninguno)");
  } else {
    resumen.fallidos.forEach((f) => {
      log(`  ${f.tipo} — "${f.descripcion}": ${f.motivo}`);
    });
  }
}

/**
 * Punto de entrada: resuelve el contexto (Mandante + Perfil) y ejecuta los
 * 2 pasos de carga en orden.
 * @return {Promise<void>}
 */
async function main() {
  log("=== SmartOne v3 — Seed de Requerimientos reales de Transemel ===");
  const modo = process.env.USE_EMULATOR === "true" ?
      "EMULADOR" :
      "PROYECTO REAL (smartone-v3)";
  log(`Modo: ${modo}`);

  log("\n[0/2] Resolviendo contexto (Mandante Transemel + Perfil " +
      `"${NOMBRE_PERFIL}")`);
  const mandante = await resolverMandanteTransemel();
  const perfil = await resolverPerfilTemporal(mandante.id);

  const items = await seedRequerimientos();
  await seedVinculos(items, perfil, mandante.id);

  imprimirResumen();
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal en el script de seed:", err);
      process.exit(1);
    });
