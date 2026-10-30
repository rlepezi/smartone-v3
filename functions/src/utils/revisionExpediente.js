const {clasificarVencimiento} = require("./vencimientos");
const {similitudNombres} = require("./estructuraCalce");
const {coincideNombre, normalizarRun} = require("../services/reglasService");
const {seccionHabilitada, documentoHabilitado} = require("./alcanceValidacion");
const {ubicacionRequerimiento} = require("./ubicacionRequerimiento");

// Revisiones IA dentro de un Expediente: funciones PURAS para decidir qué
// requerimientos pueden revisarse con IA y el estado de cada celda de la
// matriz (sujeto × requerimiento).

const MOTIVOS_NO_ELEGIBLE = {
  sin_tipo: "Sin tipo documental",
  tipo_inactivo: "Tipo inactivo",
  no_en_plantilla: "No existe en la plantilla",
  documento_deshabilitado: "Documento deshabilitado en la plantilla",
  dato_sensible: "Dato sensible",
  solo_reglas: "Se revisa con “Revisar con IA” en la evaluación",
  seccion_sin_documentos: "Vinculado a una sección sin documentos en la " +
      "plantilla",
};

/**
 * Documentos de la plantilla con un tipo documental, con su sección.
 * @param {?Object} plantilla Plantilla de estructura.
 * @param {string} codigo Código del tipo documental.
 * @return {Object[]} [{documento, seccion, habilitado}].
 */
function documentosDeTipo(plantilla, codigo) {
  const salida = [];
  ((plantilla && plantilla.secciones) || []).forEach((s) => {
    [...(s.archivosSeccion || []), ...(s.documentos || [])].forEach((d) => {
      if (d.tipoDocumentalCodigo !== codigo) return;
      salida.push({
        documento: d, seccion: s,
        habilitado: seccionHabilitada(s) && documentoHabilitado(d),
      });
    });
  });
  return salida;
}

/**
 * Elegibilidad de un requerimiento para revisarse con IA, según su
 * ubicación (ubicacionRequerimiento: 1° mapeo del Expediente, 2° vínculo de
 * la plantilla, 3° tipo documental, sin caída entre niveles). En carpeta
 * libre (sin plantilla) basta con el tipo. El tipo documental sale del
 * documento de la plantilla vinculado; el guardado es solo respaldo.
 * @param {Object} entrada {requerimiento, tipo (tipo GUARDADO o null),
 *     tiposPorCodigo (catálogo por código), plantilla (o null), libre, mapeo
 *     (del repositorio documental), tipoEntidad (por defecto, el del
 *     requerimiento)}.
 * @return {{elegible: boolean, motivo: ?string, tipo: ?Object,
 *     documentoPlantilla: ?{nombre: string, seccion: string}, nivel: ?string,
 *     ruta: ?string, documentos: Object[]}} Resultado.
 */
function elegibilidadRequerimiento({requerimiento, tipo, plantilla,
  libre = false, mapeo = null, tipoEntidad = null, tiposPorCodigo = null}) {
  const u = ubicacionRequerimiento({requerimiento, tipo, plantilla, mapeo,
    libre, tiposPorCodigo, tipoEntidad: tipoEntidad ||
      requerimiento?.tipoEntidad || "persona"});
  const primero = u.documentos[0] || null;
  const t = u.tipo;
  return {
    tipo: t ? {id: t.id, codigo: t.codigo, estado: t.estado,
      estadoIA: t.estadoIA} : null,
    origenTipo: u.origenTipo,
    documentoPlantilla: primero ? {
      nombre: primero.documento || primero.seccion, seccion: primero.seccion,
    } : null,
    elegible: u.elegible, motivo: u.motivo,
    nivel: u.nivel, ruta: u.ruta, documentos: u.documentos,
  };
}

/**
 * Estado de una celda de la matriz (sujeto × requerimiento).
 *  - pendiente: sin evaluación vigente ni propuesta.
 *  - propuesta_ia: propuesta sin resolver (y sin evaluación vigente, o con
 *    una vigente de IA).
 *  - discrepancia: evaluación vigente NO IA y propuesta con un resultado
 *    (cumple / no_cumple) distinto: la IA nunca la reemplaza sola.
 *  - vencido: vigente "cumple" con vencimiento anterior a hoy.
 *  - no_aplica, validado_ia, validado_manual (reutilizada cuenta como
 *    manual).
 * @param {{evaluacionVigente: ?Object, propuestaPendiente: ?Object,
 *     hoy: string}} entrada Evaluación vigente ({resultado, modalidad,
 *     fechaVencimiento}), propuesta ({propuesta}) y hoy (YYYY-MM-DD).
 * @return {{estado: string, resultado: ?string, origen: ?string}} Estado,
 *     resultado de la evaluación vigente y su origen (ia | manual |
 *     reutilizada).
 */
function calcularEstadoCelda({evaluacionVigente, propuestaPendiente, hoy}) {
  const ev = evaluacionVigente &&
      evaluacionVigente.resultado !== "pendiente" ? evaluacionVigente : null;
  if (!ev) {
    return {estado: propuestaPendiente ? "propuesta_ia" : "pendiente",
      resultado: null, origen: null};
  }
  const origen = ev.modalidad === "ia_asistida" ? "ia" :
    ev.modalidad === "reutilizada" ? "reutilizada" : "manual";
  const res = {resultado: ev.resultado, origen};
  if (propuestaPendiente) {
    if (origen === "ia") return {...res, estado: "propuesta_ia"};
    const propuesta = propuestaPendiente.propuesta;
    if (["cumple", "no_cumple"].includes(propuesta) &&
        propuesta !== ev.resultado) {
      return {...res, estado: "discrepancia"};
    }
  }
  if (ev.resultado === "no_aplica") return {...res, estado: "no_aplica"};
  if (ev.resultado === "cumple" && ev.fechaVencimiento &&
      clasificarVencimiento(ev.fechaVencimiento, hoy)?.clasificacion ===
          "vencido") {
    return {...res, estado: "vencido"};
  }
  return {...res, estado: origen === "ia" ? "validado_ia" : "validado_manual"};
}

const nombreCompleto = (p) =>
  `${p.nombre || ""} ${p.apellido || ""}`.trim();

/**
 * Calza una carpeta de persona con las personas del Expediente: primero
 * por el RUT del nombre de la carpeta, después por nombre.
 * @param {Object} entidad Entidad del plan ({runCarpeta, entidadNombre}).
 * @param {Object[]} personas Personas del Expediente.
 * @return {?{personaId: string, nombre: string, por: string}} Calce.
 */
function calzarPersona(entidad, personas) {
  if (entidad.runCarpeta) {
    const run = normalizarRun(entidad.runCarpeta);
    const p = personas.find((x) => normalizarRun(x.rut) === run);
    if (p) return {personaId: p.id, nombre: nombreCompleto(p), por: "rut"};
  }
  let mejor = null;
  personas.forEach((p) => {
    const nombre = nombreCompleto(p);
    if (!coincideNombre(entidad.entidadNombre, nombre)) return;
    const similitud = similitudNombres(entidad.entidadNombre, nombre);
    if (!mejor || similitud > mejor.similitud) {
      mejor = {personaId: p.id, nombre, por: "nombre", similitud};
    }
  });
  return mejor ? {personaId: mejor.personaId, nombre: mejor.nombre,
    por: "nombre"} : null;
}

/**
 * Ajusta el plan de UNA empresa a un Expediente: las carpetas de persona
 * se calzan SOLO con las personas del Expediente; las que no calzan no se
 * procesan. A la IA van solo los documentos de los tipos pedidos (en
 * carpeta libre la IA detecta el tipo, así que van todos los de la persona)
 * y, con `omitirValidados`, se excluye lo ya validado (vigente "cumple" no
 * vencido).
 * @param {Object} entrada {empresa (plan), personas (del Expediente),
 *     codigos (Set de tipos documentales pedidos), libre, validados (Map
 *     personaId → Set de códigos ya validados), todosValidados (Set de
 *     personaId con todo lo pedido validado), omitirValidados, admitir
 *     (opcional: (archivo) => boolean; por defecto, su tipo está en
 *     codigos)}.
 * @return {{empresa: Object, personasSinCarpeta: Object[],
 *     carpetasSinPersona: Object[], omitidosValidados: number,
 *     personasPorEntidad: Object}} Plan ajustado y avisos.
 */
function ajustarPlanAExpediente({empresa, personas, codigos, libre = false,
  validados = new Map(), todosValidados = new Set(),
  omitirValidados = false, admitir = null}) {
  const calcePorEntidad = new Map();
  const carpetasSinPersona = [];
  empresa.entidades.forEach((e) => {
    if (e.entidadTipo !== "persona") return;
    const calce = calzarPersona(e, personas);
    if (calce) calcePorEntidad.set(e.entidadClave, calce);
    else {
      carpetasSinPersona.push({entidadCarpeta: e.entidadCarpeta,
        entidadNombre: e.entidadNombre, runCarpeta: e.runCarpeta || null});
    }
  });
  const conCarpeta = new Set([...calcePorEntidad.values()]
      .map((c) => c.personaId));
  const excluidos = [...empresa.archivosExcluidosIA];
  let omitidosValidados = 0;
  const archivosIA = empresa.archivosIA.filter((a) => {
    const excluir = (motivo) => {
      excluidos.push({rutaRelativa: a.rutaRelativa, nombre: a.nombre,
        documentoClave: a.documentoClave || null, motivo,
        entidadCarpeta: a.entidadCarpeta || null});
      return false;
    };
    if (!libre && !(admitir ? admitir(a) :
        codigos.has(a.tipoDocumentalCodigo))) {
      return excluir("no_solicitado");
    }
    const calce = calcePorEntidad.get(a.entidadClave);
    if (!calce) return excluir("sin_persona_en_expediente");
    if (omitirValidados && (libre ?
        todosValidados.has(calce.personaId) :
        validados.get(calce.personaId)?.has(a.tipoDocumentalCodigo))) {
      omitidosValidados++;
      return excluir("ya_validado");
    }
    return true;
  });
  const personaDeCarpeta = new Map(empresa.entidades
      .filter((e) => calcePorEntidad.has(e.entidadClave))
      .map((e) => [e.entidadCarpeta, calcePorEntidad.get(e.entidadClave)]));
  const personasPorEntidad = Object.fromEntries([...calcePorEntidad]
      .map(([clave, c]) => [clave, c.personaId]));
  return {
    empresa: {
      ...empresa,
      entidades: empresa.entidades.map((e) => ({...e,
        personaSugerida: calcePorEntidad.get(e.entidadClave) || null})),
      secciones: empresa.secciones.map((r) => ({...r,
        entidadId: r.entidadCarpeta ?
          personaDeCarpeta.get(r.entidadCarpeta)?.personaId || null : null})),
      archivosIA,
      archivosExcluidosIA: excluidos,
    },
    personasSinCarpeta: personas.filter((p) => !conCarpeta.has(p.id))
        .map((p) => ({personaId: p.id, nombre: nombreCompleto(p),
          rut: p.rut || null})),
    carpetasSinPersona,
    omitidosValidados,
    personasPorEntidad,
  };
}

/**
 * Motivo por el que una propuesta NO entra en "Aceptar todas las que
 * cumplen" de un Expediente, o null si entra. Quedan fuera las que no
 * proponen "cumple" (no cumple, revisión humana), las ya resueltas, las de
 * otro Expediente y las discrepancias (evaluación manual o reutilizada
 * vigente con otro resultado: esa la decide una persona).
 * @param {Object} resultado Resultado de revisión.
 * @param {string} expedienteId Expediente.
 * @param {Map<string, ?Object>} vigentePorInstancia
 *     expedienteRequerimientoId → evaluación vigente.
 * @return {?string} Motivo o null.
 */
function motivoFueraDeLote(resultado, expedienteId, vigentePorInstancia) {
  if (resultado.estado !== "propuesto") return "ya_resuelto";
  if (resultado.propuesta !== "cumple") return "propuesta_no_cumple";
  const enlaces = (resultado.enlaces || []).filter((e) => e.requerido &&
    e.expedienteId === expedienteId && e.expedienteRequerimientoId);
  if (!enlaces.length) return "otro_expediente";
  const discrepa = enlaces.some((e) => {
    const v = vigentePorInstancia.get(e.expedienteRequerimientoId);
    return v && v.resultado !== "pendiente" &&
      v.modalidad !== "ia_asistida" && v.resultado !== "cumple";
  });
  return discrepa ? "discrepancia" : null;
}

module.exports = {
  MOTIVOS_NO_ELEGIBLE, documentosDeTipo, elegibilidadRequerimiento,
  calcularEstadoCelda, calzarPersona, ajustarPlanAExpediente,
  motivoFueraDeLote,
};
