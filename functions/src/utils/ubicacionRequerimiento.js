const {
  ESTADOS_IA_ELEGIBLES, seccionHabilitada, documentoHabilitado,
} = require("./alcanceValidacion");

// Ubicación de los documentos de un requerimiento dentro de la carpeta del
// Expediente, y si puede revisarse con IA. Funciones PURAS. Precedencia, sin
// caída entre niveles (si un nivel existe pero no es válido, el
// requerimiento queda NO elegible con su motivo; no se baja al siguiente):
//   1° mapeo.requerimientos del Expediente (carpeta asignada a mano; solo a
//      nivel Empresa);
//   2° vínculo de la plantilla de estructura (requerimientoId del documento;
//      si el documento no tiene, el de su sección);
//   3° calce por tipo documental (documentos de la plantilla con el tipo
//      guardado en el requerimiento).
// TIPO DOCUMENTAL del requerimiento: el del documento de la plantilla
// vinculado a él (tipoDeRequerimiento); el guardado en el requerimiento
// (tipoDocumentalId, ya no editable en pantalla) es solo un respaldo.
// Para Persona y Recurso la ubicación se resuelve dentro de la carpeta de
// cada persona o maquinaria (secciones de entidades de ese tipo); el mapeo
// del Expediente no aplica.

// Tipo de entidad del requerimiento → entidad de las secciones de la
// plantilla que contienen sus carpetas.
const ENTIDAD_PLANTILLA = {persona: "persona", recurso: "maquinaria"};

/**
 * Documentos de una sección que corresponden al contexto de entidad: a
 * nivel Empresa, los archivos de las secciones de archivos y los sueltos de
 * las de entidades o grupos; a nivel Persona/Recurso, los de cada carpeta
 * de entidad del tipo que corresponde.
 * @param {Object} s Sección.
 * @param {string} tipoEntidad "empresa" | "persona" | "recurso".
 * @return {(Array<Object>|null)} Documentos, o null si la sección no es
 *     del contexto.
 */
function documentosEnContexto(s, tipoEntidad) {
  if (tipoEntidad === "empresa") {
    if (s.tipo === "archivos") {
      return [...(s.archivosSeccion || []), ...(s.documentos || [])];
    }
    if (s.tipo === "entidades" || s.tipo === "grupos") {
      return s.archivosSeccion || [];
    }
    return null;
  }
  const entidad = ENTIDAD_PLANTILLA[tipoEntidad];
  if (s.tipo !== "entidades" || !entidad || s.entidad !== entidad) return null;
  return s.documentos || [];
}

/**
 * Requerimiento al que la plantilla vincula un documento: el del documento
 * o, si no tiene, el de su sección. Así, en una sección vinculada a A, un
 * documento vinculado a B va a B y el resto de la sección a A.
 * @param {Object} seccion Sección.
 * @param {?Object} documento Documento (null: la sección sin documentos).
 * @return {?string} requerimientoId o null.
 */
function requerimientoDeDocumento(seccion, documento) {
  return documento?.requerimientoId || seccion?.requerimientoId || null;
}

/**
 * Requerimiento vinculado en la plantilla a un archivo ya clasificado (por
 * su sección y documento), para la consolidación.
 * @param {?Object} plantilla Plantilla.
 * @param {?string} seccionClave Sección del archivo.
 * @param {?string} documentoClave Documento del archivo.
 * @return {?string} requerimientoId o null.
 */
function requerimientoDeArchivo(plantilla, seccionClave, documentoClave) {
  const s = ((plantilla && plantilla.secciones) || [])
      .find((x) => x.clave === seccionClave);
  if (!s) return null;
  const d = [...(s.archivosSeccion || []), ...(s.documentos || [])]
      .find((x) => x.clave === documentoClave) || null;
  return requerimientoDeDocumento(s, d);
}

/**
 * Requerimientos vinculados en algún documento o sección de la plantilla.
 * @param {?Object} plantilla Plantilla.
 * @return {Set<string>} IDs.
 */
function requerimientosVinculados(plantilla) {
  const ids = new Set();
  ((plantilla && plantilla.secciones) || []).forEach((s) => {
    if (s.requerimientoId) ids.add(s.requerimientoId);
    [...(s.archivosSeccion || []), ...(s.documentos || [])].forEach((d) => {
      if (d.requerimientoId) ids.add(d.requerimientoId);
    });
  });
  return ids;
}

/**
 * Documentos (y secciones sin documentos) de la plantilla vinculados a un
 * requerimiento, en el contexto de su entidad y en el orden de la plantilla.
 * @param {?Object} plantilla Plantilla.
 * @param {?string} id ID del requerimiento.
 * @param {string} tipoEntidad "empresa" | "persona" | "recurso".
 * @return {Object[]} Elementos (ver `elemento`).
 */
function vinculadosEnPlantilla(plantilla, id, tipoEntidad) {
  const vinculados = [];
  if (!id) return vinculados;
  ((plantilla && plantilla.secciones) || []).forEach((s) => {
    const docs = documentosEnContexto(s, tipoEntidad);
    if (!docs) return;
    if (!docs.length) {
      if (s.requerimientoId === id) vinculados.push(elemento(s, null));
      return;
    }
    docs.forEach((d) => {
      if (requerimientoDeDocumento(s, d) === id) {
        vinculados.push(elemento(s, d));
      }
    });
  });
  return vinculados;
}

/**
 * Tipo documental de un requerimiento: el del primer documento de la
 * plantilla vinculado a él que tenga tipo; si no hay vínculo (o ninguno
 * tiene tipo), el guardado en el requerimiento como respaldo. Sin ninguno,
 * no tiene tipo (no es error).
 * @param {Object} entrada Datos.
 * @param {Object} entrada.requerimiento Requerimiento ({id}).
 * @param {?Object} entrada.plantilla Plantilla activa (o null).
 * @param {string} entrada.tipoEntidad Tipo de entidad del requerimiento.
 * @param {?Map<string, Object>} entrada.tiposPorCodigo Catálogo por código.
 * @param {?Object} entrada.tipoGuardado Tipo de tipoDocumentalId, o null.
 * @return {{tipo: ?Object, origen: ?string, codigos: string[]}} origen:
 *     "plantilla" | "guardado" | null; codigos: los de los documentos
 *     vinculados (más de uno distinto: se usa el primero).
 */
function tipoDeRequerimiento({requerimiento, plantilla, tipoEntidad,
  tiposPorCodigo = null, tipoGuardado = null}) {
  const codigos = [...new Set(vinculadosEnPlantilla(plantilla,
      requerimiento?.id, tipoEntidad)
      .map((d) => d.tipoDocumentalCodigo).filter(Boolean))];
  const delVinculo = codigos.map((c) => tiposPorCodigo?.get(c))
      .find(Boolean) || null;
  if (delVinculo) return {tipo: delVinculo, origen: "plantilla", codigos};
  if (tipoGuardado) return {tipo: tipoGuardado, origen: "guardado", codigos};
  return {tipo: null, origen: null, codigos};
}

/**
 * Motivo por el que un tipo documental no sirve para la revisión por
 * carpetas, o null.
 * @param {?Object} tipo Tipo documental.
 * @return {?string} Motivo.
 */
function motivoTipo(tipo) {
  if (!tipo) return "sin_tipo";
  if (tipo.estado !== "activo" ||
      !ESTADOS_IA_ELEGIBLES.includes(tipo.estadoIA)) {
    return "tipo_inactivo";
  }
  // Tipo creado para las reglas por requerimiento: sin extracción por
  // carpeta.
  if (tipo.soloReglas) return "solo_reglas";
  return null;
}

/**
 * Elemento de ubicación (sección y documento) para la respuesta.
 * @param {Object} seccion Sección.
 * @param {?Object} documento Documento.
 * @return {Object} {seccionClave, seccion, documentoClave, documento,
 *     tipoDocumentalCodigo}.
 */
const elemento = (seccion, documento) => ({
  seccionClave: seccion.clave, seccion: seccion.nombre || seccion.clave,
  documentoClave: documento?.clave || null,
  documento: documento?.nombre || null,
  tipoDocumentalCodigo: documento?.tipoDocumentalCodigo || null,
  habilitado: seccionHabilitada(seccion) &&
      (!documento || documentoHabilitado(documento)),
  sensible: Boolean(documento?.datosSensibles),
});

/**
 * Ubicación de un requerimiento y su elegibilidad para IA.
 * @param {Object} entrada Datos.
 * @param {Object} entrada.requerimiento Requerimiento ({id}).
 * @param {?Object} entrada.tipo Tipo GUARDADO en el requerimiento ({id,
 *     codigo, estado, estadoIA, soloReglas}) o null: solo respaldo.
 * @param {?Map<string, Object>} [entrada.tiposPorCodigo] Catálogo de tipos
 *     por código: el tipo de cada documento vinculado sale de aquí.
 * @param {string} entrada.tipoEntidad "empresa" | "persona" | "recurso".
 * @param {?Object} entrada.plantilla Plantilla activa (o null).
 * @param {?Object} entrada.mapeo Mapeo del repositorio documental.
 * @param {boolean} [entrada.libre] Carpeta libre (sin plantilla).
 * @return {{nivel: ?string, ruta: ?string, documentos: Object[],
 *     elegible: boolean, motivo: ?string, tipo: ?Object,
 *     origenTipo: ?string}} nivel: "mapeo" | "plantilla" | "tipo" | null
 *     (sin ubicación); tipo: el efectivo (tipoDeRequerimiento).
 */
function ubicacionRequerimiento({requerimiento, tipo, tipoEntidad,
  plantilla, mapeo = null, libre = false, tiposPorCodigo = null}) {
  const id = requerimiento?.id || null;
  const plantillaUsada = libre ? null : plantilla;
  const secciones = (plantillaUsada && plantillaUsada.secciones) || [];
  let nivel = null;
  let ruta = null;
  let documentos = [];
  const efectivo = tipoDeRequerimiento({requerimiento,
    plantilla: plantillaUsada, tipoEntidad, tiposPorCodigo,
    tipoGuardado: tipo || null});

  const rutaMapeo = tipoEntidad === "empresa" && id ?
    mapeo?.requerimientos?.[id] || null : null;
  if (rutaMapeo) {
    nivel = "mapeo";
    ruta = rutaMapeo;
  } else {
    const vinculados = vinculadosEnPlantilla(plantillaUsada, id, tipoEntidad);
    if (vinculados.length) {
      nivel = "plantilla";
      documentos = vinculados;
    } else if (tipo?.codigo) {
      secciones.forEach((s) => {
        (documentosEnContexto(s, tipoEntidad) || []).forEach((d) => {
          if (d.tipoDocumentalCodigo === tipo.codigo) {
            documentos.push(elemento(s, d));
          }
        });
      });
      if (documentos.length) nivel = "tipo";
    }
  }

  const resultado = (elegible, motivo) =>
    ({nivel, ruta, documentos, elegible, motivo, tipo: efectivo.tipo,
      origenTipo: efectivo.origen});
  if (nivel === "plantilla") {
    // Sin caída: cualquier vínculo inválido deja el requerimiento NO
    // elegible (es un error de configuración de la plantilla). El tipo de
    // cada documento es el suyo (el vínculo define el tipo): ya no se
    // compara con un tipo del requerimiento; sin tipo, el guardado.
    for (const d of documentos) {
      if (!d.habilitado) return resultado(false, "documento_deshabilitado");
      if (d.sensible) return resultado(false, "dato_sensible");
      if (!d.documentoClave) return resultado(false, "seccion_sin_documentos");
      const motivo = motivoTipo(
          tiposPorCodigo?.get(d.tipoDocumentalCodigo) || tipo || null);
      if (motivo) return resultado(false, motivo);
    }
    return resultado(true, null);
  }
  // Mapeo, carpeta libre y calce por tipo: rige el tipo efectivo.
  const motivo = motivoTipo(efectivo.tipo);
  if (motivo) return resultado(false, motivo);
  if (libre || nivel === "mapeo") return resultado(true, null);
  if (nivel === "tipo") {
    const habilitados = documentos.filter((d) => d.habilitado);
    if (!habilitados.length) {
      return resultado(false, "documento_deshabilitado");
    }
    if (!habilitados.some((d) => !d.sensible)) {
      return resultado(false, "dato_sensible");
    }
    return resultado(true, null);
  }
  return resultado(false, "no_en_plantilla");
}

const claveUbicacion = (seccionClave, documentoClave) =>
  `${seccionClave}|${documentoClave || ""}`;

/**
 * Opciones de ubicación de la plantilla para un requerimiento de ese tipo
 * de entidad (selector de Nuevo Requerimiento): cada documento del contexto
 * y cada sección del contexto sin documentos, con el requerimiento al que
 * hoy está vinculado (documento sobre sección).
 * @param {?Object} plantilla Plantilla.
 * @param {string} tipoEntidad "empresa" | "persona" | "recurso".
 * @return {Object[]} [{seccionClave, seccion, documentoClave, documento,
 *     tipoDocumentalCodigo, habilitado, sensible, requerimientoId}].
 */
function opcionesUbicacion(plantilla, tipoEntidad) {
  const opciones = [];
  ((plantilla && plantilla.secciones) || []).forEach((s) => {
    const docs = documentosEnContexto(s, tipoEntidad);
    if (!docs) return;
    if (!docs.length) {
      opciones.push({...elemento(s, null),
        requerimientoId: s.requerimientoId || null});
      return;
    }
    docs.forEach((d) => opciones.push({...elemento(s, d),
      requerimientoId: requerimientoDeDocumento(s, d)}));
  });
  return opciones;
}

/**
 * Secciones de la plantilla con la ubicación de un requerimiento cambiada
 * a `seleccion` (los documentos elegidos quedan vinculados SOLO a él: un
 * documento tiene un solo requerimiento; los que deja de tener quedan sin
 * vínculo propio). Si el requerimiento estaba vinculado a una sección con
 * documentos, el vínculo pasa a sus documentos elegidos (los documentos de
 * esa sección de otra entidad conservan el vínculo, ahora explícito). No
 * modifica la plantilla recibida.
 * @param {Object} plantilla Plantilla actual.
 * @param {string} requerimientoId Requerimiento.
 * @param {string} tipoEntidad Tipo de entidad del requerimiento.
 * @param {Array<{seccionClave: string, documentoClave: ?string}>} seleccion
 *     Ubicaciones elegidas.
 * @return {{secciones: Object[], cambios: {agregados: Object[],
 *     quitados: Object[], movidos: Object[]}}} Resultado (cambios vacíos:
 *     no hay que guardar).
 */
function aplicarUbicacionRequerimiento(plantilla, requerimientoId,
    tipoEntidad, seleccion) {
  const elegidos = new Set((seleccion || []).map((x) =>
    claveUbicacion(x.seccionClave, x.documentoClave)));
  const validas = new Set(opcionesUbicacion(plantilla, tipoEntidad)
      .map((o) => claveUbicacion(o.seccionClave, o.documentoClave)));
  const invalidas = [...elegidos].filter((k) => !validas.has(k));
  if (invalidas.length) {
    throw Object.assign(new Error("La ubicación elegida no existe en la " +
        "plantilla activa para este tipo de entidad."),
    {codigo: "UBICACION_INVALIDA"});
  }
  const cambios = {agregados: [], quitados: [], movidos: []};
  const registrar = (antes, despues, s, d) => {
    const item = {seccionClave: s.clave, documentoClave: d?.clave || null};
    if (antes === requerimientoId && despues !== requerimientoId) {
      cambios.quitados.push(item);
    } else if (antes !== requerimientoId && despues === requerimientoId) {
      if (antes) cambios.movidos.push({...item, desde: antes});
      else cambios.agregados.push(item);
    }
  };
  const secciones = ((plantilla && plantilla.secciones) || []).map((s) => {
    if (!documentosEnContexto(s, tipoEntidad)) return s;
    const copia = {...s,
      ...(s.archivosSeccion ? {archivosSeccion: s.archivosSeccion
          .map((d) => ({...d}))} : {}),
      ...(s.documentos ? {documentos: s.documentos.map((d) => ({...d}))} :
        {})};
    const docs = documentosEnContexto(copia, tipoEntidad);
    if (!docs.length) {
      const antes = copia.requerimientoId || null;
      const despues = elegidos.has(claveUbicacion(s.clave, null)) ?
        requerimientoId : antes === requerimientoId ? null : antes;
      copia.requerimientoId = despues;
      registrar(antes, despues, s, null);
      return copia;
    }
    const enContexto = new Set(docs);
    const todos = [...(copia.archivosSeccion || []),
      ...(copia.documentos || [])];
    const antesDe = new Map(todos.map((d) =>
      [d, requerimientoDeDocumento(copia, d)]));
    if (copia.requerimientoId === requerimientoId) {
      // El vínculo de sección pasa a ser por documento: los de otra entidad
      // lo conservan explícito; los del contexto quedan según la selección.
      todos.forEach((d) => {
        if (!enContexto.has(d) && !d.requerimientoId) {
          d.requerimientoId = requerimientoId;
        }
      });
      copia.requerimientoId = null;
    }
    docs.forEach((d) => {
      if (elegidos.has(claveUbicacion(s.clave, d.clave))) {
        d.requerimientoId = requerimientoId;
      } else if (d.requerimientoId === requerimientoId) {
        d.requerimientoId = null;
      }
      registrar(antesDe.get(d), requerimientoDeDocumento(copia, d), s, d);
    });
    return copia;
  });
  return {secciones, cambios};
}

module.exports = {
  ENTIDAD_PLANTILLA, documentosEnContexto, requerimientoDeDocumento,
  requerimientoDeArchivo, requerimientosVinculados, ubicacionRequerimiento,
  opcionesUbicacion, aplicarUbicacionRequerimiento, tipoDeRequerimiento,
  vinculadosEnPlantilla,
};
