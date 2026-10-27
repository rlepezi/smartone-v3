/**
 * Script de seed: genera un dataset de prueba completo cubriendo las 15
 * entidades de la Matriz Maestra, invocando los Services reales (nunca
 * Firestore directo) para que se apliquen todas las validaciones,
 * derivaciones y lógica especial ya construida.
 *
 * Uso:
 *   USE_EMULATOR=true node src/scripts/seedDatosPrueba.js   (emulador local)
 *   node src/scripts/seedDatosPrueba.js                     (proyecto real,
 *       requiere functions/serviceAccountKey.json)
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

const {cleanRut} = require("../utils/rutValidator");
const {normalizarNombre} = require("../utils/nombreRequerimiento");

const mandanteService = require("../services/mandanteService");
const usuarioService = require("../services/usuarioService");
const proyectoService = require("../services/proyectoService");
const empresaService = require("../services/empresaService");
const personaService = require("../services/personaService");
const recursoService = require("../services/recursoService");
const perfilParticipacionService =
    require("../services/perfilParticipacionService");
const requerimientoService = require("../services/requerimientoService");
const participacionService = require("../services/participacionService");
const expedienteService = require("../services/expedienteService");
const evidenciaService = require("../services/evidenciaService");
const evidenciaRequerimientoService =
    require("../services/evidenciaRequerimientoService");
const evaluacionService = require("../services/evaluacionService");
const perfilRecursoService = require("../services/perfilRecursoService");
const empresaPersonaService = require("../services/empresaPersonaService");
const empresaPersonaRepository =
    require("../repositories/empresaPersonaRepository");
const participacionPersonaService =
    require("../services/participacionPersonaService");
const participacionRecursoService =
    require("../services/participacionRecursoService");
const expedienteRequerimientoService =
    require("../services/expedienteRequerimientoService");
const requerimientoCalculoService =
    require("../services/requerimientoCalculoService");

const mandanteRepository = require("../repositories/mandanteRepository");
const usuarioRepository = require("../repositories/usuarioRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const personaRepository = require("../repositories/personaRepository");
const recursoRepository = require("../repositories/recursoRepository");
const perfilParticipacionRepository =
    require("../repositories/perfilParticipacionRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const participacionRepository =
    require("../repositories/participacionRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const evidenciaRepository = require("../repositories/evidenciaRepository");
const evidenciaRequerimientoRepository =
    require("../repositories/evidenciaRequerimientoRepository");
const evaluacionRepository = require("../repositories/evaluacionRepository");
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");

// Perfiles de Recurso que se crean en cada Mandante. Las clasificaciones de
// Maquinaria son también los `tipo` de los Recursos del seed.
const ROLES_PERSONA = ["Operador", "Trabajador"];
const CLASIFICACIONES_MAQUINARIA = [
  "Camioneta", "Retroexcavadora", "Grúa", "Camión Pluma",
];

const ACTOR_FALSO = {
  rol: "superadmin",
  mandanteId: null,
  uid: "seed-script",
  email: "seed-script@local",
};

const PASSWORD_PRUEBA = "Seed2026#";
const EMAILS_USUARIOS = [
  "admin.andina@seed.smartone.cl",
  "lector.andina@seed.smartone.cl",
  "admin.minera@seed.smartone.cl",
  "lector.minera@seed.smartone.cl",
  "evaluador@seed.smartone.cl",
];

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
 * Calcula el dígito verificador de un RUT chileno (módulo 11), mismo
 * algoritmo que functions/src/utils/rutValidator.js.
 * @param {string} cuerpo Cuerpo numérico del RUT (sin DV).
 * @return {string} Dígito verificador ("0"-"9" o "K").
 */
function calcularDV(cuerpo) {
  let suma = 0;
  let multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += multiplo * parseInt(cuerpo.charAt(i), 10);
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }
  const dvEsperado = 11 - (suma % 11);
  if (dvEsperado === 11) return "0";
  if (dvEsperado === 10) return "K";
  return String(dvEsperado);
}

/**
 * Genera un RUT de prueba válido y determinístico a partir de un número
 * base fijo (mismo número → mismo RUT siempre, para que la idempotencia
 * entre corridas funcione).
 * @param {number} base Número base sintético (rango claramente de
 *     prueba, ej. 90000001).
 * @return {string} RUT con formato "NNNNNNNN-D".
 */
function rutDesdeBase(base) {
  const cuerpo = String(base);
  return `${cuerpo}-${calcularDV(cuerpo)}`;
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
 * Busca un usuario por email, resolviendo Auth + el doc de Firestore.
 * @param {string} email Email a buscar.
 * @return {Promise<?Object>} El usuario (con id = uid) o null.
 */
async function buscarUsuarioPorEmail(email) {
  try {
    const authUser = await admin.auth().getUserByEmail(email);
    return await usuarioRepository.getById(authUser.uid);
  } catch {
    return null;
  }
}

/**
 * Paso 1: Mandantes.
 * @return {Promise<Object<string, Object>>} Mapa nombreFantasia →
 *     Mandante.
 */
async function seedMandantes() {
  log("\n[1/15] Mandantes");
  const datos = [
    {
      nombreFantasia: "Constructora Andina",
      rut: rutDesdeBase(90000001),
      razonSocial: "Constructora Andina SpA",
    },
    {
      nombreFantasia: "Minera del Sur",
      rut: rutDesdeBase(90000002),
      razonSocial: "Minera del Sur SpA",
    },
    // Lo exige seedRequerimientosTransemel.js (catálogo real de Transemel).
    {
      nombreFantasia: "Transemel",
      rut: rutDesdeBase(90000003),
      razonSocial: "Empresa de Transmisión Eléctrica Transemel S.A.",
    },
  ];

  const mandantes = {};
  for (const d of datos) {
    const creado = await seedItem(
        "Mandante", d.nombreFantasia,
        () => mandanteRepository.getByRut(cleanRut(d.rut)),
        () => mandanteService.crearMandante({
          rut: d.rut,
          razonSocial: d.razonSocial,
          nombreFantasia: d.nombreFantasia,
          estado: "activo",
        }),
    );
    if (creado) mandantes[d.nombreFantasia] = creado;
  }
  return mandantes;
}

/**
 * Paso 2: Usuarios (mandante_admin y mandante_lector por Mandante, más
 * un evaluador). El superadmin de seedSuperAdmin.js se verifica pero
 * nunca se duplica.
 * @param {Object<string, Object>} mandantes Mapa nombreFantasia →
 *     Mandante.
 * @return {Promise<Object<string, Object>>} Mapa email → Usuario.
 */
async function seedUsuarios(mandantes) {
  log("\n[2/15] Usuarios");

  const superadmin = await buscarUsuarioPorEmail("clepez@gmail.com");
  log(superadmin ?
      "  ↷ Superadmin (clepez@gmail.com) ya existe, no se duplica." :
      "  ! Superadmin (clepez@gmail.com) no encontrado — " +
      "corré seedSuperAdmin.js si hace falta.");

  const andina = mandantes["Constructora Andina"];
  const minera = mandantes["Minera del Sur"];

  const datos = [
    andina && {
      email: "admin.andina@seed.smartone.cl", nombre: "Admin",
      apellido: "Andina", rol: "mandante_admin", mandanteId: andina.id,
    },
    andina && {
      email: "lector.andina@seed.smartone.cl", nombre: "Lector",
      apellido: "Andina", rol: "mandante_lector", mandanteId: andina.id,
    },
    minera && {
      email: "admin.minera@seed.smartone.cl", nombre: "Admin",
      apellido: "Minera", rol: "mandante_admin", mandanteId: minera.id,
    },
    minera && {
      email: "lector.minera@seed.smartone.cl", nombre: "Lector",
      apellido: "Minera", rol: "mandante_lector", mandanteId: minera.id,
    },
    {
      email: "evaluador@seed.smartone.cl", nombre: "Evaluador",
      apellido: "Seed", rol: "evaluador", mandanteId: null,
    },
  ].filter(Boolean);

  const usuarios = {};
  for (const d of datos) {
    const creado = await seedItem(
        "Usuario", d.email,
        () => buscarUsuarioPorEmail(d.email),
        () => usuarioService.crearUsuario({
          nombre: d.nombre,
          apellido: d.apellido,
          email: d.email,
          rol: d.rol,
          mandanteId: d.mandanteId,
          password: PASSWORD_PRUEBA,
        }, ACTOR_FALSO),
    );
    if (creado) usuarios[d.email] = creado;
  }
  return usuarios;
}

/**
 * Paso 3: Proyectos (3 por Mandante, con estados planificado/
 * en_ejecucion/finalizado — nunca archivado).
 * @param {Object<string, Object>} mandantes Mapa nombreFantasia →
 *     Mandante.
 * @return {Promise<Object<string, Object>>} Mapa nombre → Proyecto.
 */
async function seedProyectos(mandantes) {
  log("\n[3/15] Proyectos");
  const grupos = [
    {mandante: "Constructora Andina", sufijo: "AND"},
    {mandante: "Minera del Sur", sufijo: "MIN"},
  ];

  const proyectos = {};
  for (const grupo of grupos) {
    const mandante = mandantes[grupo.mandante];
    if (!mandante) continue;

    // Sin código: lo asigna el backend al crear (PRJ-AAAA-NNN por Mandante
    // y año). La idempotencia se resuelve por nombre dentro del Mandante.
    const specs = [
      {
        nombre: `Proyecto Planificado ${grupo.sufijo}`,
        estadoFinal: "planificado",
      },
      {
        nombre: `Proyecto en Ejecución ${grupo.sufijo}`,
        estadoFinal: "en_ejecucion",
      },
      {
        nombre: `Proyecto Finalizado ${grupo.sufijo}`,
        estadoFinal: "finalizado",
      },
    ];
    const existentes = await proyectoRepository.list({mandanteId: mandante.id});

    for (const spec of specs) {
      let proyecto = await seedItem(
          "Proyecto", spec.nombre,
          async () => existentes.find((p) => p.nombre === spec.nombre) || null,
          () => proyectoService.crearProyecto({
            nombre: spec.nombre,
            mandanteId: mandante.id,
            fechaInicio: "2026-01-15",
          }, ACTOR_FALSO),
      );
      if (!proyecto) continue;

      if (proyecto.estado !== spec.estadoFinal) {
        try {
          const payload = {estado: spec.estadoFinal};
          if (spec.estadoFinal === "finalizado") {
            payload.fechaTermino = "2026-06-30";
          }
          proyecto = await proyectoService.actualizarProyecto(
              proyecto.id, payload, ACTOR_FALSO,
          );
          log(`  ✓ Proyecto: "${spec.nombre}" → ${spec.estadoFinal}.`);
        } catch (err) {
          log(`  ✗ Proyecto: "${spec.nombre}" no transicionó a ` +
              `${spec.estadoFinal}: ${err.message}`);
          resumen.fallidos.push({
            tipo: "Proyecto",
            descripcion: `${spec.nombre} → ${spec.estadoFinal}`,
            motivo: err.message,
          });
        }
      }
      proyectos[spec.nombre] = proyecto;
    }
  }
  return proyectos;
}

/**
 * Paso 4: Empresas (catálogo global) y su asociación con Mandantes
 * (empresaMandantes). Servicios Industriales Maule queda asociada a DOS
 * Mandantes (Minera del Sur y Constructora Andina); ninguna se asocia a
 * Transemel.
 * @param {Object<string, Object>} mandantes Mapa nombreFantasia →
 *     Mandante.
 * @return {Promise<Object<string, Object>>} Mapa razónSocial → Empresa.
 */
async function seedEmpresas(mandantes) {
  log("\n[4/15] Empresas");
  const datos = [
    {
      razonSocial: "Transportes del Valle Ltda.",
      rut: rutDesdeBase(90001001),
      giro: "Transporte de carga terrestre",
      mandantes: ["Constructora Andina"],
    },
    {
      razonSocial: "Ingeniería Cordillera SpA",
      rut: rutDesdeBase(90001002),
      giro: "Servicios de ingeniería y consultoría",
      mandantes: ["Constructora Andina"],
    },
    {
      razonSocial: "Servicios Industriales Maule Ltda.",
      rut: rutDesdeBase(90001003),
      giro: "Mantención industrial",
      mandantes: ["Minera del Sur", "Constructora Andina"],
    },
    {
      razonSocial: "Logística Puerto Sur SpA",
      rut: rutDesdeBase(90001004),
      giro: "Logística y almacenaje",
      mandantes: ["Constructora Andina"],
    },
  ];

  const empresas = {};
  for (const d of datos) {
    const [primero, ...otros] = d.mandantes.map((n) => mandantes[n]);
    const creado = await seedItem(
        "Empresa", d.razonSocial,
        () => empresaRepository.getByRut(cleanRut(d.rut)),
        () => empresaService.crearEmpresa({
          rut: d.rut,
          razonSocial: d.razonSocial,
          giro: d.giro,
          estado: "activo",
          mandanteId: primero.id,
        }, ACTOR_FALSO),
    );
    if (!creado) continue;
    empresas[d.razonSocial] = creado;
    // Asociaciones adicionales (idempotente: reactiva o deja igual).
    for (const m of [primero, ...otros]) {
      await empresaService.asociarMandante(creado.id, m.id, ACTOR_FALSO);
    }
  }
  return empresas;
}

/**
 * Paso 5: Personas (2-3 por Empresa).
 * @param {Object<string, Object>} empresas Mapa razónSocial → Empresa.
 * @return {Promise<Object<string, Object[]>>} Mapa empresaId → Personas.
 */
async function seedPersonas(empresas) {
  log("\n[5/15] Personas");
  // Profesión opcional (bloque 5): la tercera persona queda sin ella.
  const nombresBase = [
    ["Juan", "Pérez", "Técnico en Mecánica"],
    ["María", "González", "Ingeniera en Prevención de Riesgos"],
    ["Pedro", "Soto", null],
  ];

  const personasPorEmpresaId = {};
  let indiceEmpresa = 0;
  let baseRut = 90002001;

  for (const [razonSocial, empresa] of Object.entries(empresas)) {
    personasPorEmpresaId[empresa.id] = [];
    const cantidad = 2 + (indiceEmpresa % 2);

    for (let i = 0; i < cantidad; i++) {
      const [nombre, apellido, profesion] =
          nombresBase[i % nombresBase.length];
      const nombreCompleto = `${nombre} ${apellido} (${razonSocial})`;
      const rut = rutDesdeBase(baseRut++);

      const creado = await seedItem(
          "Persona", nombreCompleto,
          () => personaRepository.getByRut(cleanRut(rut)),
          () => personaService.crearPersona({
            rut,
            nombre,
            apellido,
            profesion,
            empresaId: empresa.id,
            estado: "activo",
            tipoRelacion: "Trabajador",
            cargo: "Operario",
            tipoContrato: "Indefinido",
            fechaInicio: new Date().toISOString(),
          }, ACTOR_FALSO),
      );
      if (creado) personasPorEmpresaId[empresa.id].push(creado);
    }
    indiceEmpresa++;
  }
  return personasPorEmpresaId;
}

/**
 * Paso 6: Recursos (1-2 por Empresa). Sin unicidad server-side — el
 * script chequea por nombre dentro de la misma Empresa.
 * @param {Object<string, Object>} empresas Mapa razónSocial → Empresa.
 * @return {Promise<Object<string, Object[]>>} Mapa empresaId → Recursos.
 */
async function seedRecursos(empresas) {
  log("\n[6/15] Recursos");
  // Misma grafía que los Perfiles de Recurso de tipo "recurso" (ver
  // seedPerfilesRecurso): la clasificación de la Maquinaria se resuelve por
  // nombre mientras dure la transición del bloque 2.
  const tipos = CLASIFICACIONES_MAQUINARIA;

  const recursosPorEmpresaId = {};
  let indice = 0;
  const todos = await recursoRepository.list({});

  for (const [razonSocial, empresa] of Object.entries(empresas)) {
    recursosPorEmpresaId[empresa.id] = [];
    const cantidad = 1 + (indice % 2);

    for (let j = 0; j < cantidad; j++) {
      const tipo = tipos[(indice + j) % tipos.length];
      const nombre = `${tipo} ${j + 1} (${razonSocial})`;

      const creado = await seedItem(
          "Recurso", nombre,
          async () => todos.find((r) => r.nombre === nombre) || null,
          () => recursoService.crearRecurso({
            nombre, tipo, empresaId: empresa.id, estado: "activo",
            // Patente obligatoria (bloque 3), determinística por recurso.
            patente: `SEED${String(indice).padStart(2, "0")}${j + 1}`,
          }, ACTOR_FALSO),
      );
      if (creado) recursosPorEmpresaId[empresa.id].push(creado);
    }
    indice++;
  }
  return recursosPorEmpresaId;
}

/**
 * Paso 5b: una Persona con historial en DOS Empresas: se crea en
 * Transportes del Valle y se cambia a Ingeniería Cordillera (la relación
 * anterior queda finalizada). Idempotente.
 * @param {Object<string, Object>} empresas Mapa razónSocial → Empresa.
 * @return {Promise<void>}
 */
async function seedPersonaConHistorial(empresas) {
  log("\n[5b/15] Persona con historial en dos empresas");
  const origen = empresas["Transportes del Valle Ltda."];
  const destino = empresas["Ingeniería Cordillera SpA"];
  if (!origen || !destino) return;
  const rut = rutDesdeBase(90002999);
  const persona = await seedItem(
      "Persona", "Hugo Historial",
      () => personaRepository.getByRut(cleanRut(rut)),
      () => personaService.crearPersona({
        rut, nombre: "Hugo", apellido: "Historial", empresaId: origen.id,
        estado: "activo", tipoRelacion: "Trabajador", cargo: "Bodeguero",
        tipoContrato: "Plazo fijo", fechaInicio: "2025-03-01",
      }, ACTOR_FALSO),
  );
  if (!persona) return;
  const relaciones = await empresaPersonaRepository.listBySujeto(persona.id);
  if (relaciones.length >= 2) {
    resumen.omitidos.CambioEmpresa = (resumen.omitidos.CambioEmpresa || 0) + 1;
    return;
  }
  try {
    await empresaPersonaService.cambiarEmpresa(persona.id, {
      empresaId: destino.id, tipoRelacion: "Trabajador", cargo: "Supervisor",
      tipoContrato: "Indefinido", fechaInicio: "2026-01-05",
      // Termina la relación vigente con Transportes del Valle (confirmado).
      confirmado: true,
    }, ACTOR_FALSO);
    resumen.creados.CambioEmpresa = (resumen.creados.CambioEmpresa || 0) + 1;
    log("  ✓ Hugo Historial: Transportes del Valle → Ingeniería Cordillera");
  } catch (err) {
    resumen.fallidos.push({
      tipo: "CambioEmpresa", descripcion: "Hugo Historial", motivo: err.message,
    });
  }
}

/**
 * Paso 7: Perfiles de Participación (2 por Mandante).
 * @param {Object<string, Object>} mandantes Mapa nombreFantasia →
 *     Mandante.
 * @return {Promise<Object<string, Object>>} Mapa "nombre|mandante" →
 *     Perfil.
 */
async function seedPerfiles(mandantes) {
  log("\n[7/15] Perfiles de Participación");
  const perfiles = {};

  for (const [mandanteNombre, mandante] of Object.entries(mandantes)) {
    for (const nombrePerfil of ["Permanente", "Temporal"]) {
      const creado = await seedItem(
          "PerfilParticipacion", `${nombrePerfil} (${mandanteNombre})`,
          () => perfilParticipacionRepository.getByNombre(
              mandante.id, nombrePerfil,
          ),
          () => perfilParticipacionService.crearPerfil({
            nombre: nombrePerfil, mandanteId: mandante.id,
          }, ACTOR_FALSO),
      );
      if (creado) perfiles[`${nombrePerfil}|${mandanteNombre}`] = creado;
    }
  }
  return perfiles;
}

/**
 * Paso 7b: Perfiles de Recurso por Mandante — roles de Persona (Operador,
 * Trabajador) y las clasificaciones de Maquinaria que usan los Recursos.
 * @param {Object<string, Object>} mandantes Mapa nombreFantasia →
 *     Mandante.
 * @return {Promise<void>}
 */
async function seedPerfilesRecurso(mandantes) {
  log("\n[7b/15] Perfiles de Recurso");
  const datos = [
    ...ROLES_PERSONA.map((nombre) => ({tipo: "persona", nombre})),
    ...CLASIFICACIONES_MAQUINARIA.map((nombre) => ({tipo: "recurso", nombre})),
  ];
  for (const [mandanteNombre, mandante] of Object.entries(mandantes)) {
    for (const d of datos) {
      await seedItem(
          "PerfilRecurso", `${d.nombre} (${d.tipo}, ${mandanteNombre})`,
          () => perfilRecursoRepository.getByNombre(
              mandante.id, d.tipo, d.nombre,
          ),
          () => perfilRecursoService.crearPerfil({
            mandanteId: mandante.id, tipo: d.tipo, nombre: d.nombre,
          }, ACTOR_FALSO),
      );
    }
  }
}

/**
 * Pasos 8 y 9: Requerimientos de cada Mandante con su aplicabilidad. Cada
 * Requerimiento pertenece a un Mandante y se crea junto con sus vínculos
 * (requerimientoService.crearRequerimiento: una transacción, nunca queda
 * sin vínculos). Transemel no recibe estos genéricos: su catálogo real lo
 * carga seedRequerimientosTransemel.js.
 * @param {Object<string, Object>} perfiles Mapa "nombre|mandante" →
 *     Perfil de Participación.
 * @return {Promise<Object[]>} Requerimientos creados o ya existentes.
 */
async function seedRequerimientos(perfiles) {
  log("\n[8-9/15] Requerimientos y su aplicabilidad");
  // `perfiles`: a qué Perfiles de Participación aplica cada uno.
  const datos = [
    {
      nombre: "Certificado de Antecedentes", nombreCorto: "Antecedentes",
      tipoEntidad: "empresa", perfiles: ["Permanente", "Temporal"],
    },
    {
      nombre: "Licencia de Conducir Clase B", nombreCorto: "Licencia B",
      tipoEntidad: "persona", perfiles: ["Permanente", "Temporal"],
    },
    {
      nombre: "Examen Ocupacional", nombreCorto: "Examen ocupacional",
      tipoEntidad: "persona", perfiles: ["Temporal"],
    },
    {
      nombre: "Revisión Técnica", nombreCorto: "Revisión técnica",
      tipoEntidad: "recurso", perfiles: ["Permanente", "Temporal"],
      requiereVencimiento: true,
    },
    {
      nombre: "Póliza de Seguro", nombreCorto: "Póliza de seguro",
      tipoEntidad: "empresa", perfiles: ["Permanente"],
      requiereVencimiento: true,
    },
  ];

  // Perfiles de Participación agrupados por Mandante.
  const porMandante = {};
  for (const [clave, perfil] of Object.entries(perfiles)) {
    const [nombrePerfil, mandanteNombre] = clave.split("|");
    if (mandanteNombre === "Transemel") continue;
    if (!porMandante[perfil.mandanteId]) {
      porMandante[perfil.mandanteId] = {nombre: mandanteNombre, perfiles: {}};
    }
    porMandante[perfil.mandanteId].perfiles[nombrePerfil] = perfil;
  }

  const requerimientos = [];
  for (const [mandanteId, grupo] of Object.entries(porMandante)) {
    const existentes = await requerimientoRepository.list({mandanteId});
    for (const d of datos) {
      const perfilParticipacionIds = d.perfiles
          .map((nombre) => grupo.perfiles[nombre]?.id).filter(Boolean);
      if (perfilParticipacionIds.length === 0) continue;

      const item = await seedItem(
          "Requerimiento", `${d.nombre} (${grupo.nombre})`,
          async () => existentes.find((r) =>
            r.tipoEntidad === d.tipoEntidad &&
            normalizarNombre(r.nombre) === normalizarNombre(d.nombre)) ||
            null,
          () => requerimientoService.crearRequerimiento({
            mandanteId,
            nombre: d.nombre,
            nombreCorto: d.nombreCorto,
            tipoEntidad: d.tipoEntidad,
            requiereVencimiento: Boolean(d.requiereVencimiento),
            aplicabilidad: {perfilParticipacionIds, perfilRecursoIds: null},
          }, ACTOR_FALSO),
      );
      if (item) requerimientos.push(item);
    }
  }
  return requerimientos;
}

/**
 * Paso 10: Participaciones — cruza Empresas con Proyectos elegibles
 * (nunca finalizado/archivado) bajo un Perfil del mismo Mandante.
 * @param {Object<string, Object>} empresas Mapa razónSocial → Empresa.
 * @param {Object<string, Object>} proyectos Mapa nombre → Proyecto.
 * @param {Object<string, Object>} perfiles Mapa "nombre|mandante" →
 *     Perfil.
 * @return {Promise<Object<string, Object>>} Mapa descripción →
 *     Participación.
 */
async function seedParticipaciones(empresas, proyectos, perfiles) {
  log("\n[10/15] Participaciones");
  const specs = [
    {
      empresa: "Transportes del Valle Ltda.",
      proyecto: "Proyecto Planificado AND",
      perfil: "Permanente|Constructora Andina",
    },
    {
      empresa: "Ingeniería Cordillera SpA",
      proyecto: "Proyecto en Ejecución AND",
      perfil: "Temporal|Constructora Andina",
    },
    {
      empresa: "Servicios Industriales Maule Ltda.",
      proyecto: "Proyecto Planificado MIN",
      perfil: "Permanente|Minera del Sur",
    },
  ];

  const participaciones = {};
  for (const spec of specs) {
    const empresa = empresas[spec.empresa];
    const proyecto = proyectos[spec.proyecto];
    const perfil = perfiles[spec.perfil];
    const descripcion = `${spec.empresa} / ${spec.proyecto}`;

    if (!empresa || !proyecto || !perfil) {
      log(`  ✗ Participación: faltan dependencias para ` +
          `"${descripcion}", omitiendo.`);
      resumen.fallidos.push({
        tipo: "Participacion", descripcion, motivo: "Dependencia faltante.",
      });
      continue;
    }

    const creado = await seedItem(
        "Participacion", descripcion,
        () => participacionRepository.getActivaByProyectoYEmpresa(
            proyecto.id, empresa.id,
        ),
        () => participacionService.crearParticipacion({
          proyectoId: proyecto.id,
          empresaId: empresa.id,
          perfilParticipacionId: perfil.id,
          fechaInicio: "2026-02-01",
        }, ACTOR_FALSO),
    );
    if (creado) participaciones[descripcion] = creado;
  }
  return participaciones;
}

/**
 * Asigna a una Participación una Persona (uno o varios Perfiles de
 * Recurso) o una Maquinaria (un perfil), de forma idempotente: solo crea
 * los perfiles que todavía no tiene activos ahí.
 * @param {Object} participacion Participación destino.
 * @param {"persona"|"recurso"} tipo Tipo del sujeto.
 * @param {Object} sujeto Persona o Recurso.
 * @param {string[]} nombresPerfiles Nombres de Perfiles de Recurso.
 * @param {string} descripcion Descripción para el resumen.
 * @return {Promise<void>}
 */
async function asignarSujeto(participacion, tipo, sujeto, nombresPerfiles,
    descripcion) {
  const servicio = tipo === "persona" ?
      participacionPersonaService : participacionRecursoService;
  const campo = tipo === "persona" ? "personaId" : "recursoId";
  const perfiles = [];
  for (const nombre of nombresPerfiles) {
    const perfil = await perfilRecursoRepository.getByNombre(
        participacion.mandanteId, tipo, nombre,
    );
    if (perfil) perfiles.push(perfil);
  }
  if (perfiles.length !== nombresPerfiles.length) {
    resumen.fallidos.push({
      tipo: tipo === "persona" ?
          "ParticipacionPersona" : "ParticipacionRecurso",
      descripcion,
      motivo: `Perfil de Recurso inexistente: ${nombresPerfiles.join(", ")}`,
    });
    return;
  }
  const activos = await servicio.repo.list({
    participacionId: participacion.id, [campo]: sujeto.id, estado: "activa",
  });
  const yaTiene = new Set(activos.map((a) => a.perfilRecursoId));
  for (const perfil of perfiles) {
    await seedItem(
        tipo === "persona" ? "ParticipacionPersona" : "ParticipacionRecurso",
        `${descripcion} — ${perfil.nombre}`,
        async () => (yaTiene.has(perfil.id) ? {id: perfil.id} : null),
        async () => (await servicio.crear({
          participacionId: participacion.id,
          [campo]: sujeto.id,
          perfilRecursoIds: [perfil.id],
          fechaInicio: "2026-02-01",
        }, ACTOR_FALSO))[0],
    );
  }
}

/**
 * Paso 10b: Personas y Maquinarias de cada Participación
 * (participacionPersonas / participacionRecursos). La primera Persona de
 * la primera Participación tiene DOS perfiles (Operador + Trabajador); las
 * demás, uno. Cada Maquinaria toma el Perfil de Recurso de su
 * clasificación.
 * @param {Object<string, Object>} participaciones Mapa descripción →
 *     Participación.
 * @param {Object<string, Object[]>} personasPorEmpresaId Personas por
 *     empresaId.
 * @param {Object<string, Object[]>} recursosPorEmpresaId Recursos por
 *     empresaId.
 * @return {Promise<void>}
 */
async function seedAsignaciones(
    participaciones, personasPorEmpresaId, recursosPorEmpresaId,
) {
  log("\n[10b/15] Personas y Maquinarias de cada Participación");
  let primera = true;
  for (const [descripcion, participacion] of Object.entries(participaciones)) {
    const personas = personasPorEmpresaId[participacion.empresaId] || [];
    for (const [i, persona] of personas.entries()) {
      let perfiles = ["Trabajador"];
      if (i === 0) {
        perfiles = primera ? ["Operador", "Trabajador"] : ["Operador"];
      }
      await asignarSujeto(
          participacion, "persona", persona, perfiles,
          `${persona.nombre} ${persona.apellido} / ${descripcion}`,
      );
    }
    for (const recurso of recursosPorEmpresaId[participacion.empresaId] || []) {
      await asignarSujeto(
          participacion, "recurso", recurso, [recurso.tipo],
          `${recurso.nombre} / ${descripcion}`,
      );
    }
    primera = false;
  }
}

/**
 * Paso 16: un Expediente CERRADO con Evaluaciones (para verificar que los
 * cambios de vínculos no lo tocan). Logística Puerto Sur SpA en el
 * Proyecto en Ejecución AND, con una Persona y una Maquinaria: se evalúa
 * todo "cumple", queda aprobado y se pasa a en_ejecucion → cerrado.
 * Idempotente: si la Participación ya existe, se omite completo.
 * @param {Object<string, Object>} empresas Mapa razónSocial → Empresa.
 * @param {Object<string, Object>} proyectos Mapa nombre → Proyecto.
 * @param {Object<string, Object>} perfiles Mapa "nombre|mandante" → Perfil.
 * @param {Object<string, Object[]>} personasPorEmpresaId Personas.
 * @param {Object<string, Object[]>} recursosPorEmpresaId Recursos.
 * @param {?Object} evaluador Usuario evaluador.
 * @return {Promise<void>}
 */
async function seedExpedienteCerrado(
    empresas, proyectos, perfiles, personasPorEmpresaId, recursosPorEmpresaId,
    evaluador,
) {
  log("\n[16/16] Expediente cerrado con evaluaciones");
  const empresa = empresas["Logística Puerto Sur SpA"];
  const proyecto = proyectos["Proyecto en Ejecución AND"];
  const perfil = perfiles["Permanente|Constructora Andina"];
  if (!empresa || !proyecto || !perfil || !evaluador) {
    resumen.fallidos.push({
      tipo: "ExpedienteCerrado", descripcion: "Logística Puerto Sur SpA",
      motivo: "Dependencia faltante.",
    });
    return;
  }
  const existente = await participacionRepository.getActivaByProyectoYEmpresa(
      proyecto.id, empresa.id,
  );
  if (existente) {
    resumen.omitidos.ExpedienteCerrado =
        (resumen.omitidos.ExpedienteCerrado || 0) + 1;
    log("  · Expediente cerrado: ya existe la Participación, se omite.");
    return;
  }
  try {
    const participacion = await participacionService.crearParticipacion({
      proyectoId: proyecto.id,
      empresaId: empresa.id,
      perfilParticipacionId: perfil.id,
      fechaInicio: "2026-02-01",
    }, ACTOR_FALSO);
    const persona = (personasPorEmpresaId[empresa.id] || [])[0];
    const recurso = (recursosPorEmpresaId[empresa.id] || [])[0];
    if (persona) {
      await asignarSujeto(participacion, "persona", persona, ["Trabajador"],
          `${persona.nombre} / cerrado`);
    }
    if (recurso) {
      await asignarSujeto(participacion, "recurso", recurso, [recurso.tipo],
          `${recurso.nombre} / cerrado`);
    }
    const expediente = await expedienteService.crearExpediente(
        {participacionId: participacion.id}, ACTOR_FALSO,
    );
    const actorEvaluador = {
      rol: "evaluador", mandanteId: null, uid: evaluador.id,
      email: evaluador.email,
    };
    const instancias =
        await expedienteRequerimientoService.listarDeExpediente(expediente.id);
    for (const instancia of instancias) {
      await evaluacionService.crearEvaluacion(payloadEvaluacion(
          instancia, "cumple", [], "[SEED] Expediente cerrado.",
      ), actorEvaluador);
    }
    // Historial completo: los estados automáticos de las evaluaciones,
    // "Iniciar ejecución" y el cierre manual (finaliza la Participación).
    await expedienteService.iniciarEjecucion(expediente.id, ACTOR_FALSO);
    await expedienteService.cerrar(expediente.id, {
      motivo: "salida_empresa", detalle: "[SEED] Término de contrato.",
    }, ACTOR_FALSO);
    resumen.creados.ExpedienteCerrado =
        (resumen.creados.ExpedienteCerrado || 0) + 1;
    log(`  ✓ Expediente cerrado: ${expediente.id}`);
  } catch (err) {
    log(`  ✗ Expediente cerrado: ${err.message}`);
    resumen.fallidos.push({
      tipo: "ExpedienteCerrado", descripcion: "Logística Puerto Sur SpA",
      motivo: err.message,
    });
  }
}

/**
 * Paso 17: Expediente en ejecución con un requisito vencido. Se evalúa todo
 * como "Cumple" (vence en 2027), se inicia la ejecución y luego se reevalúa
 * un requisito con vencimiento con una fecha pasada: el estado se mantiene
 * en ejecución y el resumen cuenta 1 vencido (la alerta del detalle).
 * @param {Object<string, Object>} empresas Mapa razónSocial → Empresa.
 * @param {Object<string, Object>} proyectos Mapa nombre → Proyecto.
 * @param {Object<string, Object>} perfiles Mapa "nombre|mandante" → Perfil.
 * @param {Object<string, Object[]>} personasPorEmpresaId Personas.
 * @param {Object<string, Object[]>} recursosPorEmpresaId Maquinarias.
 * @param {?Object} evaluador Usuario evaluador ya sembrado.
 * @return {Promise<void>}
 */
async function seedExpedienteEnEjecucionConVencido(
    empresas, proyectos, perfiles, personasPorEmpresaId, recursosPorEmpresaId,
    evaluador,
) {
  log("\n[17/17] Expediente en ejecución con un vencido");
  const empresa = empresas["Transportes del Valle Ltda."];
  const proyecto = proyectos["Proyecto en Ejecución AND"];
  const perfil = perfiles["Permanente|Constructora Andina"];
  const tipo = "ExpedienteEnEjecucion";
  if (!empresa || !proyecto || !perfil || !evaluador) {
    resumen.fallidos.push({
      tipo, descripcion: "Transportes del Valle Ltda.",
      motivo: "Dependencia faltante.",
    });
    return;
  }
  const existente = await participacionRepository.getActivaByProyectoYEmpresa(
      proyecto.id, empresa.id,
  );
  if (existente) {
    resumen.omitidos[tipo] = (resumen.omitidos[tipo] || 0) + 1;
    log("  · Expediente en ejecución: ya existe la Participación, se omite.");
    return;
  }
  try {
    const participacion = await participacionService.crearParticipacion({
      proyectoId: proyecto.id,
      empresaId: empresa.id,
      perfilParticipacionId: perfil.id,
      fechaInicio: "2026-03-01",
    }, ACTOR_FALSO);
    const persona = (personasPorEmpresaId[empresa.id] || [])[0];
    const recurso = (recursosPorEmpresaId[empresa.id] || [])[0];
    if (persona) {
      await asignarSujeto(participacion, "persona", persona, ["Trabajador"],
          `${persona.nombre} / en ejecución`);
    }
    if (recurso) {
      await asignarSujeto(participacion, "recurso", recurso, [recurso.tipo],
          `${recurso.nombre} / en ejecución`);
    }
    const expediente = await expedienteService.crearExpediente(
        {participacionId: participacion.id}, ACTOR_FALSO,
    );
    const actorEvaluador = {
      rol: "evaluador", mandanteId: null, uid: evaluador.id,
      email: evaluador.email,
    };
    const instancias =
        await expedienteRequerimientoService.listarDeExpediente(expediente.id);
    for (const instancia of instancias) {
      await evaluacionService.crearEvaluacion(payloadEvaluacion(
          instancia, "cumple", [], "[SEED] Expediente en ejecución.",
      ), actorEvaluador);
    }
    await expedienteService.iniciarEjecucion(expediente.id, ACTOR_FALSO);
    const conVencimiento = instancias.find((i) => i.requiereVencimiento);
    if (conVencimiento) {
      await evaluacionService.crearEvaluacion({
        ...payloadEvaluacion(conVencimiento, "cumple", [],
            "[SEED] Documento vencido."),
        fechaVencimiento: "2026-01-31",
      }, actorEvaluador);
    } else {
      log("  · Sin requisitos con vencimiento: queda sin vencidos.");
    }
    resumen.creados[tipo] = (resumen.creados[tipo] || 0) + 1;
    log(`  ✓ Expediente en ejecución: ${expediente.id}`);
  } catch (err) {
    log(`  ✗ Expediente en ejecución: ${err.message}`);
    resumen.fallidos.push({
      tipo, descripcion: "Transportes del Valle Ltda.", motivo: err.message,
    });
  }
}

/**
 * Paso 11: Expedientes — uno por Participación, con sus instancias de
 * Requerimiento generadas.
 * @param {Object<string, Object>} participaciones Mapa descripción →
 *     Participación.
 * @return {Promise<Object<string, Object>>} Mapa descripción →
 *     Expediente.
 */
async function seedExpedientes(participaciones) {
  log("\n[11/15] Expedientes");
  const expedientes = {};

  for (const [descripcion, participacion] of Object.entries(participaciones)) {
    const creado = await seedItem(
        "Expediente", descripcion,
        async () => {
          const existentes = await expedienteRepository.getByParticipacion(
              participacion.id,
          );
          return existentes.find((e) => e.estado !== "cerrado") || null;
        },
        () => expedienteService.crearExpediente({
          participacionId: participacion.id,
        }, ACTOR_FALSO),
    );
    if (creado) expedientes[descripcion] = creado;
  }
  return expedientes;
}

/**
 * Pasos 12-13: Evidencias + Evidencia-Requerimiento (el vínculo se crea
 * inmediatamente después de cada Evidencia, igual que la UI real). Una por
 * nivel (empresa / persona / maquinaria) en cada Expediente, enlazada a la
 * primera instancia activa de ese nivel y con el sujeto de esa instancia.
 * @param {Object<string, Object>} expedientes Mapa descripción →
 *     Expediente.
 * @return {Promise<Object<string, string[]>>} Mapa
 *     expedienteRequerimientoId → [evidenciaId, ...].
 */
async function seedEvidencias(expedientes) {
  log("\n[12-13/15] Evidencias y Evidencia-Requerimiento");
  const evidenciasPorInstancia = {};
  let vencimientosAsignados = 0;

  for (const [descripcion, expediente] of Object.entries(expedientes)) {
    const instancias =
        await expedienteRequerimientoService.listarDeExpediente(expediente.id);
    const porNivel = {empresa: null, persona: null, recurso: null};
    for (const i of instancias) {
      if (!porNivel[i.tipoEntidad]) porNivel[i.tipoEntidad] = i;
    }

    for (const instancia of Object.values(porNivel)) {
      if (!instancia) continue;

      const nombreCorto = instancia.nombre.replace("[SEED] ", "");
      const archivoNombre = `[SEED] ${nombreCorto} - ${descripcion}.pdf`;
      const payload = {
        expedienteId: expediente.id,
        personaId: instancia.personaId || undefined,
        recursoId: instancia.recursoId || undefined,
        archivoUrl: "https://storage.googleapis.com/smartone-v3." +
            `appspot.com/seed/${encodeURIComponent(archivoNombre)}`,
        archivoNombre,
        archivoTipo: "application/pdf",
      };

      if (vencimientosAsignados < 2) {
        const dias = vencimientosAsignados === 0 ? 15 : 25;
        const fecha = new Date();
        fecha.setDate(fecha.getDate() + dias);
        payload.fechaVencimiento = fecha.toISOString().slice(0, 10);
        vencimientosAsignados++;
      }

      const evidencia = await seedItem(
          "Evidencia", archivoNombre,
          async () => {
            const activas = await evidenciaRepository.getActivasByExpediente(
                expediente.id,
            );
            return activas.find((e) => e.archivoNombre === archivoNombre) ||
                null;
          },
          () => evidenciaService.crearEvidencia(payload, ACTOR_FALSO),
      );
      if (!evidencia) continue;

      await seedItem(
          "EvidenciaRequerimiento",
          `${archivoNombre} ↔ ${instancia.nombre}`,
          () => evidenciaRequerimientoRepository.getByEvidenciaEInstancia(
              evidencia.id, instancia.id,
          ),
          () => evidenciaRequerimientoService.crearVinculo({
            evidenciaId: evidencia.id,
            expedienteRequerimientoId: instancia.id,
          }, ACTOR_FALSO),
      );

      if (!evidenciasPorInstancia[instancia.id]) {
        evidenciasPorInstancia[instancia.id] = [];
      }
      evidenciasPorInstancia[instancia.id].push(evidencia.id);
    }
  }
  return evidenciasPorInstancia;
}

/**
 * Datos de una Evaluación de prueba para una instancia: con evidencia es
 * "documental"; sin ella, "presencial" con justificación.
 * @param {Object} instancia Instancia de Requerimiento.
 * @param {string} resultado Resultado.
 * @param {string[]} evidenciaIds Evidencias enlazadas a la instancia.
 * @param {string} observaciones Observaciones.
 * @return {Object} Payload para evaluacionService.crearEvaluacion.
 */
function payloadEvaluacion(instancia, resultado, evidenciaIds, observaciones) {
  return {
    expedienteRequerimientoId: instancia.id,
    resultado,
    observaciones,
    metodoVerificacion: evidenciaIds.length ? "documental" : "presencial",
    fechaVencimiento: instancia.requiereVencimiento && resultado === "cumple" ?
        "2027-12-31" : null,
    evidenciaIds,
  };
}

/**
 * Pasos 14-15: Evaluaciones + Evaluación-Evidencia (el vínculo se crea
 * dentro de la misma llamada a crearEvaluacion, vía evidenciaIds). Deja al
 * menos una instancia sin evaluar por Expediente. En el primer Expediente
 * reevalúa una instancia: queda una Evaluación vigente y una reemplazada.
 * @param {Object<string, Object>} expedientes Mapa descripción →
 *     Expediente.
 * @param {Object<string, string[]>} evidenciasPorInstancia Mapa
 *     expedienteRequerimientoId → [evidenciaId, ...].
 * @param {?Object} evaluador Usuario evaluador ya sembrado.
 * @return {Promise<void>}
 */
async function seedEvaluaciones(expedientes, evidenciasPorInstancia,
    evaluador) {
  log("\n[14-15/15] Evaluaciones");
  if (!evaluador) {
    log("  ✗ No hay usuario evaluador disponible, se omite este paso.");
    return;
  }

  const actorEvaluador = {
    rol: "evaluador",
    mandanteId: null,
    uid: evaluador.id,
    email: evaluador.email,
  };
  const resultadosCiclo = ["cumple", "no_cumple", "pendiente"];
  let primero = true;

  for (const [descripcion, expediente] of Object.entries(expedientes)) {
    const instancias =
        await expedienteRequerimientoService.listarDeExpediente(expediente.id);
    if (instancias.length === 0) continue;

    // Prefiere las instancias con evidencia; nunca más de 2, y siempre deja
    // al menos una sin evaluar.
    const ordenadas = [
      ...instancias.filter((i) => evidenciasPorInstancia[i.id]),
      ...instancias.filter((i) => !evidenciasPorInstancia[i.id]),
    ];
    const aEvaluar = ordenadas.slice(
        0, Math.min(2, Math.max(0, instancias.length - 1)),
    );

    for (let idx = 0; idx < aEvaluar.length; idx++) {
      const instancia = aEvaluar[idx];
      const resultado = resultadosCiclo[idx % resultadosCiclo.length];
      const evidenciaIds = evidenciasPorInstancia[instancia.id] || [];
      await seedItem(
          "Evaluacion",
          `${descripcion} — ${instancia.nombre} (${resultado})`,
          async () => (instancia.evaluacionVigenteId ?
              {id: instancia.evaluacionVigenteId} : null),
          () => evaluacionService.crearEvaluacion(payloadEvaluacion(
              instancia, resultado, evidenciaIds,
              `[SEED] Evaluación de prueba — resultado: ${resultado}.`,
          ), actorEvaluador),
      );
    }

    // Reevaluación: la primera Evaluación del primer Expediente queda
    // "reemplazada" por una nueva vigente.
    if (primero && aEvaluar.length) {
      primero = false;
      const instancia = aEvaluar[0];
      const evaluaciones = await evaluacionRepository.getByExpediente(
          expediente.id,
      );
      const yaReemplazada = evaluaciones.find((e) =>
        e.expedienteRequerimientoId === instancia.id &&
        e.estado === "reemplazada",
      );
      await seedItem(
          "Reevaluacion", `${descripcion} — ${instancia.nombre}`,
          async () => yaReemplazada || null,
          () => evaluacionService.crearEvaluacion(payloadEvaluacion(
              instancia, "cumple", evidenciasPorInstancia[instancia.id] || [],
              "[SEED] Reevaluación de prueba.",
          ), actorEvaluador),
      );
    }
  }
}

/**
 * Paso 15b: un Requerimiento agregado manualmente (regla del Expediente) y
 * una instancia retirada. La regla manual se agrega al primer Expediente
 * abierto con un Requerimiento de Persona que su Perfil no configura. Las
 * instancias retiradas salen de agregar y luego quitar una regla manual en
 * otro Expediente abierto (pasan a "retirado", sin borrarse). Idempotente.
 * @param {Object<string, Object>} expedientes Mapa descripción →
 *     Expediente.
 * @param {Object[]} requerimientos Requerimientos del seed (de todos sus
 *     Mandantes).
 * @return {Promise<void>}
 */
async function seedManualYRetirada(expedientes, requerimientos) {
  log("\n[15b/15] Requerimiento manual e instancia retirada");
  const lista = Object.entries(expedientes);
  if (lista.length < 2) return;

  // Requerimiento del Mandante del Expediente que su Perfil no exige.
  const libreDe = async (expediente) => {
    const configurados = new Set((await requerimientoCalculoService
        .calcularRequerimientosAplicables(expediente.perfilParticipacionId))
        .map((r) => r.requerimientoId));
    return requerimientos.find((r) =>
      r.mandanteId === expediente.mandanteId && !configurados.has(r.id));
  };

  const [descManual, expManual] = lista[0];
  await seedItem(
      "RequerimientoManual", descManual,
      async () => {
        const actual = await expedienteRepository.getById(expManual.id);
        return (actual.requerimientosManuales || [])[0] || null;
      },
      async () => {
        const manual = await libreDe(expManual);
        if (!manual) throw new Error("No hay un Requerimiento libre.");
        return expedienteService.agregarRequerimiento(
            expManual.id, manual.id, ACTOR_FALSO,
        );
      },
  );

  const [descRetiro, expRetiro] = lista[1];
  await seedItem(
      "InstanciaRetirada", descRetiro,
      async () => (await expedienteRequerimientoService.listarDeExpediente(
          expRetiro.id, {estado: "retirado"},
      ))[0] || null,
      async () => {
        const libre = await libreDe(expRetiro);
        if (!libre) throw new Error("No hay un Requerimiento libre.");
        await expedienteService.agregarRequerimiento(
            expRetiro.id, libre.id, ACTOR_FALSO,
        );
        await expedienteService.quitarRequerimiento(
            expRetiro.id, libre.id, ACTOR_FALSO,
        );
        return (await expedienteRequerimientoService.listarDeExpediente(
            expRetiro.id, {estado: "retirado"},
        ))[0];
      },
  );
}

/**
 * Imprime el resumen final: creados/omitidos/fallidos por tipo, y las
 * credenciales de los usuarios de prueba.
 * @param {Object<string, Object>} usuarios Mapa email → Usuario creado.
 * @return {void}
 */
function imprimirResumen(usuarios) {
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

  log(`\n=== CREDENCIALES DE PRUEBA (password: ${PASSWORD_PRUEBA}) ===`);
  EMAILS_USUARIOS.forEach((email) => {
    const marca = usuarios[email] ? "✓" : "?";
    log(`  ${marca} ${email}`);
  });
  log(
      "\nSuperadmin: clepez@gmail.com " +
      "(sin cambios, definido en seedSuperAdmin.js)",
  );
}

/**
 * Punto de entrada: ejecuta los 15 pasos en orden.
 * @return {Promise<void>}
 */
async function main() {
  log("=== SmartOne v3 — Seed de datos de prueba ===");
  const modo = process.env.USE_EMULATOR === "true" ?
      "EMULADOR" :
      "PROYECTO REAL (smartone-v3)";
  log(`Modo: ${modo}`);

  const mandantes = await seedMandantes();
  const usuarios = await seedUsuarios(mandantes);
  const proyectos = await seedProyectos(mandantes);
  const empresas = await seedEmpresas(mandantes);
  const personasPorEmpresaId = await seedPersonas(empresas);
  const recursosPorEmpresaId = await seedRecursos(empresas);
  await seedPersonaConHistorial(empresas);
  const perfiles = await seedPerfiles(mandantes);
  await seedPerfilesRecurso(mandantes);
  const requerimientos = await seedRequerimientos(perfiles);
  const participaciones = await seedParticipaciones(
      empresas, proyectos, perfiles,
  );
  await seedAsignaciones(
      participaciones, personasPorEmpresaId, recursosPorEmpresaId,
  );
  const expedientes = await seedExpedientes(participaciones);
  const evidenciasPorInstancia = await seedEvidencias(expedientes);
  const evaluador = usuarios["evaluador@seed.smartone.cl"];
  await seedEvaluaciones(expedientes, evidenciasPorInstancia, evaluador);
  await seedManualYRetirada(expedientes, requerimientos);
  await seedExpedienteCerrado(
      empresas, proyectos, perfiles, personasPorEmpresaId,
      recursosPorEmpresaId, evaluador,
  );
  await seedExpedienteEnEjecucionConVencido(
      empresas, proyectos, perfiles, personasPorEmpresaId,
      recursosPorEmpresaId, evaluador,
  );

  imprimirResumen(usuarios);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error fatal en el script de seed:", err);
      process.exit(1);
    });
