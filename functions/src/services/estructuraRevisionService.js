const plantillaEstructuraService = require("./plantillaEstructuraService");
const aiConfigService = require("./aiConfigService");
const costoService = require("./costoService");
const reglas = require("./reglasService");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const empresaMandanteRepository =
    require("../repositories/empresaMandanteRepository");
const empresaRepository = require("../repositories/empresaRepository");
const empresaPersonaRepository =
    require("../repositories/empresaPersonaRepository");
const personaRepository = require("../repositories/personaRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const {cleanRut} = require("../utils/rutValidator");
const {similitudNombres} = require("../utils/estructuraCalce");
const {
  analizarArbol, analizarLibre, claveEntidad, puntajeEstructura,
} = require("../utils/estructuraPlan");
const {calcularAlcance} = require("../utils/alcanceValidacion");
const {ajustarPlanAExpediente} = require("../utils/revisionExpediente");
const {clasificarVencimiento, hoySantiago} = require("../utils/vencimientos");
const expedienteService = require("./expedienteService");
const configRevisionExpedienteRepository =
    require("../repositories/configRevisionExpedienteRepository");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const AppError = require("../utils/AppError");

const UMBRAL_ENLACE = 0.6;
const UMBRAL_ENLACE_EMPRESA = 0.75;
const MAX_ARCHIVOS_ARBOL = 20000;
const MAX_PROFUNDIDAD = 6;

/**
 * Cuenta archivos y verifica la profundidad del árbol recibido.
 * @param {Object} nodo Carpeta.
 * @param {number} nivel Nivel actual.
 * @return {number} Archivos bajo el nodo.
 */
function contarArbol(nodo, nivel = 0) {
  if (!nodo || typeof nodo !== "object" || typeof nodo.nombre !== "string") {
    throw new AppError(400, "El árbol de carpetas no es válido.");
  }
  if (nivel > MAX_PROFUNDIDAD) return 0;
  return (nodo.archivos || []).length + (nodo.carpetas || [])
      .reduce((s, h) => s + contarArbol(h, nivel + 1), 0);
}

const nombrePersona = (p) => `${p.nombre || ""} ${p.apellido || ""}`.trim();

/**
 * Empresa sugerida por el nombre detectado en la carpeta: la más parecida
 * con similitud de al menos UMBRAL_ENLACE_EMPRESA (más estricto que el de
 * personas: un enlace de empresa equivocado arrastra todo el expediente).
 * Bajo el umbral no se sugiere nada y el usuario elige.
 * @param {?string} nombreDetectado Nombre de la empresa en la carpeta.
 * @param {Object[]} empresas Empresas del Mandante.
 * @return {?{empresa: Object, similitud: number, por: string}} Sugerencia.
 */
function empresaPorNombre(nombreDetectado, empresas) {
  let mejor = null;
  (empresas || []).forEach((e) => {
    const similitud = Math.max(
        similitudNombres(nombreDetectado, e.razonSocial),
        similitudNombres(nombreDetectado, e.nombreFantasia),
        reglas.coincideNombre(nombreDetectado,
            e.nombreFantasia || e.razonSocial) ? 1 : 0,
    );
    if (similitud >= UMBRAL_ENLACE_EMPRESA &&
        (!mejor || similitud > mejor.similitud)) {
      mejor = {empresa: e, similitud, por: "nombre"};
    }
  });
  return mejor;
}

/**
 * Plan de revisión de una carpeta contra la plantilla activa del Mandante:
 * empresas detectadas con su enlace sugerido (Empresa y Expediente),
 * completitud por sección y entidad, personas con su enlace sugerido y los
 * archivos que irían a la IA (solo tipos normalizados y no sensibles). No
 * persiste nada. La misma función servirá para SharePoint (árbol armado
 * desde Microsoft Graph en vez del navegador).
 */
class EstructuraRevisionService {
  /**
   * Sugerencia de Empresa (por RUT en la carpeta o por nombre) y sus
   * Expedientes abiertos ordenados por similitud con el texto del proyecto.
   * @param {Object} empresaPlan Empresa del plan.
   * @param {Object[]} empresas Empresas del Mandante.
   * @param {string} mandanteId Mandante.
   * @return {Promise<?Object>} Enlace sugerido o null.
   */
  async _enlaceEmpresa(empresaPlan, empresas, mandanteId) {
    let mejor = null;
    if (empresaPlan.runCarpeta) {
      const rut = cleanRut(empresaPlan.runCarpeta);
      const e = empresas.find((x) => cleanRut(x.rut || "") === rut);
      if (e) mejor = {empresa: e, similitud: 1, por: "rut"};
    }
    if (!mejor) {
      mejor = empresaPorNombre(empresaPlan.nombreEmpresaDetectado, empresas);
    }
    if (!mejor) return null;
    return {
      empresaId: mejor.empresa.id,
      empresaNombre: mejor.empresa.razonSocial,
      similitud: mejor.similitud,
      por: mejor.por,
      expedientes: await this._expedientesDe(mejor.empresa.id, mandanteId,
          empresaPlan.textoProyecto),
    };
  }

  /**
   * Expedientes abiertos de una Empresa en el Mandante, ordenados por
   * similitud del proyecto.
   * @param {string} empresaId Empresa.
   * @param {string} mandanteId Mandante.
   * @param {?string} textoProyecto Texto del proyecto en la carpeta.
   * @return {Promise<Object[]>} Expedientes.
   */
  async _expedientesDe(empresaId, mandanteId, textoProyecto) {
    const expedientes = (await expedienteRepository.getByEmpresa(empresaId))
        .filter((x) => x.mandanteId === mandanteId && x.estado !== "cerrado");
    const proyectos = new Map((await proyectoRepository.getByIds(
        expedientes.map((x) => x.proyectoId))).map((p) => [p.id, p]));
    return expedientes.map((x) => {
      const p = proyectos.get(x.proyectoId);
      return {
        expedienteId: x.id, proyectoId: x.proyectoId,
        proyectoNombre: p ? [p.codigo, p.nombre].filter(Boolean).join(" · ") :
          x.proyectoId,
        estado: x.estado,
        similitudProyecto: textoProyecto && p ?
          Math.max(similitudNombres(textoProyecto, p.nombre),
              similitudNombres(textoProyecto, p.codigo)) : null,
      };
    }).sort((a, b) => (b.similitudProyecto || 0) - (a.similitudProyecto || 0));
  }

  /**
   * Persona sugerida para cada entidad persona: por RUT en el nombre de la
   * carpeta o por nombre entre las personas vinculadas a la Empresa.
   * @param {Object[]} entidades Entidades del plan.
   * @param {?string} empresaId Empresa (confirmada o sugerida).
   * @return {Promise<Map<string, ?Object>>} entidadCarpeta → sugerencia.
   */
  async _personasSugeridas(entidades, empresaId) {
    const personas = entidades.filter((e) => e.entidadTipo === "persona");
    const resultado = new Map();
    if (!personas.length) return resultado;
    const vinculadas = empresaId ? await personaRepository.getByIds(
        (await empresaPersonaRepository.listActivasByEmpresa(empresaId))
            .map((r) => r.personaId)) : [];
    for (const e of personas) {
      let sugerida = null;
      if (e.runCarpeta) {
        // eslint-disable-next-line no-await-in-loop
        const p = await personaRepository.getByRut(cleanRut(e.runCarpeta));
        if (p) {
          sugerida = {personaId: p.id, nombre: nombrePersona(p), por: "rut",
            similitud: 1};
        }
      }
      if (!sugerida) {
        vinculadas.forEach((p) => {
          const nombre = nombrePersona(p);
          const similitud = reglas.coincideNombre(e.entidadNombre, nombre) ?
            Math.max(similitudNombres(e.entidadNombre, nombre), UMBRAL_ENLACE) :
            0;
          if (similitud && (!sugerida || similitud > sugerida.similitud)) {
            sugerida = {personaId: p.id, nombre, por: "nombre", similitud};
          }
        });
      }
      resultado.set(e.entidadCarpeta, sugerida);
    }
    return resultado;
  }

  /**
   * Plan contra UN Expediente (pestaña Revisiones IA del Expediente): la
   * empresa y el expediente quedan fijos, las personas se calzan solo con
   * las del Expediente y a la IA van solo los tipos de los requerimientos
   * pedidos (habilitados en su configuración).
   * @param {Object} entrada {plan, cabecera, mandanteId, expedienteId,
   *     requerimientoIds, omitirValidados, libre}.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plan con `expediente`: {expedienteId,
   *     requerimientoIds, personasSinCarpeta, carpetasSinPersona,
   *     omitidosValidados, personasPorEntidad}.
   */
  async _planExpediente({plan, cabecera, mandanteId, expedienteId,
    requerimientoIds, omitirValidados, libre}, actor) {
    const expediente = await expedienteService.getExpedienteById(
        expedienteId, actor);
    if (expediente.mandanteId !== mandanteId) {
      throw new AppError(400, "El expediente no es de este Mandante.");
    }
    if (plan.tipo === "repositorio") {
      throw new AppError(409, "Elija la carpeta de esta empresa, no el " +
          "repositorio.");
    }
    const config = await configRevisionExpedienteRepository.get(expedienteId);
    const habilitados = new Set(config?.requerimientosIA || []);
    const conPedido = Array.isArray(requerimientoIds) &&
        requerimientoIds.length > 0;
    const pedidos = (conPedido ? requerimientoIds.map(String) :
      [...habilitados])
        .filter((id) => habilitados.has(id));
    if (!pedidos.length) {
      throw new AppError(409, "No hay requerimientos habilitados para IA en " +
          "este expediente.");
    }
    const [requerimientos, tiposDocumentales, participantes, instancias,
      empresa] = await Promise.all([
      requerimientoRepository.getByIds(pedidos),
      tipoDocumentalRepository.list(),
      participacionPersonaRepository.list({
        participacionId: expediente.participacionId, estado: "activa"}),
      expedienteRequerimientoRepository.listByExpediente(expedienteId,
          "activo"),
      empresaRepository.getById(expediente.empresaId),
    ]);
    const tipoPorId = new Map(tiposDocumentales.map((t) => [t.id, t]));
    const codigoPorRequerimiento = new Map(requerimientos
        .filter((r) => tipoPorId.get(r.tipoDocumentalId))
        .map((r) => [r.id, tipoPorId.get(r.tipoDocumentalId).codigo]));
    const personas = await personaRepository.getByIds(
        [...new Set(participantes.map((p) => p.personaId))]);
    const {validados, todosValidados} = validadosDe(
        instancias.filter((i) => i.personaId &&
          codigoPorRequerimiento.has(i.requerimientoId)),
        codigoPorRequerimiento);
    const principal = plan.empresas.find((e) => !e.esSubcontrato) ||
        plan.empresas[0];
    const ajuste = ajustarPlanAExpediente({
      empresa: principal, personas,
      codigos: new Set(codigoPorRequerimiento.values()), libre,
      validados, todosValidados, omitirValidados,
    });
    const empresaPlan = {
      ...ajuste.empresa,
      enlaceSugerido: {
        empresaId: expediente.empresaId,
        empresaNombre: empresa?.razonSocial || null,
        similitud: 1, por: "expediente",
        expedientes: [{expedienteId, proyectoId: expediente.proyectoId,
          estado: expediente.estado}],
      },
    };
    const [parametros, gasto] = await Promise.all([
      aiConfigService.obtenerParametros(),
      aiConfigService.gastoMes().catch(() => null),
    ]);
    const {modeloPorDefecto: modelo, preciosPorModelo} = parametros;
    const faltanPrecios = costoService.faltanPrecios(preciosPorModelo, modelo);
    const detalle = costoService.detalleEstimacion(preciosPorModelo, modelo,
        empresaPlan.archivosIA);
    const limite = parametros.limiteGastoMensualUsd ?? null;
    const gastoMesUsd = gasto?.gastoUsd ?? null;
    const saldoUsd = limite !== null && gastoMesUsd !== null ?
      Math.max(Math.round((limite - gastoMesUsd) * 10000) / 10000, 0) : null;
    return {
      ...cabecera, empresas: [empresaPlan], modelo, faltanPrecios,
      costoEstimadoUsd: faltanPrecios ? null : detalle.costoEstimadoUsd,
      // Para la vista previa del Expediente: cómo se llega al costo y cuánto
      // queda del límite mensual.
      estimacion: {
        ...detalle,
        costoEstimadoUsd: faltanPrecios ? null : detalle.costoEstimadoUsd,
        gastoMesUsd, limiteMensualUsd: limite, saldoUsd,
        superaLimite: !faltanPrecios && saldoUsd !== null &&
            detalle.costoEstimadoUsd > saldoUsd,
      },
      advertencias: empresaPlan.advertencias || [],
      expediente: {
        expedienteId, requerimientoIds: pedidos,
        personasSinCarpeta: ajuste.personasSinCarpeta,
        carpetasSinPersona: ajuste.carpetasSinPersona,
        omitidosValidados: ajuste.omitidosValidados,
        personasPorEntidad: ajuste.personasPorEntidad,
      },
    };
  }

  /**
   * Analiza un árbol de carpetas.
   * @param {Object} payload {mandanteId, arbol, calcesManuales, enlaces,
   *     modoEstructura}. `enlaces`: empresaCarpeta → {empresaId}
   *     confirmado (para sugerir personas con la Empresa elegida por el
   *     usuario). `modoEstructura`: "plantilla" (por defecto) o "libre"
   *     (sin plantilla: todo archivo aceptado va a la IA).
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Plan.
   */
  async analizar({mandanteId, arbol, calcesManuales = {}, enlaces = {},
    modoEstructura = "plantilla", expedienteId = null, requerimientoIds = null,
    omitirValidados = false}, actor) {
    const libre = modoEstructura === "libre";
    // Se consulta siempre: además valida el acceso del actor al Mandante.
    const activa = await plantillaEstructuraService.obtenerActiva(
        mandanteId, actor);
    const plantilla = libre ? null : activa;
    if (!libre && !plantilla) {
      throw new AppError(409, "El Mandante no tiene una plantilla de " +
          "estructura activa. Configúrela en Configuración → Inteligencia " +
          "Artificial → Estructura de carpetas.");
    }
    if (contarArbol(arbol) > MAX_ARCHIVOS_ARBOL) {
      throw new AppError(413, `La carpeta tiene más de ${MAX_ARCHIVOS_ARBOL} ` +
          "archivos. Elija una carpeta más acotada.");
    }
    const tiposDocumentales = await tipoDocumentalRepository.list();
    const tipos = new Map(tiposDocumentales.map((t) => [t.codigo, t]));
    const plan = libre ? analizarLibre(arbol) :
      analizarArbol(arbol, plantilla, {tipos, calcesManuales});
    const cabecera = {
      modoEstructura: libre ? "libre" : "plantilla",
      plantilla: libre ? null : {plantillaId: plantilla.id,
        nombre: plantilla.nombre, version: plantilla.version},
      tipoEstructura: plan.tipo,
      // Para que la vista previa muestre qué se revisará sin otra llamada.
      alcance: libre ? null : calcularAlcance(plantilla, tiposDocumentales),
    };
    if (!plan.tipo) {
      return {
        ...cabecera, empresas: [], costoEstimadoUsd: 0, faltanPrecios: false,
        advertencias: [`No se reconoce la estructura de la plantilla ` +
            `${plantilla.nombre}.`],
        detalle: (arbol.carpetas || []).map((c) => ({
          carpeta: c.nombre,
          seccionesReconocidas: puntajeEstructura(c, plantilla.secciones),
        })),
      };
    }
    if (expedienteId) {
      return this._planExpediente({plan, cabecera, mandanteId, expedienteId,
        requerimientoIds, omitirValidados: omitirValidados === true, libre},
      actor);
    }

    const empresasMandante = await empresaRepository.getByIds(
        await empresaMandanteRepository.empresaIdsActivas(mandanteId));
    const empresas = [];
    for (const e of plan.empresas) {
      // eslint-disable-next-line no-await-in-loop
      const enlaceSugerido = await this._enlaceEmpresa(e, empresasMandante,
          mandanteId);
      const empresaId = enlaces[e.empresaCarpeta]?.empresaId ??
          enlaceSugerido?.empresaId ?? null;
      // eslint-disable-next-line no-await-in-loop
      const sugeridas = await this._personasSugeridas(e.entidades, empresaId);
      // Con persona sugerida, la clave de consolidación es su ID (la misma
      // persona en trabajadores y conductores queda en una entidad).
      const nuevaClave = new Map();
      e.entidades.forEach((ent) => {
        const s = sugeridas.get(ent.entidadCarpeta);
        nuevaClave.set(ent.entidadClave, s ?
          claveEntidad(e.empresaCarpeta, "persona", s.personaId) :
          ent.entidadClave);
      });
      const clave = (k) => (k ? nuevaClave.get(k) || k : k);
      empresas.push({
        ...e,
        enlaceSugerido,
        entidades: e.entidades.map((ent) => ({
          ...ent, entidadClave: clave(ent.entidadClave),
          personaSugerida: sugeridas.get(ent.entidadCarpeta) || null,
        })),
        secciones: e.secciones.map((r) => ({
          ...r, entidadClave: clave(r.entidadClave),
          entidadId: sugeridas.get(r.entidadCarpeta)?.personaId || null,
        })),
        archivosIA: e.archivosIA.map((a) => ({...a,
          entidadClave: clave(a.entidadClave) ||
              `${e.empresaCarpeta}|seccion|${a.seccionClave}`})),
      });
    }
    const {modeloPorDefecto: modelo, preciosPorModelo} =
        await aiConfigService.obtenerParametros();
    const todos = empresas.flatMap((e) => e.archivosIA);
    const faltanPrecios = costoService.faltanPrecios(preciosPorModelo, modelo);
    return {
      ...cabecera, empresas, modelo, faltanPrecios,
      costoEstimadoUsd: faltanPrecios ? null :
        costoService.estimar(preciosPorModelo, modelo, todos),
      advertencias: empresas.flatMap((e) => e.advertencias),
    };
  }
}

/**
 * Personas con lo pedido ya validado en el Expediente: vigente "cumple" y
 * no vencido. Por tipo documental (plantilla) y en total (carpeta libre).
 * @param {Object[]} instancias Instancias activas de las personas, de los
 *     requerimientos pedidos.
 * @param {Map<string, string>} codigoPorRequerimiento requerimientoId →
 *     código del tipo documental.
 * @return {{validados: Map<string, Set<string>>, todosValidados:
 *     Set<string>}} Validados.
 */
function validadosDe(instancias, codigoPorRequerimiento) {
  const hoy = hoySantiago();
  const ok = (i) => i.resultado === "cumple" && i.evaluacionVigenteId &&
    clasificarVencimiento(i.fechaVencimiento, hoy)?.clasificacion !==
        "vencido";
  const porPersonaCodigo = new Map();
  const porPersona = new Map();
  instancias.forEach((i) => {
    const codigo = codigoPorRequerimiento.get(i.requerimientoId);
    const clave = `${i.personaId}|${codigo}`;
    porPersonaCodigo.set(clave, (porPersonaCodigo.get(clave) ?? true) && ok(i));
    porPersona.set(i.personaId, (porPersona.get(i.personaId) ?? true) &&
      ok(i));
  });
  const validados = new Map();
  porPersonaCodigo.forEach((valido, clave) => {
    if (!valido) return;
    const [personaId, codigo] = clave.split("|");
    if (!validados.has(personaId)) validados.set(personaId, new Set());
    validados.get(personaId).add(codigo);
  });
  const todosValidados = new Set([...porPersona]
      .filter(([, v]) => v).map(([id]) => id));
  return {validados, todosValidados};
}

module.exports = new EstructuraRevisionService();
module.exports.empresaPorNombre = empresaPorNombre;
