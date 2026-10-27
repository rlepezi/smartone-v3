const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const resultadoRevisionRepository =
    require("../repositories/resultadoRevisionRepository");
const sesionRevisionRepository =
    require("../repositories/sesionRevisionRepository");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const personaRepository = require("../repositories/personaRepository");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const expedienteRepository = require("../repositories/expedienteRepository");
const expedienteRequerimientoRepository =
    require("../repositories/expedienteRequerimientoRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const empresaRepository = require("../repositories/empresaRepository");
const proyectoRepository = require("../repositories/proyectoRepository");
const reglas = require("./reglasService");
const resultadoCompletitudRepository =
    require("../repositories/resultadoCompletitudRepository");
const {cleanRut} = require("../utils/rutValidator");
const {hoySantiago} = require("../utils/vencimientos");

const TIPOS_NORMALIZADOS = ["CEDULA_CL", "LICENCIA_CL"];
// Campos que se fusionan entre piezas (ruta dentro de datosExtraidos).
const CAMPOS_FUSION = {
  CEDULA_CL: [
    "run", "nombres", "apellidos", "fechaNacimiento", "cedula.fechaEmision",
    "cedula.fechaVencimiento", "cedula.numeroDocumento",
    "cedula.tipoDocumento", "cedula.mrz",
  ],
  LICENCIA_CL: [
    "run", "nombres", "apellidos", "fechaNacimiento", "licencia.clases",
    "licencia.fechaUltimoControl", "licencia.fechaProximoControl",
    "licencia.municipalidad", "licencia.restricciones",
  ],
};
// Gravedad para combinar LC-04 entre enlaces.
const GRAVEDAD = {no_aplica: 0, informativa: 0, cumple: 1, revision: 2,
  no_cumple: 3};
const CAMPO_TOTAL = {
  cumple: "cumple", no_cumple: "noCumple", revision_humana: "revisionHumana",
};

const leer = (obj, ruta) => ruta.split(".")
    .reduce((v, k) => (v === null || v === undefined ? v : v[k]), obj);

const escribir = (obj, ruta, valor) => {
  const partes = ruta.split(".");
  let actual = obj;
  partes.slice(0, -1).forEach((k) => {
    if (!actual[k]) actual[k] = {};
    actual = actual[k];
  });
  actual[partes[partes.length - 1]] = valor;
};

// Valor comparable entre piezas (el RUN se compara normalizado).
const comparable = (campo, valor) => (campo === "run" ?
  reglas.normalizarRun(valor) || String(valor) : JSON.stringify(valor));

/**
 * Fusiona las piezas (procesamientos) de un mismo tipo: primer valor no
 * nulo por campo; si dos piezas traen valores distintos, se registra el
 * conflicto. Legibilidad: la menor; lados: la unión.
 * @param {string} codigo Tipo documental.
 * @param {Object[]} piezas Procesamientos "procesado" de ese tipo.
 * @return {{datos: Object, conflictos: Object[]}} Datos consolidados.
 */
function fusionar(codigo, piezas) {
  const datos = {};
  const conflictos = [];
  CAMPOS_FUSION[codigo].forEach((campo) => {
    const valores = piezas.map((p) => leer(p.datosExtraidos, campo))
        .filter((v) => v !== null && v !== undefined && v !== "" &&
            !(Array.isArray(v) && v.length === 0));
    escribir(datos, campo, valores.length ? valores[0] : null);
    const distintos = [...new Map(valores.map((v) =>
      [comparable(campo, v), v])).values()];
    if (distintos.length > 1) conflictos.push({campo, valores: distintos});
  });
  const legibilidades = piezas.map((p) => p.datosExtraidos?.legibilidad)
      .filter((v) => typeof v === "number");
  datos.legibilidad = legibilidades.length ? Math.min(...legibilidades) : null;
  datos.ladosPresentes = [...new Set(piezas.map((p) => p.lado)
      .filter(Boolean))];
  return {datos, conflictos};
}

/**
 * Consolidación de una carpeta (una persona): junta las piezas por tipo
 * documental, enlaza por RUN con la Persona y sus Expedientes, aplica las
 * reglas y deja un resultadosRevision por tipo.
 */
class ConsolidacionService {
  /**
   * Enlace de la entidad: el RUN leído del documento confirma (o crea, si
   * la persona no existe) el enlace sugerido por la carpeta (RUT en el
   * nombre o nombre de la persona). Si se contradicen, conflicto_run. Con el
   * Expediente confirmado en la vista previa, solo se enlaza con ese
   * Expediente; si no, con todas las Participaciones activas del Mandante.
   * @param {Object} entrada {mandanteId, runCarpeta, runDocumento, tipos,
   *     personaSugeridaId, expedienteId}.
   * @return {Promise<Object>} {estadoEnlace, persona, enlacesPorTipo}.
   */
  async _enlazar({mandanteId, runCarpeta, runDocumento, tipos,
    personaSugeridaId = null, expedienteId = null, requerimientoIds = null}) {
    const enlacesPorTipo = {};
    tipos.forEach((t) => {
      enlacesPorTipo[t.codigo] = [];
    });
    let conflictoRun = Boolean(runCarpeta && runDocumento &&
        runCarpeta !== runDocumento);
    const runDefinitivo = runDocumento || runCarpeta;
    const [personaPorRun, personaSugerida] = await Promise.all([
      runDefinitivo ? personaRepository.getByRut(cleanRut(runDefinitivo)) :
        null,
      personaSugeridaId ? personaRepository.getById(personaSugeridaId) : null,
    ]);
    if (personaPorRun && personaSugerida &&
        personaPorRun.id !== personaSugerida.id) {
      conflictoRun = true;
    }
    // La carpeta se calzó con una persona y el documento trae un RUN que no
    // es de nadie registrado: no es esa persona.
    if (personaSugerida && runDocumento && !personaPorRun) conflictoRun = true;
    const persona = personaPorRun || (runDocumento ? null : personaSugerida);
    if (!persona) {
      return {
        estadoEnlace: conflictoRun ? "conflicto_run" : "persona_no_existe",
        persona: null, enlacesPorTipo,
      };
    }
    let participaciones = await participacionPersonaRepository.list({
      personaId: persona.id, mandanteId, estado: "activa",
    });
    if (expedienteId) {
      const expediente = await expedienteRepository.getById(expedienteId);
      participaciones = participaciones.filter((p) =>
        p.participacionId === expediente?.participacionId);
    }
    if (participaciones.length === 0) {
      return {
        estadoEnlace: conflictoRun ? "conflicto_run" : "sin_participacion",
        persona, enlacesPorTipo,
      };
    }

    const [instancias, expedientesPorParticipacion] = await Promise.all([
      expedienteRequerimientoRepository.listBySujeto({
        campo: "personaId", valor: persona.id, mandanteId, estado: "activo",
      }),
      Promise.all(participaciones.map((p) =>
        expedienteRepository.getByParticipacion(p.participacionId))),
    ]);
    const expedientesAbiertos = expedientesPorParticipacion.flat();
    const [requerimientos, empresas, proyectos] = await Promise.all([
      requerimientoRepository.getByIds(
          instancias.map((i) => i.requerimientoId),
      ),
      empresaRepository.getByIds(expedientesAbiertos.map((e) => e.empresaId)),
      proyectoRepository.getByIds(
          expedientesAbiertos.map((e) => e.proyectoId),
      ),
    ]);
    const requerimientoPorId = new Map(requerimientos.map((r) => [r.id, r]));
    const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
    const proyectoPorId = new Map(proyectos.map((p) => [p.id, p]));

    participaciones.forEach((participacion, idx) => {
      const expedientes = expedientesPorParticipacion[idx].filter((e) =>
        e.estado !== "cerrado" &&
        (e.estadoGeneracion || "completa") === "completa" &&
        (!expedienteId || e.id === expedienteId));
      expedientes.forEach((expediente) => {
        const base = {
          participacionId: participacion.participacionId,
          expedienteId: expediente.id,
          empresaId: expediente.empresaId,
          proyectoId: expediente.proyectoId,
          // Para mostrar el enlace en vivo sin más lecturas.
          empresaNombre:
              empresaPorId.get(expediente.empresaId)?.razonSocial || null,
          proyectoCodigo:
              proyectoPorId.get(expediente.proyectoId)?.codigo || null,
          proyectoNombre:
              proyectoPorId.get(expediente.proyectoId)?.nombre || null,
        };
        tipos.forEach((tipo) => {
          const coinciden = instancias.filter((i) =>
            i.expedienteId === expediente.id &&
            (!requerimientoIds ||
              requerimientoIds.includes(i.requerimientoId)) &&
            tipo.id && requerimientoPorId.get(i.requerimientoId)
                ?.tipoDocumentalId === tipo.id);
          if (coinciden.length === 0) {
            enlacesPorTipo[tipo.codigo].push({
              ...base, requerimientoId: null, expedienteRequerimientoId: null,
              requerido: false,
            });
            return;
          }
          coinciden.forEach((i) => {
            const req = requerimientoPorId.get(i.requerimientoId);
            enlacesPorTipo[tipo.codigo].push({
              ...base,
              requerimientoId: i.requerimientoId,
              expedienteRequerimientoId: i.id,
              requerido: true,
              clasesAceptadas:
                  req.parametrosValidacion?.clasesAceptadas || null,
              diasAlertaVencimiento:
                  req.parametrosValidacion?.diasAlertaVencimiento ?? null,
            });
          });
        });
      });
    });
    return {
      estadoEnlace: conflictoRun ? "conflicto_run" :
        runDocumento && personaPorRun ? "confirmado" : "sin_confirmar",
      persona, enlacesPorTipo,
    };
  }

  /**
   * Reglas de un tipo, con LC-04 evaluada por enlace (cada requerimiento
   * puede aceptar clases distintas).
   * @param {Object} entrada Datos.
   * @return {{resultadoReglas: Object[], enlaces: Object[]}} Reglas y
   *     enlaces con su LC-04.
   */
  _aplicarReglas({codigo, datos, conflictos, persona, tipo, enlaces,
    fechasEnNombre = []}) {
    const requeridos = enlaces.filter((e) => e.requerido);
    const diasAlerta = requeridos.map((e) => e.diasAlertaVencimiento)
        .find((d) => d !== null && d !== undefined) ??
        reglas.DIAS_ALERTA_POR_DEFECTO;
    const ctx = {
      datos, conflictos, hoy: hoySantiago(), diasAlerta, fechasEnNombre,
      persona: persona ? {
        run: persona.rut,
        nombre: `${persona.nombre || ""} ${persona.apellido || ""}`.trim(),
      } : null,
      umbralLegibilidad: tipo?.umbralLegibilidad ??
          reglas.UMBRAL_LEGIBILIDAD_POR_DEFECTO,
    };
    if (codigo === "CEDULA_CL") {
      return {resultadoReglas: reglas.reglasCedula(ctx), enlaces};
    }
    const resultadoReglas = reglas.reglasLicencia(ctx);
    if (requeridos.length === 0) return {resultadoReglas, enlaces};
    const conClases = enlaces.map((e) => (e.requerido ? {
      ...e, reglaClases: reglas.reglaClases(datos.licencia?.clases,
          e.clasesAceptadas),
    } : e));
    const porEnlace = conClases.filter((e) => e.requerido)
        .map((e) => e.reglaClases);
    const distintos = new Set(porEnlace.map((r) => r.resultado));
    let lc04 = porEnlace[0];
    if (distintos.size > 1) {
      const peor = porEnlace.reduce((a, b) =>
        (GRAVEDAD[b.resultado] > GRAVEDAD[a.resultado] ? b : a));
      lc04 = {
        regla: "LC-04",
        resultado: GRAVEDAD[peor.resultado] >= GRAVEDAD.revision ?
          "revision" : peor.resultado,
        detalle: "Las clases aceptadas varían entre expedientes; revise el " +
            "detalle por expediente.",
      };
    }
    if ((conflictos || []).some((c) => c.campo === "licencia.clases") &&
        ["cumple", "no_cumple"].includes(lc04.resultado)) {
      lc04 = {regla: "LC-04", resultado: "revision",
        detalle: "Valores distintos entre archivos en: licencia.clases."};
    }
    return {
      resultadoReglas: reglas.reglasLicencia({
        ...ctx, clasesAceptadas: null,
      }).map((r) => (r.regla === "LC-04" ? lc04 : r)),
      enlaces: conClases,
    };
  }

  /**
   * Consolida una entidad (persona) de una sesión: junta sus documentos de
   * todas las secciones (trabajadores, conductores…). Idempotente: vuelve a
   * calcular los resultados que siguen "propuesto"; los ya resueltos no se
   * tocan.
   * @param {{sesion: Object, entidadClave: string}} entrada Datos.
   * @return {Promise<{resultados: Object[], noNormalizados: Object[]}>}
   *     Resultados de la entidad y documentos OTRO.
   */
  async consolidarEntidad({sesion, entidadClave}) {
    const [todos, completitud] = await Promise.all([
      procesamientoIARepository.listBySesion(sesion.id, entidadClave),
      resultadoCompletitudRepository.listBySesionEntidad(sesion.id,
          entidadClave),
    ]);
    const procesamientos = todos.filter((p) => p.estado === "procesado");
    const primero = (campo) => completitud.map((c) => c[campo])
        .find(Boolean) || null;
    const empresaCarpeta = primero("empresaCarpeta") ||
        todos.map((p) => p.empresaCarpeta).find(Boolean) || null;
    const entidadCarpeta = primero("entidadCarpeta") ||
        todos.map((p) => p.entidadCarpeta).find(Boolean) || null;
    const seccionesOrigen = [...new Set([
      ...completitud.map((c) => c.seccionClave),
      ...todos.map((p) => p.seccionClave),
    ].filter(Boolean))];
    const expedienteId = (sesion.empresasDetectadas || [])
        .find((e) => e.empresaCarpeta === empresaCarpeta)?.expedienteId || null;
    const porTipo = {};
    procesamientos.forEach((p) => {
      if (!TIPOS_NORMALIZADOS.includes(p.tipoDetectado)) return;
      if (!porTipo[p.tipoDetectado]) porTipo[p.tipoDetectado] = [];
      porTipo[p.tipoDetectado].push(p);
    });
    const codigos = Object.keys(porTipo);
    const consolidados = {};
    codigos.forEach((codigo) => {
      consolidados[codigo] = fusionar(codigo, porTipo[codigo]);
    });
    const tipos = await Promise.all(codigos.map(async (codigo) => ({
      codigo, ...(await tipoDocumentalRepository.getByCodigo(codigo) || {}),
    })));

    const runCarpeta = primero("runCarpeta");
    const runDocumento = reglas.normalizarRun(
        consolidados.CEDULA_CL?.datos.run ||
        consolidados.LICENCIA_CL?.datos.run || null,
    );
    const {estadoEnlace, persona, enlacesPorTipo} = await this._enlazar({
      mandanteId: sesion.mandanteId, runCarpeta, runDocumento, tipos,
      personaSugeridaId: primero("entidadId") ||
          sesion.personasPorEntidad?.[entidadClave] || null,
      expedienteId: expedienteId || sesion.expedienteId || null,
      requerimientoIds: sesion.requerimientoIds || null,
    });

    const existentes = await resultadoRevisionRepository.listBySesionEntidad(
        sesion.id, entidadClave,
    );
    const incrementos = {cumple: 0, noCumple: 0, revisionHumana: 0};
    const resultados = [];
    for (const tipo of tipos) {
      const {datos, conflictos} = consolidados[tipo.codigo];
      const {resultadoReglas, enlaces} = this._aplicarReglas({
        codigo: tipo.codigo, datos, conflictos, persona, tipo,
        enlaces: enlacesPorTipo[tipo.codigo],
        fechasEnNombre: porTipo[tipo.codigo]
            .map((p) => p.fechaEnNombreArchivo).filter(Boolean),
      });
      let propuesta = reglas.calcularPropuesta(resultadoReglas);
      if (estadoEnlace === "conflicto_run") propuesta = "revision_humana";
      const data = {
        mandanteId: sesion.mandanteId,
        sesionId: sesion.id,
        entidadClave,
        entidadCarpeta,
        empresaCarpeta,
        seccionesOrigen,
        tipoDocumentalCodigo: tipo.codigo,
        procesamientoIds: porTipo[tipo.codigo].map((p) => p.id),
        datosConsolidados: datos,
        conflictos,
        resultadoReglas,
        propuesta,
        runCarpeta,
        runDocumento,
        estadoEnlace,
        personaId: persona?.id || null,
        personaNombre: persona ?
            `${persona.nombre || ""} ${persona.apellido || ""}`.trim() : null,
        enlaces,
        // Para listar las propuestas de un Expediente (matriz del
        // Expediente) sin recorrer los enlaces.
        expedienteIds: [...new Set(enlaces.filter((e) =>
          e.requerido && e.expedienteId).map((e) => e.expedienteId))],
      };
      const previo = existentes.find((r) =>
        r.tipoDocumentalCodigo === tipo.codigo);
      if (previo && previo.estado !== "propuesto") {
        resultados.push(previo);
        continue;
      }
      if (previo) incrementos[CAMPO_TOTAL[previo.propuesta]]--;
      incrementos[CAMPO_TOTAL[propuesta]]++;
      // eslint-disable-next-line no-await-in-loop
      resultados.push(previo ?
        await resultadoRevisionRepository.update(previo.id, data) :
        await resultadoRevisionRepository.create({
          ...data, estado: "propuesto", resolucion: null, evaluacionIds: [],
        }));
    }
    const cambios = Object.fromEntries(Object.entries(incrementos)
        .filter(([, v]) => v !== 0));
    if (Object.keys(cambios).length) {
      await sesionRevisionRepository.incrementar(sesion.id, cambios);
    }
    return {
      resultados,
      noNormalizados: procesamientos.filter((p) => p.tipoDetectado === "OTRO"),
    };
  }
}

module.exports = new ConsolidacionService();
module.exports.fusionar = fusionar;
