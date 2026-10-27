const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const requerimientoRepository =
    require("../repositories/requerimientoRepository");
const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const mandanteRepository = require("../repositories/mandanteRepository");
const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");
const resultadoCompletitudRepository =
    require("../repositories/resultadoCompletitudRepository");
const aiConfigService = require("./aiConfigService");
const bitacoraLogger = require("../utils/bitacoraLogger");
const {getMandanteDisplayName} = require("../utils/mandanteDisplay");
const AppError = require("../utils/AppError");
const {
  conDefaults, validarEntidades, validarCampos,
} = require("../reglasIA/tiposDocumentales");
const {
  concordancia, costoPromedio, agruparPorNormalizar,
} = require("../utils/metricasIA");

const ESTADOS_IA = ["no_normalizado", "piloto", "activo"];
const UMBRAL_MINIMO = 0.5;
const UMBRAL_MAXIMO = 1;
// Tope de procesamientos OTRO que se agregan por consulta (si se alcanza, la
// respuesta lo indica con `truncado`).
const LIMITE_POR_NORMALIZAR = 5000;

/**
 * Administración de Tipos Documentales de Revisiones IA (superadmin):
 * listado con métricas y requerimientos que los usan, edición y los tipos
 * por normalizar (documentos clasificados como OTRO).
 */
class TipoDocumentalService {
  /**
   * Nombres de Mandante por ID.
   * @param {string[]} ids IDs.
   * @return {Promise<Map<string, string>>} ID → nombre.
   */
  async _nombresMandante(ids) {
    const mandantes = await mandanteRepository.getByIds(ids);
    return new Map(mandantes.map((m) =>
      [m.id, getMandanteDisplayName(m) || m.id]));
  }

  /**
   * Tipos con métricas calculadas y los requerimientos que los usan.
   * @return {Promise<Object[]>} Tipos.
   */
  async listar() {
    const tipos = await tipoDocumentalRepository.list();
    const requerimientosPorTipo = await Promise.all(tipos.map((t) =>
      requerimientoRepository.listByTipoDocumental(t.id)));
    const nombres = await this._nombresMandante(
        requerimientosPorTipo.flat().map((r) => r.mandanteId),
    );
    return tipos.map((t, i) => ({
      // entidades y campos: los guardados o los base (sin migración).
      ...conDefaults(t),
      concordancia: concordancia(t.metricas),
      costoPromedioUsd: costoPromedio(t.metricas),
      requerimientos: requerimientosPorTipo[i].map((r) => ({
        id: r.id,
        nombre: r.nombre,
        estado: r.estado,
        mandanteId: r.mandanteId,
        mandanteNombre: nombres.get(r.mandanteId) || r.mandanteId,
        estadoIA: r.estadoIA || "sin_reglas",
      })),
    })).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }

  /**
   * Habilita o deshabilita un tipo documental (estado activo / inactivo).
   * Un tipo inactivo nunca es elegible para la IA.
   * @param {string} id ID del tipo.
   * @param {string} estado "activo" | "inactivo".
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Tipo actualizado.
   */
  async cambiarEstado(id, estado, actor) {
    if (!["activo", "inactivo"].includes(estado)) {
      throw new AppError(400, "Estado no válido: use activo o inactivo.");
    }
    const previo = await tipoDocumentalRepository.getById(id);
    if (!previo) throw new AppError(404, "Tipo documental no encontrado.");
    if (previo.estado === estado) return previo;
    const actualizado = await tipoDocumentalRepository.update(id, {estado});
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "tiposDocumentales", entidadId: id,
      accion: "transicion_estado", actor,
      detalle: {codigo: previo.codigo, estadoAnterior: previo.estado || null,
        estadoNuevo: estado},
    });
    return actualizado;
  }

  /**
   * Edita estadoIA, modeloPreferido, umbralLegibilidad, entidades (a qué
   * entidades aplica) y campos (qué extrae la IA).
   * @param {string} id ID del tipo.
   * @param {Object} payload Campos.
   * @param {Object} actor Usuario autenticado.
   * @return {Promise<Object>} Tipo actualizado.
   */
  async actualizar(id, payload, actor) {
    const previo = await tipoDocumentalRepository.getById(id);
    if (!previo) throw new AppError(404, "Tipo documental no encontrado.");
    const cambios = {};
    if (payload.estadoIA !== undefined) {
      if (!ESTADOS_IA.includes(payload.estadoIA)) {
        throw new AppError(400, `Estado IA no válido. Valores permitidos: ` +
            `${ESTADOS_IA.join(", ")}.`);
      }
      cambios.estadoIA = payload.estadoIA;
    }
    if (payload.modeloPreferido !== undefined) {
      const modelo = payload.modeloPreferido || null;
      if (modelo) {
        const {preciosPorModelo} = await aiConfigService.obtenerParametros();
        if (!preciosPorModelo[modelo]) {
          throw new AppError(400, "El modelo preferido debe estar entre los " +
              "modelos configurados en Conexión IA.");
        }
      }
      cambios.modeloPreferido = modelo;
    }
    if (payload.umbralLegibilidad !== undefined) {
      const umbral = Number(payload.umbralLegibilidad);
      if (!(umbral >= UMBRAL_MINIMO && umbral <= UMBRAL_MAXIMO)) {
        throw new AppError(400, `El umbral de legibilidad debe estar entre ` +
            `${UMBRAL_MINIMO} y ${UMBRAL_MAXIMO}.`);
      }
      cambios.umbralLegibilidad = umbral;
    }
    if (payload.entidades !== undefined) {
      const r = validarEntidades(payload.entidades);
      if (!r.ok) throw new AppError(400, r.error);
      cambios.entidades = r.valor;
    }
    if (payload.campos !== undefined) {
      const r = validarCampos(payload.campos);
      if (!r.ok) throw new AppError(400, r.error);
      cambios.campos = r.valor;
    }
    if (Object.keys(cambios).length === 0) return conDefaults(previo);
    const actualizado = await tipoDocumentalRepository.update(id, cambios);
    const detalle = {};
    Object.keys(cambios).forEach((campo) => {
      detalle[campo] = {anterior: previo[campo] ?? null,
        nuevo: cambios[campo]};
    });
    await bitacoraLogger.registrarEvento({
      mandanteId: null, entidad: "tiposDocumentales", entidadId: id,
      accion: "actualizado", actor,
      detalle: {codigo: previo.codigo, ...detalle},
    });
    return actualizado;
  }

  /**
   * Documentos de las plantillas activas sin tipo documental (y no
   * sensibles): el backlog de normalización, con las apariciones en
   * revisiones.
   * @return {Promise<Object[]>} Documentos.
   */
  async _documentosPlantillaSinTipo() {
    const [plantillas, encontrados] = await Promise.all([
      plantillaEstructuraRepository.list(null, "activa"),
      resultadoCompletitudRepository.listDocumentosEncontrados(
          LIMITE_POR_NORMALIZAR),
    ]);
    const apariciones = new Map();
    encontrados.forEach((r) => (r.documentosEncontrados || []).forEach((d) => {
      const k = `${r.mandanteId}|${r.seccionClave}|${d.clave}`;
      apariciones.set(k, (apariciones.get(k) || 0) + 1);
    }));
    const nombres = await this._nombresMandante(
        plantillas.map((p) => p.mandanteId));
    return plantillas.flatMap((p) => (p.secciones || []).flatMap((s) =>
      [...(s.archivosSeccion || []), ...(s.documentos || [])]
          .filter((d) => !d.tipoDocumentalCodigo && !d.datosSensibles)
          .map((d) => ({
            mandanteId: p.mandanteId,
            mandanteNombre: nombres.get(p.mandanteId) || p.mandanteId,
            plantillaNombre: p.nombre,
            seccionClave: s.clave, seccionNombre: s.nombre,
            documentoClave: d.clave, documentoNombre: d.nombre,
            apariciones: apariciones.get(
                `${p.mandanteId}|${s.clave}|${d.clave}`) || 0,
          })))).sort((a, b) => b.apariciones - a.apariciones);
  }

  /**
   * Tipos por normalizar: procesamientos OTRO agrupados por descripción
   * normalizada (con Mandantes y último visto) y los documentos de las
   * plantillas sin tipo documental.
   * @return {Promise<{grupos: Object[], documentosPlantilla: Object[],
   *     truncado: boolean}>} Agregación.
   */
  async porNormalizar() {
    const [items, documentosPlantilla] = await Promise.all([
      procesamientoIARepository.listOtros(LIMITE_POR_NORMALIZAR),
      this._documentosPlantillaSinTipo(),
    ]);
    const grupos = agruparPorNormalizar(items.map((i) => ({
      ...i, fecha: i.createdAt?.toDate ? i.createdAt.toDate() : null,
    })));
    const nombres = await this._nombresMandante(
        grupos.flatMap((g) => g.mandanteIds));
    return {
      grupos: grupos.map((g) => ({
        descripcion: g.descripcion,
        apariciones: g.apariciones,
        mandantes: g.mandanteIds.map((id) => nombres.get(id) || id),
        ultimoVisto: g.ultimoVisto ? g.ultimoVisto.toISOString() : null,
      })),
      documentosPlantilla,
      truncado: items.length >= LIMITE_POR_NORMALIZAR,
    };
  }
}

module.exports = new TipoDocumentalService();
