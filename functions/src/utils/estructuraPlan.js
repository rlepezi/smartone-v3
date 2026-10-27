const {
  calzarSecciones, calzarDocumentos, extraerFechaDeNombre,
  extraerNombreEmpresa, extraerPatente, normalizarTexto,
  quitarPrefijoNumerico,
} = require("./estructuraCalce");
const {extraerRunDeNombreCarpeta} = require("../services/reglasService");
const {
  ESTADOS_IA_ELEGIBLES, seccionHabilitada, documentoHabilitado,
} = require("./alcanceValidacion");

// Plan de revisión de una carpeta (Revisiones IA) contra la plantilla de
// estructura del Mandante. Funciones PURAS: reciben el árbol de metadatos
// (nombre, ruta, tamaño de cada archivo; nunca el contenido) y devuelven la
// completitud por sección/entidad y qué archivos irían a la IA. La misma
// lógica sirve para cualquier fuente (carpeta local hoy; SharePoint después
// arma el mismo árbol listando Microsoft Graph).
//
// Árbol: {nombre, ruta, carpetas: [nodo], archivos: [{nombre, ruta,
// tamanoBytes, ultimaModificacion}]}. `ruta` es relativa a la raíz elegida
// ("" para la raíz).

const MIN_SECCIONES_EMPRESA = 3;
const MAX_BYTES_IA = 10 * 1024 * 1024;
const MIME_DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Word (.docx): el navegador extrae sus imágenes y envía cada una a la IA.
const MIME_POR_EXTENSION = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", pdf: "application/pdf", docx: MIME_DOCX,
};

const extension = (nombre) => (String(nombre).includes(".") ?
  String(nombre).split(".").pop().toLowerCase() : "");

/**
 * Cantidad de carpetas hijas que calzan con una sección de la plantilla.
 * @param {Object} nodo Carpeta.
 * @param {Object[]} secciones Secciones.
 * @return {number} Puntaje de estructura.
 */
function puntajeEstructura(nodo, secciones) {
  return calzarSecciones(nodo.carpetas || [], secciones)
      .filter((r) => r.seccionClave).length;
}

/**
 * Detecta si la raíz es una carpeta de empresa o un repositorio de
 * empresas. Un prefijo numérico en los hijos no basta: deben calzar con
 * secciones de la plantilla.
 * @param {Object} arbol Raíz.
 * @param {Object[]} secciones Secciones.
 * @return {{tipo: ?string, empresas: Object[]}} "empresa", "repositorio" o
 *     null (no reconocida).
 */
function detectarEmpresas(arbol, secciones) {
  const propio = puntajeEstructura(arbol, secciones);
  const hijos = (arbol.carpetas || []).map((h) =>
    ({nodo: h, puntaje: puntajeEstructura(h, secciones)}));
  const maxHijos = Math.max(0, ...hijos.map((h) => h.puntaje));
  if (propio >= MIN_SECCIONES_EMPRESA && propio > maxHijos) {
    return {tipo: "empresa", empresas: [arbol]};
  }
  const empresas = hijos.filter((h) => h.puntaje >= MIN_SECCIONES_EMPRESA)
      .map((h) => h.nodo);
  return empresas.length ?
    {tipo: "repositorio", empresas} : {tipo: null, empresas: []};
}

/**
 * Todos los archivos bajo una carpeta (recursivo).
 * @param {Object} nodo Carpeta.
 * @return {Object[]} Archivos.
 */
function archivosRecursivos(nodo) {
  return [...(nodo.archivos || []),
    ...(nodo.carpetas || []).flatMap(archivosRecursivos)];
}

/**
 * Clave de consolidación de una entidad: la misma persona en dos secciones
 * (trabajadores y conductores) comparte clave dentro de la empresa.
 * @param {string} empresaCarpeta Carpeta de la empresa.
 * @param {?string} entidadTipo "persona" | "maquinaria" | null.
 * @param {string} identidad personaId, patente o nombre normalizado.
 * @return {string} Clave.
 */
function claveEntidad(empresaCarpeta, entidadTipo, identidad) {
  return `${empresaCarpeta}|${entidadTipo || "grupo"}|${identidad}`;
}

/**
 * Nombre de una entidad desde su carpeta (sin prefijo numérico ni RUT).
 * @param {string} nombreCarpeta Carpeta.
 * @return {string} Nombre limpio.
 */
function nombreEntidad(nombreCarpeta) {
  // Primero el RUT: si encabeza el nombre, sus dígitos no son un prefijo.
  const sinRut = String(nombreCarpeta || "")
      .replace(/\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]/g, "");
  return quitarPrefijoNumerico(sinRut).resto.replace(/\s+/g, " ").trim();
}

/**
 * Completitud de un conjunto de archivos contra documentos esperados.
 * @param {Object[]} archivos Archivos.
 * @param {Object[]} documentos Documentos esperados.
 * @return {Object} {calce, documentosEncontrados, documentosFaltantes,
 *     archivosNoReconocidos, advertencias}.
 */
function evaluarDocumentos(archivos, documentos) {
  // El calce es contra TODOS los documentos (también los deshabilitados):
  // así un contrato deshabilitado no aparece como "no reconocido".
  const calce = calzarDocumentos(archivos, documentos);
  const habilitados = documentos.filter(documentoHabilitado);
  return {
    calce,
    documentosIgnorados: documentos
        .filter((d) => !documentoHabilitado(d) &&
            (calce.porDocumento[d.clave] || []).length)
        .map((d) => ({
          clave: d.clave, nombre: d.nombre,
          archivos: calce.porDocumento[d.clave].map((a) => a.nombre),
        })),
    documentosEncontrados: habilitados
        .filter((d) => (calce.porDocumento[d.clave] || []).length)
        .map((d) => ({
          clave: d.clave, nombre: d.nombre,
          archivos: calce.porDocumento[d.clave].map((a) => a.nombre),
          sensible: Boolean(d.datosSensibles),
        })),
    documentosFaltantes: habilitados
        .filter((d) => d.obligatorio &&
            !(calce.porDocumento[d.clave] || []).length)
        .map((d) => d.clave),
    archivosNoReconocidos: calce.noReconocidos.map((a) => a.nombre),
    advertencias: calce.advertencias,
  };
}

/**
 * Clasifica los archivos calzados de una sección o entidad: para la IA
 * (tipo normalizado en piloto/activo, no sensible, formato y tamaño
 * aceptados) o excluidos con motivo.
 * @param {Object} entrada Datos.
 * @return {{archivosIA: Object[], excluidos: Object[]}} Clasificación.
 */
function clasificarParaIA({calce, documentos, tipoDe, contexto}) {
  const archivosIA = [];
  const excluidos = [];
  const docPorClave = new Map(documentos.map((d) => [d.clave, d]));
  calce.calces.forEach(({nombre, documentoClave}) => {
    const archivo = calce.archivosPorNombre.get(nombre);
    const doc = documentoClave ? docPorClave.get(documentoClave) : null;
    const excluir = (motivo) => excluidos.push({
      rutaRelativa: archivo.ruta, nombre, documentoClave, motivo,
      entidadCarpeta: contexto.entidadCarpeta,
    });
    if (!doc) return excluir("no_reconocido");
    if (!documentoHabilitado(doc)) return excluir("deshabilitado");
    if (doc.datosSensibles) return excluir("datos_sensibles");
    const tipo = doc.tipoDocumentalCodigo ?
        tipoDe(doc.tipoDocumentalCodigo) : null;
    if (!tipo) return excluir("tipo_no_normalizado");
    if (tipo.estado !== "activo") return excluir("tipo_inactivo");
    if (!ESTADOS_IA_ELEGIBLES.includes(tipo.estadoIA)) {
      return excluir("tipo_no_normalizado");
    }
    const mime = MIME_POR_EXTENSION[extension(nombre)];
    if (!mime) return excluir("formato_no_soportado");
    if ((archivo.tamanoBytes || 0) > MAX_BYTES_IA) return excluir("tamano");
    archivosIA.push({
      rutaRelativa: archivo.ruta, nombre, mime,
      tamanoBytes: archivo.tamanoBytes || 0,
      ultimaModificacion: archivo.ultimaModificacion || null,
      documentoClave, tipoDocumentalCodigo: doc.tipoDocumentalCodigo,
      fechaEnNombreArchivo: extraerFechaDeNombre(nombre),
      ...contexto,
    });
    return null;
  });
  return {archivosIA, excluidos};
}

/**
 * Analiza una carpeta de empresa (y sus subcontratos) contra la plantilla.
 * @param {Object} nodo Carpeta de la empresa.
 * @param {Object} plantilla Plantilla ({secciones,
 *     profundidadSubcontratos}).
 * @param {Object} opciones {tipos: Map (código → tipo documental, con
 *     estado y estadoIA) o tiposIA: Set (códigos elegibles), calcesManuales,
 *     profundidad, esSubcontrato}.
 * @return {Object[]} Empresas analizadas (la principal y sus subcontratos).
 */
function analizarEmpresa(nodo, plantilla, opciones) {
  const {tipos, tiposIA, calcesManuales = {}, esSubcontrato = false} =
      opciones;
  const tipoDe = (codigo) => (tipos ? tipos.get(codigo) || null :
    tiposIA?.has(codigo) ? {estado: "activo", estadoIA: "piloto"} : null);
  const profundidad = opciones.profundidad ??
      (plantilla.profundidadSubcontratos ?? 1);
  const empresaCarpeta = nodo.ruta || nodo.nombre;
  const secciones = plantilla.secciones || [];
  const manuales = calcesManuales[empresaCarpeta] || {};
  const calces = calzarSecciones(nodo.carpetas || [], secciones, manuales);
  const carpetaPorNombre = new Map((nodo.carpetas || [])
      .map((c) => [c.nombre, c]));
  const base = {empresaCarpeta, esSubcontrato};
  const resultados = [];
  const entidades = [];
  const archivosIA = [];
  const excluidos = [];
  const advertencias = [];
  const subempresas = [];

  const conArchivos = (archivos) => ({archivosPorNombre:
    new Map(archivos.map((a) => [a.nombre, a]))});

  // Carpetas que no calzan con ninguna sección: se muestran, no penalizan.
  calces.filter((c) => !c.seccionClave).forEach((c) => {
    const carpeta = carpetaPorNombre.get(c.carpeta);
    resultados.push({
      ...base, seccionClave: null, seccionCarpeta: c.carpeta,
      calce: {metodo: null, similitud: 0}, entidadCarpeta: null,
      entidadTipo: null, esperado: {}, encontrado:
          archivosRecursivos(carpeta).length,
      documentosEncontrados: [], documentosFaltantes: [],
      archivosNoReconocidos: archivosRecursivos(carpeta).map((a) => a.nombre),
      calceArchivos: [], advertencias: [], estado: "no_reconocida",
    });
  });

  secciones.forEach((s) => {
    const calce = calces.find((c) => c.seccionClave === s.clave);
    const card = s.cardinalidad || {min: 0, max: null};
    if (!seccionHabilitada(s)) {
      const carpeta = calce ? carpetaPorNombre.get(calce.carpeta) : null;
      const archivos = carpeta ? archivosRecursivos(carpeta) : [];
      resultados.push({
        ...base, seccionClave: s.clave, seccionCarpeta: calce?.carpeta || null,
        calce: calce ? {metodo: calce.metodo, similitud: calce.similitud} :
          {metodo: null, similitud: 0},
        entidadCarpeta: null, entidadTipo: null, esperado: {},
        encontrado: archivos.length, documentosEncontrados: [],
        documentosFaltantes: [], documentosIgnorados: [],
        archivosNoReconocidos: [], calceArchivos: [], advertencias: [],
        estado: "deshabilitada",
      });
      archivos.forEach((a) => excluidos.push({
        rutaRelativa: a.ruta, nombre: a.nombre, documentoClave: null,
        motivo: "deshabilitado", entidadCarpeta: null,
      }));
      return;
    }
    if (!calce) {
      resultados.push({
        ...base, seccionClave: s.clave, seccionCarpeta: null,
        calce: {metodo: null, similitud: 0}, entidadCarpeta: null,
        entidadTipo: null, esperado: {min: card.min || 0}, encontrado: 0,
        documentosEncontrados: [], documentosFaltantes: [],
        archivosNoReconocidos: [], calceArchivos: [], advertencias: [],
        estado: s.obligatoria ? "faltante" : "no_aplica",
      });
      return;
    }
    const carpeta = carpetaPorNombre.get(calce.carpeta);
    const seccionBase = {...base, seccionClave: s.clave,
      seccionCarpeta: calce.carpeta,
      calce: {metodo: calce.metodo, similitud: calce.similitud}};

    if (s.tipo === "archivos") {
      const archivos = archivosRecursivos(carpeta);
      const documentos = [...(s.archivosSeccion || []),
        ...(s.documentos || [])];
      const ev = evaluarDocumentos(archivos, documentos);
      const incompleto = ev.documentosFaltantes.length ||
          archivos.length < (card.min || 0);
      resultados.push({
        ...seccionBase, entidadCarpeta: null, entidadTipo: null,
        esperado: {min: card.min || 0, documentos: documentos
            .filter((d) => d.obligatorio).length},
        encontrado: archivos.length,
        documentosEncontrados: ev.documentosEncontrados,
        documentosIgnorados: ev.documentosIgnorados,
        documentosFaltantes: ev.documentosFaltantes,
        archivosNoReconocidos: documentos.length ?
            ev.archivosNoReconocidos : [],
        calceArchivos: ev.calce.calces, advertencias: ev.advertencias,
        estado: incompleto ? "incompleto" : "completo",
      });
      // Sección sin documentos esperados (ej. Cronograma): solo cuenta
      // archivos; no hay nada que validar con IA.
      if (documentos.length) {
        const ia = clasificarParaIA({
          calce: {...ev.calce, ...conArchivos(archivos)}, documentos, tipoDe,
          contexto: {seccionClave: s.clave, entidadCarpeta: null,
            entidadClave: null, empresaCarpeta},
        });
        archivosIA.push(...ia.archivosIA);
        excluidos.push(...ia.excluidos);
      }
      return;
    }

    const hijos = carpeta.carpetas || [];
    if (s.tipo === "subcontratos") {
      resultados.push({
        ...seccionBase, entidadCarpeta: null, entidadTipo: null,
        esperado: {min: card.min || 0}, encontrado: hijos.length,
        documentosEncontrados: [], documentosFaltantes: [],
        archivosNoReconocidos: [], calceArchivos: [], advertencias: [],
        estado: hijos.length < (card.min || 0) ? "incompleto" : "completo",
      });
      if (profundidad > 0) {
        hijos.forEach((h) => subempresas.push(...analizarEmpresa(h, plantilla,
            {...opciones, profundidad: profundidad - 1, esSubcontrato: true})));
      } else if (hijos.length) {
        advertencias.push(`${calce.carpeta}: subcontratos más profundos ` +
            "que lo configurado en la plantilla; no se revisan.");
      }
      return;
    }

    // entidades / grupos: archivos sueltos de la sección + una carpeta por
    // entidad.
    const sueltos = carpeta.archivos || [];
    const evSueltos = evaluarDocumentos(sueltos, s.archivosSeccion || []);
    const fueraDeRango = hijos.length < (card.min || 0) ||
        (card.max !== null && card.max !== undefined &&
            hijos.length > card.max);
    resultados.push({
      ...seccionBase, entidadCarpeta: null, entidadTipo: null,
      esperado: {min: card.min || 0, max: card.max ?? null},
      encontrado: hijos.length,
      documentosEncontrados: evSueltos.documentosEncontrados,
      documentosIgnorados: evSueltos.documentosIgnorados,
      documentosFaltantes: evSueltos.documentosFaltantes,
      archivosNoReconocidos: evSueltos.archivosNoReconocidos,
      calceArchivos: evSueltos.calce.calces,
      advertencias: evSueltos.advertencias,
      estado: fueraDeRango || evSueltos.documentosFaltantes.length ?
        "incompleto" : "completo",
    });
    const entidadTipo = s.tipo === "entidades" ? s.entidad || null : null;
    hijos.forEach((h) => {
      const archivos = archivosRecursivos(h);
      const documentos = s.documentos || [];
      const ev = evaluarDocumentos(archivos, documentos);
      const nombre = nombreEntidad(h.nombre);
      const patente = entidadTipo === "maquinaria" ? extraerPatente(h.nombre) :
        null;
      const entidadClave = claveEntidad(empresaCarpeta, entidadTipo,
          patente || normalizarTexto(nombre));
      entidades.push({
        seccionClave: s.clave, entidadCarpeta: h.ruta, entidadNombre: nombre,
        entidadTipo, rolEntidad: s.rolEntidad || null, entidadClave,
        runCarpeta: entidadTipo === "persona" ?
            extraerRunDeNombreCarpeta(h.nombre) : null,
        patente,
      });
      resultados.push({
        ...seccionBase, entidadCarpeta: h.ruta, entidadNombre: nombre,
        entidadTipo, entidadClave, esperado: {documentos: documentos
            .filter((d) => d.obligatorio).length},
        encontrado: archivos.length,
        documentosEncontrados: ev.documentosEncontrados,
        documentosIgnorados: ev.documentosIgnorados,
        documentosFaltantes: ev.documentosFaltantes,
        archivosNoReconocidos: ev.archivosNoReconocidos,
        calceArchivos: ev.calce.calces, advertencias: ev.advertencias,
        estado: documentos.length && ev.documentosFaltantes.length ?
          "incompleto" : "completo",
      });
      const ia = clasificarParaIA({
        calce: {...ev.calce, ...conArchivos(archivos)}, documentos, tipoDe,
        contexto: {seccionClave: s.clave, entidadCarpeta: h.ruta,
          entidadClave, empresaCarpeta},
      });
      archivosIA.push(...ia.archivosIA);
      excluidos.push(...ia.excluidos);
    });
  });

  return [{
    empresaCarpeta, esSubcontrato,
    ...(() => {
      const {nombreEmpresa, textoProyecto} = extraerNombreEmpresa(nodo.nombre);
      return {nombreEmpresaDetectado: nombreEmpresa, textoProyecto};
    })(),
    runCarpeta: extraerRunDeNombreCarpeta(nodo.nombre),
    secciones: resultados, entidades, archivosIA,
    archivosExcluidosIA: excluidos, advertencias,
  }, ...subempresas];
}

/**
 * Analiza el árbol completo: detecta las empresas y arma su completitud y
 * los archivos para la IA.
 * @param {Object} arbol Árbol de metadatos.
 * @param {Object} plantilla Plantilla activa.
 * @param {{tiposIA: Set<string>, calcesManuales: Object}} opciones
 *     Opciones.
 * @return {{tipo: ?string, empresas: Object[]}} Plan (sin enlaces).
 */
function analizarArbol(arbol, plantilla, opciones) {
  const {tipo, empresas} = detectarEmpresas(arbol, plantilla.secciones || []);
  return {
    tipo,
    empresas: empresas.flatMap((e) => analizarEmpresa(e, plantilla, opciones)),
  };
}

/**
 * Plan "carpeta libre": sin plantilla ni completitud. Todo archivo de
 * formato y tamaño aceptados va a la IA, que detecta el tipo documental.
 * Cada carpeta con archivos es una entidad (persona); los archivos sueltos
 * de la raíz, una entidad por archivo. La persona y sus expedientes se
 * resuelven al consolidar, por el RUN del documento.
 * @param {Object} arbol Árbol de metadatos.
 * @return {{tipo: string, empresas: Object[]}} Plan con una sola "empresa"
 *     (la carpeta elegida).
 */
function analizarLibre(arbol) {
  const empresaCarpeta = arbol.ruta || arbol.nombre;
  const entidades = [];
  const archivosIA = [];
  const excluidos = [];
  const agregar = (archivo, entidad) => {
    const excluir = (motivo) => excluidos.push({
      rutaRelativa: archivo.ruta, nombre: archivo.nombre, documentoClave: null,
      motivo, entidadCarpeta: entidad.entidadCarpeta,
    });
    const mime = MIME_POR_EXTENSION[extension(archivo.nombre)];
    if (!mime) return excluir("formato_no_soportado");
    if ((archivo.tamanoBytes || 0) > MAX_BYTES_IA) return excluir("tamano");
    archivosIA.push({
      rutaRelativa: archivo.ruta, nombre: archivo.nombre, mime,
      tamanoBytes: archivo.tamanoBytes || 0,
      ultimaModificacion: archivo.ultimaModificacion || null,
      documentoClave: null, tipoDocumentalCodigo: null,
      fechaEnNombreArchivo: extraerFechaDeNombre(archivo.nombre),
      seccionClave: null, entidadCarpeta: entidad.entidadCarpeta,
      entidadClave: entidad.entidadClave, empresaCarpeta,
    });
    return null;
  };
  // nombreOriginal: nombre de la carpeta o archivo, del que se toma el RUN.
  const entidadDe = (carpeta, nombreOriginal, identidad) => {
    const entidad = {
      seccionClave: null, entidadCarpeta: carpeta,
      entidadNombre: nombreEntidad(nombreOriginal),
      entidadTipo: "persona", rolEntidad: null,
      entidadClave: claveEntidad(empresaCarpeta, "persona", identidad),
      runCarpeta: extraerRunDeNombreCarpeta(nombreOriginal), patente: null,
    };
    entidades.push(entidad);
    return entidad;
  };
  (arbol.archivos || []).forEach((a) => {
    agregar(a, entidadDe(null, a.nombre.replace(/\.[^.]+$/, ""),
        `archivo:${a.ruta}`));
  });
  const recorrer = (nodo) => {
    (nodo.carpetas || []).forEach((c) => {
      if ((c.archivos || []).length) {
        const entidad = entidadDe(c.ruta, c.nombre,
            `carpeta:${normalizarTexto(c.ruta)}`);
        c.archivos.forEach((a) => agregar(a, entidad));
      }
      recorrer(c);
    });
  };
  recorrer(arbol);
  const {nombreEmpresa, textoProyecto} = extraerNombreEmpresa(arbol.nombre);
  return {
    tipo: "libre",
    empresas: [{
      empresaCarpeta, esSubcontrato: false,
      nombreEmpresaDetectado: nombreEmpresa, textoProyecto,
      runCarpeta: extraerRunDeNombreCarpeta(arbol.nombre),
      secciones: [], entidades: entidades.filter((e) =>
        archivosIA.some((a) => a.entidadClave === e.entidadClave) ||
        excluidos.some((x) => x.entidadCarpeta === e.entidadCarpeta &&
            e.entidadCarpeta)),
      archivosIA, archivosExcluidosIA: excluidos, advertencias: [],
    }],
  };
}

module.exports = {
  MIME_DOCX, analizarLibre,
  MIN_SECCIONES_EMPRESA, puntajeEstructura, detectarEmpresas,
  archivosRecursivos, claveEntidad, nombreEntidad, analizarEmpresa,
  analizarArbol,
};
