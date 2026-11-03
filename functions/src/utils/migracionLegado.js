const {validarRutaRelativa} = require("./repositorioDocumental");
const {validarCarpetaEmpresa} = require("./carpetaEmpresa");
const {
  idCarpeta, validarRutaCarpeta, validarUrlCarpeta, validarAsignaciones,
} = require("./carpetasEmpresa");
const {entradasMapeo} = require("./carpetaExpediente");

// Migración E6: expedientes con la configuración anterior de su carpeta
// (configRevisionExpediente.repositorioDocumental) pasan a una Carpeta de
// empresa. Funciones PURAS: clasificar cada expediente y trasladar su mapeo
// sin sobrescribir. La migración no enseña patrones.

const ORIGEN_MIGRACION = "migracion";
const AUTOR_MIGRACION = "migracion-e6";

const CLASES = {
  migrable: "Se migra",
  ya_migrado: "Ya migrado (se omite)",
  cerrado: "Expediente cerrado (queda con la configuración anterior)",
  sin_fuente: "El Mandante no tiene fuente documental activa",
  fuente_distinta: "La carpeta está en SharePoint y la fuente es local, o " +
    "al revés",
  ruta_invalida: "La carpeta guardada no es válida en la fuente",
  no_corresponde_empresa: "El nombre de la carpeta no corresponde a la " +
    "Empresa",
  carpeta_en_uso: "La carpeta ya la usa otro expediente, proyecto o empresa",
};

/**
 * Clasifica un expediente con configuración anterior.
 * @param {Object} e Datos.
 * @param {Object} e.expediente Expediente ({id, estado, empresaId,
 *     proyectoId, repositorioDocumental}).
 * @param {Object} e.legado configRevisionExpediente.repositorioDocumental
 *     ({tipo, etiqueta, url, mapeo, migradoA}).
 * @param {?Object} e.fuente Fuente activa del Mandante ({id, tipo, config}).
 * @param {?Object} e.empresa Empresa ({id, razonSocial, nombreFantasia,
 *     rut}).
 * @param {?Object} e.carpeta Carpeta de empresa existente con ese ID.
 * @param {?Object} e.otroExpediente Expediente al que está vinculada.
 * @param {Map<string, Object>} [e.tomadas] Carpetas que esta misma corrida
 *     ya asignó (id → {expedienteId, proyectoId, empresaId}).
 * @return {{clase: string, detalle: ?string, ruta: ?string, url: ?string,
 *     carpetaId: ?string}} Clasificación.
 */
function clasificarLegado({expediente, legado, fuente, empresa, carpeta = null,
  otroExpediente = null, tomadas = new Map()}) {
  const r = (clase, detalle = null, extra = {}) => ({clase, detalle,
    ruta: null, url: null, carpetaId: null, ...extra});
  if (expediente?.repositorioDocumental?.carpetaEmpresaId || legado?.migradoA) {
    return r("ya_migrado");
  }
  if (expediente?.estado === "cerrado") return r("cerrado");
  if (!fuente) return r("sin_fuente");
  if (fuente.tipo !== legado?.tipo) {
    return r("fuente_distinta", `Configuración anterior: ${legado?.tipo}; ` +
        `fuente activa: ${fuente.tipo}.`);
  }
  let ruta;
  let url = null;
  if (fuente.tipo === "sharepoint") {
    const v = validarUrlCarpeta(legado.url, fuente.config?.siteUrl);
    if (!v.ok) return r("ruta_invalida", v.error);
    ({ruta, url} = v);
  } else {
    const v = validarRutaCarpeta(legado.etiqueta);
    if (!v.ok) return r("ruta_invalida", v.error);
    ruta = v.valor;
  }
  const v = validarCarpetaEmpresa(ruta, empresa);
  if (!v.valida) {
    return r("no_corresponde_empresa", `«${ruta}» no contiene ` +
        `${v.terminosBuscados.join(" ni ") || "datos de la empresa"}.`,
    {ruta, url});
  }
  const carpetaId = idCarpeta(fuente.id, ruta);
  const extra = {ruta, url, carpetaId};
  const ocupada = tomadas.get(carpetaId) || (carpeta ? {
    expedienteId: carpeta.expedienteId || null,
    proyectoId: carpeta.proyectoId || null, empresaId: carpeta.empresaId,
    expedienteEstado: otroExpediente?.estado || null,
  } : null);
  if (ocupada) {
    if (ocupada.empresaId && ocupada.empresaId !== expediente.empresaId) {
      return r("carpeta_en_uso", "Registrada para otra empresa.", extra);
    }
    if (ocupada.proyectoId && ocupada.proyectoId !== expediente.proyectoId) {
      return r("carpeta_en_uso", "Corresponde a otro proyecto de la misma " +
          "empresa (cada proyecto usa su propia carpeta).", extra);
    }
    if (ocupada.expedienteId && ocupada.expedienteId !== expediente.id &&
        ocupada.expedienteEstado !== "cerrado") {
      return r("carpeta_en_uso", "Vinculada a otro expediente activo.", extra);
    }
  }
  return r("migrable", null, extra);
}

/**
 * Mapeo de la Carpeta de empresa tras sumar el de la configuración anterior,
 * SIN sobrescribir: un requerimiento que ya tiene ubicaciones no se toca, la
 * carpeta del personal y la de maquinarias solo se completan si faltan, y
 * cada entrada nueva debe cumplir las reglas de asignación (si no, se omite
 * con su motivo).
 * @param {?Object} legadoMapeo {carpetaPersonas, carpetaRecursos,
 *     requerimientos: {id: "ruta" | [entradas]}}.
 * @param {Object} actual {mapeo, carpetaPersonas, carpetaRecursos} de la
 *     Carpeta de empresa.
 * @param {*} ahora Fecha de confirmación (Date).
 * @param {Function} [nombreDe] id → nombre del requerimiento (mensajes).
 * @return {{mapeo: Object, carpetaPersonas: ?string,
 *     carpetaRecursos: ?string, agregadas: Object[], omitidas: Object[]}}
 *     Resultado.
 */
function mapeoDesdeLegado(legadoMapeo, actual, ahora, nombreDe = (id) => id) {
  const mapeo = {...(actual?.mapeo || {})};
  const omitidas = [];
  const agregadas = [];
  const especial = (campo) => {
    const valor = legadoMapeo?.[campo] || null;
    if (actual?.[campo] || !valor) return actual?.[campo] || null;
    const v = validarRutaRelativa(valor);
    return v.ok && v.valor ? v.valor : null;
  };
  const carpetaPersonas = especial("carpetaPersonas");
  const carpetaRecursos = especial("carpetaRecursos");
  if (validarAsignaciones({mapeo, carpetaPersonas, carpetaRecursos})) {
    // Las carpetas especiales del legado chocan con el mapeo actual: se
    // conservan las de la carpeta.
    return mapeoDesdeLegado({...legadoMapeo, carpetaPersonas: null,
      carpetaRecursos: null}, actual, ahora, nombreDe);
  }
  Object.entries(legadoMapeo?.requerimientos || {}).forEach(([id, valor]) => {
    entradasMapeo(valor).forEach((e) => {
      const omitir = (motivo) => omitidas.push({requerimientoId: id,
        requerimiento: nombreDe(id), ruta: e.ruta, motivo});
      if ((actual?.mapeo?.[id] || []).length) {
        omitir("El requerimiento ya tiene ubicación en la carpeta.");
        return;
      }
      const v = validarRutaRelativa(e.ruta);
      if (!v.ok || !v.valor) {
        omitir(v.error || "Ruta vacía.");
        return;
      }
      const entrada = {ruta: v.valor, tipo: "carpeta",
        origen: ORIGEN_MIGRACION, confirmadoPor: AUTOR_MIGRACION,
        confirmadoAt: ahora};
      const prueba = {...mapeo, [id]: [...(mapeo[id] || []), entrada]};
      const error = validarAsignaciones({mapeo: prueba, carpetaPersonas,
        carpetaRecursos}, nombreDe);
      if (error) {
        omitir(error);
        return;
      }
      mapeo[id] = prueba[id];
      agregadas.push({requerimientoId: id, ruta: v.valor});
    });
  });
  return {mapeo, carpetaPersonas, carpetaRecursos, agregadas, omitidas};
}

module.exports = {
  CLASES, ORIGEN_MIGRACION, AUTOR_MIGRACION, clasificarLegado,
  mapeoDesdeLegado,
};
