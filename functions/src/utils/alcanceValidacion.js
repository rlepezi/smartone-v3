const AppError = require("./AppError");
const {
  DESCRIPCION_REGLAS, REGLAS_POR_TIPO,
} = require("../../config/reglasValidacion");

// Habilitación de la plantilla de estructura y alcance de validación de
// Revisiones IA. Funciones PURAS.
//  - Cada sección (`habilitada`) y cada archivo suelto o documento
//    (`habilitado`) se puede deshabilitar. Ausente = habilitado (no hay
//    migración).
//  - Estado EFECTIVO de un documento: su sección habilitada Y él habilitado.
//    Deshabilitar una sección no toca a sus hijos: al rehabilitarla vuelven
//    exactamente como estaban.

const ESTADOS_IA_ELEGIBLES = ["piloto", "activo"];
const NIVELES = ["seccion", "archivoSeccion", "documento"];
const LISTA_POR_NIVEL = {archivoSeccion: "archivosSeccion",
  documento: "documentos"};

const seccionHabilitada = (s) => s?.habilitada !== false;
const documentoHabilitado = (d) => d?.habilitado !== false;

/**
 * Estado propio y efectivo de cada sección y documento.
 * @param {Object} plantilla Plantilla.
 * @return {Object<string, {habilitada: boolean, documentos: Object}>}
 *     seccionClave → {habilitada, documentos: {clave: {habilitado,
 *     efectivo, nivel}}}.
 */
function calcularEstadoEfectivo(plantilla) {
  const estado = {};
  (plantilla?.secciones || []).forEach((s) => {
    const habilitada = seccionHabilitada(s);
    const documentos = {};
    [["archivoSeccion", s.archivosSeccion], ["documento", s.documentos]]
        .forEach(([nivel, lista]) => (lista || []).forEach((d) => {
          documentos[d.clave] = {nivel, habilitado: documentoHabilitado(d),
            efectivo: habilitada && documentoHabilitado(d)};
        }));
    estado[s.clave] = {habilitada, documentos};
  });
  return estado;
}

/**
 * Modalidad de un documento habilitado: validación IA, solo completitud
 * (con motivo) o sensible.
 * @param {Object} d Documento.
 * @param {Map<string, Object>} tipos Tipos documentales por código.
 * @return {{modalidad: string, motivoModalidad: ?string}} Modalidad.
 */
function modalidadDe(d, tipos) {
  if (d.datosSensibles) {
    return {modalidad: "sensible", motivoModalidad: "datos_sensibles"};
  }
  if (!d.tipoDocumentalCodigo) {
    return {modalidad: "solo_completitud",
      motivoModalidad: "sin_tipo_documental"};
  }
  const tipo = tipos.get(d.tipoDocumentalCodigo);
  // Un tipo creado para las reglas por requerimiento no tiene extracción en
  // la revisión por carpetas.
  if (!tipo || tipo.soloReglas) {
    return {modalidad: "solo_completitud",
      motivoModalidad: "tipo_no_normalizado"};
  }
  if (tipo.estado !== "activo") {
    return {modalidad: "solo_completitud", motivoModalidad: "tipo_inactivo"};
  }
  if (!ESTADOS_IA_ELEGIBLES.includes(tipo.estadoIA)) {
    return {modalidad: "solo_completitud",
      motivoModalidad: "tipo_no_normalizado"};
  }
  return {modalidad: "ia", motivoModalidad: null};
}

/**
 * Reglas que se aplicarán a un tipo documental, con su descripción.
 * @param {Object} tipo Tipo documental.
 * @return {Array<{codigo: string, descripcion: string}>} Reglas.
 */
function reglasDeTipo(tipo) {
  const codigos = [...new Set([...(tipo.reglas || []),
    ...(REGLAS_POR_TIPO[tipo.codigo] || [])])].sort();
  return codigos.map((codigo) => ({codigo,
    descripcion: DESCRIPCION_REGLAS[codigo] || codigo}));
}

/**
 * Alcance de validación: documentos efectivamente habilitados con su
 * modalidad (IA, solo completitud o sensible), reglas y advertencias.
 * @param {Object} plantilla Plantilla.
 * @param {Object[]} tiposDocumentales Tipos documentales.
 * @return {Object} Alcance.
 */
function calcularAlcance(plantilla, tiposDocumentales) {
  const tipos = new Map((tiposDocumentales || []).map((t) => [t.codigo, t]));
  const secciones = plantilla?.secciones || [];
  const documentos = [];
  let documentosTotales = 0;
  secciones.forEach((s) => {
    [["archivoSeccion", s.archivosSeccion], ["documento", s.documentos]]
        .forEach(([nivel, lista]) => (lista || []).forEach((d) => {
          documentosTotales++;
          if (!seccionHabilitada(s) || !documentoHabilitado(d)) return;
          const {modalidad, motivoModalidad} = modalidadDe(d, tipos);
          const tipo = d.tipoDocumentalCodigo ?
              tipos.get(d.tipoDocumentalCodigo) || null : null;
          documentos.push({
            seccionClave: s.clave, seccionNombre: s.nombre, nivel,
            entidad: nivel === "documento" ? s.entidad || null : null,
            documentoClave: d.clave, documentoNombre: d.nombre,
            obligatorio: Boolean(d.obligatorio), multiple: Boolean(d.multiple),
            modalidad, motivoModalidad,
            tipoDocumental: tipo ? {codigo: tipo.codigo, nombre: tipo.nombre,
              estadoIA: tipo.estadoIA, estado: tipo.estado} : null,
            reglas: modalidad === "ia" ? reglasDeTipo(tipo) : [],
          });
        }));
  });

  const advertencias = [];
  if (!documentos.length) {
    advertencias.push({codigo: "sin_documentos", mensaje: "No hay " +
        "documentos habilitados: la revisión no tendría nada que revisar."});
  } else if (!documentos.some((d) => d.modalidad === "ia")) {
    advertencias.push({codigo: "sin_ia", mensaje: "Ningún documento " +
        "habilitado tiene validación IA: el modo con IA queda deshabilitado."});
  }
  documentos.filter((d) => d.motivoModalidad === "tipo_inactivo")
      .forEach((d) => advertencias.push({
        codigo: "tipo_inactivo", seccionClave: d.seccionClave,
        documentoClave: d.documentoClave,
        mensaje: `${d.documentoNombre} (${d.seccionNombre}) está habilitado ` +
            `y apunta al tipo documental inactivo ` +
            `${d.tipoDocumental.codigo}.`,
      }));
  const usados = new Set(documentos.map((d) => d.tipoDocumental?.codigo)
      .filter(Boolean));
  (tiposDocumentales || []).filter((t) => t.estado === "activo" &&
      !usados.has(t.codigo)).forEach((t) => advertencias.push({
    codigo: "tipo_sin_uso", tipoCodigo: t.codigo,
    mensaje: `El tipo documental ${t.nombre} está activo, pero ningún ` +
        "documento habilitado de la plantilla lo usa.",
  }));

  return {
    plantillaVersion: plantilla?.version ?? null,
    resumen: {
      seccionesHabilitadas: secciones.filter(seccionHabilitada).length,
      seccionesTotales: secciones.length,
      documentosHabilitados: documentos.length,
      documentosTotales,
      conValidacionIA: documentos.filter((d) => d.modalidad === "ia").length,
      soloCompletitud: documentos.filter((d) =>
        d.modalidad === "solo_completitud").length,
      sensibles: documentos.filter((d) => d.modalidad === "sensible").length,
    },
    documentos,
    advertencias,
  };
}

/**
 * Aplica cambios de habilitación a las secciones (sin mutar la entrada).
 * Identifica por clave, nunca por posición.
 * @param {Object[]} secciones Secciones actuales.
 * @param {Object[]} cambios [{nivel, seccionClave, elementoClave?,
 *     habilitado}].
 * @return {{secciones: Object[], aplicados: Object[]}} Secciones nuevas y
 *     los cambios efectivos (con el valor anterior).
 */
function aplicarHabilitacion(secciones, cambios) {
  if (!Array.isArray(cambios) || !cambios.length) {
    throw new AppError(400, "No hay cambios de habilitación.");
  }
  const nuevas = JSON.parse(JSON.stringify(secciones || []));
  const aplicados = [];
  cambios.forEach((c) => {
    if (!NIVELES.includes(c?.nivel) || typeof c.habilitado !== "boolean") {
      throw new AppError(400, "Cambio de habilitación inválido.");
    }
    const s = nuevas.find((x) => x.clave === c.seccionClave);
    if (!s) throw new AppError(400, `Sección "${c.seccionClave}" no existe.`);
    if (c.nivel === "seccion") {
      const anterior = seccionHabilitada(s);
      s.habilitada = c.habilitado;
      if (anterior !== c.habilitado) {
        aplicados.push({...c, elementoClave: null, anterior});
      }
      return;
    }
    const d = (s[LISTA_POR_NIVEL[c.nivel]] || [])
        .find((x) => x.clave === c.elementoClave);
    if (!d) {
      throw new AppError(400, `El elemento "${c.elementoClave}" no existe ` +
          `en ${c.seccionClave}.`);
    }
    const anterior = documentoHabilitado(d);
    d.habilitado = c.habilitado;
    if (anterior !== c.habilitado) aplicados.push({...c, anterior});
  });
  return {secciones: nuevas, aplicados};
}

/**
 * Cambios de una acción masiva: toda la plantilla o una sección (la
 * sección y todos sus hijos).
 * @param {Object[]} secciones Secciones.
 * @param {string} accion "habilitar_todo" | "deshabilitar_todo".
 * @param {?string} [seccionClave] Sección; sin ella, toda la plantilla.
 * @return {Object[]} Cambios para aplicarHabilitacion.
 */
function cambiosMasivos(secciones, accion, seccionClave = null) {
  if (!["habilitar_todo", "deshabilitar_todo"].includes(accion)) {
    throw new AppError(400, "Acción masiva inválida.");
  }
  const habilitado = accion === "habilitar_todo";
  const objetivo = seccionClave ?
      (secciones || []).filter((s) => s.clave === seccionClave) :
      (secciones || []);
  if (seccionClave && !objetivo.length) {
    throw new AppError(400, `Sección "${seccionClave}" no existe.`);
  }
  return objetivo.flatMap((s) => [
    {nivel: "seccion", seccionClave: s.clave, habilitado},
    ...(s.archivosSeccion || []).map((d) => ({nivel: "archivoSeccion",
      seccionClave: s.clave, elementoClave: d.clave, habilitado})),
    ...(s.documentos || []).map((d) => ({nivel: "documento",
      seccionClave: s.clave, elementoClave: d.clave, habilitado})),
  ]);
}

module.exports = {
  ESTADOS_IA_ELEGIBLES, seccionHabilitada, documentoHabilitado,
  calcularEstadoEfectivo, modalidadDe, calcularAlcance, aplicarHabilitacion,
  cambiosMasivos,
};
