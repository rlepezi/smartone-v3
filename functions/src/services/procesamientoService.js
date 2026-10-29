const procesamientoIARepository =
    require("../repositories/procesamientoIARepository");
const sesionRevisionRepository =
    require("../repositories/sesionRevisionRepository");
const tipoDocumentalRepository =
    require("../repositories/tipoDocumentalRepository");
const extraccionIAService = require("./extraccionIAService");
const aiConfigService = require("./aiConfigService");
const costoService = require("./costoService");
const registroConsumoIAService = require("./registroConsumoIAService");

const {ORIGENES} = registroConsumoIAService;

const {ErrorExtraccion} = extraccionIAService;
const TIPOS_NORMALIZADOS = ["CEDULA_CL", "LICENCIA_CL"];

/**
 * Procesamiento de un documento con IA, agnóstico de la fuente (carpeta
 * local hoy, SharePoint después): recibe el contenido y sus metadatos,
 * reutiliza una extracción previa del mismo archivo (hash) en el Mandante o
 * llama a la IA, y deja un procesamientoIA con el costo. Nunca guarda el
 * archivo.
 */
class ProcesamientoService {
  /**
   * Suma métricas al tipo documental detectado (si está normalizado y
   * sembrado).
   * @param {string} codigo Código del tipo detectado.
   * @param {number} costoUsd Costo del procesamiento.
   * @return {Promise<void>}
   */
  async _sumarMetricasTipo(codigo, costoUsd) {
    if (!TIPOS_NORMALIZADOS.includes(codigo)) return;
    const tipo = await tipoDocumentalRepository.getByCodigo(codigo);
    if (!tipo) return;
    await tipoDocumentalRepository.incrementarMetricas(tipo.id, {
      procesados: 1, costoTotalUsd: costoUsd,
    });
  }

  /**
   * Registra en consumosIA la llamada a la IA de un procesamiento (no los
   * reutilizados: esos no llaman a la IA).
   * @param {Object} sesion Sesión.
   * @param {Object} procesamiento Procesamiento creado.
   * @param {Object} preciosPorModelo Precios vigentes.
   * @return {Promise<void>}
   */
  async _registrarConsumo(sesion, procesamiento, preciosPorModelo) {
    const codigo = procesamiento.tipoDetectado;
    const tipo = codigo ?
      await tipoDocumentalRepository.getByCodigo(codigo).catch(() => null) :
      null;
    await registroConsumoIAService.registrar({
      mandanteId: sesion.mandanteId, origen: ORIGENES.REVISION_CARPETA,
      expedienteId: sesion.expedienteId || null,
      tipoDocumentalId: tipo?.id || null,
      tipoDocumentalNombre: tipo?.nombre || codigo || null,
      modelo: procesamiento.modelo,
      tokensEntrada: procesamiento.tokensEntrada,
      tokensSalida: procesamiento.tokensSalida,
      precio: costoService.precioDe(preciosPorModelo, procesamiento.modelo),
      createdBy: sesion.createdBy || null,
      fuente: {coleccion: procesamientoIARepository.COLLECTION,
        id: procesamiento.id},
    });
  }

  /**
   * Procesa un documento.
   * @param {Object} entrada Datos.
   * @param {Object} entrada.sesion Sesión (en_proceso) a la que pertenece.
   * @param {string} entrada.carpetaRelativa Carpeta de la persona.
   * @param {Object} entrada.archivoMeta {rutaRelativa, nombre, mime,
   *     tamanoBytes, hashSha256, ultimaModificacion}.
   * @param {Buffer} entrada.buffer Contenido (imagen ya redimensionada o
   *     PDF).
   * @param {Object} [entrada.contexto] Ubicación del archivo en la plantilla
   *     (empresaCarpeta, seccionClave, entidadCarpeta, documentoClave,
   *     fechaEnNombreArchivo).
   * @return {Promise<Object>} Procesamiento creado (procesado o error).
   */
  async procesarDocumento({sesion, carpetaRelativa, archivoMeta, buffer,
    contexto = {}}) {
    const base = {
      mandanteId: sesion.mandanteId,
      sesionId: sesion.id,
      // Clave de la entidad (persona) a la que pertenece el archivo: agrupa
      // la consolidación.
      carpetaRelativa,
      empresaCarpeta: contexto.empresaCarpeta || null,
      seccionClave: contexto.seccionClave || null,
      entidadCarpeta: contexto.entidadCarpeta || null,
      documentoClave: contexto.documentoClave || null,
      fechaEnNombreArchivo: contexto.fechaEnNombreArchivo || null,
      archivoRef: {
        rutaRelativa: archivoMeta.rutaRelativa,
        nombre: archivoMeta.nombre,
        mime: archivoMeta.mime,
        tamanoBytes: archivoMeta.tamanoBytes,
        hashSha256: archivoMeta.hashSha256,
        ultimaModificacion: archivoMeta.ultimaModificacion || null,
      },
    };

    const previo = await procesamientoIARepository.getProcesadoPorHash(
        sesion.mandanteId, archivoMeta.hashSha256,
    );
    if (previo) {
      const procesamiento = await procesamientoIARepository.create({
        ...base,
        tipoDetectado: previo.tipoDetectado,
        tipoDetectadoDescripcion: previo.tipoDetectadoDescripcion ?? null,
        lado: previo.lado ?? null,
        datosExtraidos: previo.datosExtraidos,
        modelo: previo.modelo,
        tokensEntrada: 0,
        tokensSalida: 0,
        costoUsd: 0,
        latenciaMs: 0,
        reutilizadoDe: previo.reutilizadoDe || previo.id,
        estado: "procesado",
        error: null,
      });
      await sesionRevisionRepository.incrementar(sesion.id, {procesados: 1});
      return procesamiento;
    }

    const modelo = sesion.modelo;
    try {
      const {datos, tokensEntrada, tokensSalida, latenciaMs} =
          await extraccionIAService.extraer({
            buffer, mime: archivoMeta.mime, modelo,
          });
      const {preciosPorModelo} = await aiConfigService.obtenerParametros();
      const costoUsd = costoService.calcular(preciosPorModelo, modelo,
          tokensEntrada, tokensSalida);
      const procesamiento = await procesamientoIARepository.create({
        ...base,
        tipoDetectado: datos.tipoDetectado,
        tipoDetectadoDescripcion: datos.tipoDetectado === "OTRO" ?
            datos.tipoDetectadoDescripcion || null : null,
        lado: datos.lado ?? null,
        datosExtraidos: datos,
        modelo,
        tokensEntrada,
        tokensSalida,
        costoUsd,
        latenciaMs,
        reutilizadoDe: null,
        estado: "procesado",
        error: null,
      });
      await Promise.all([
        sesionRevisionRepository.incrementar(sesion.id, {procesados: 1},
            costoUsd),
        this._sumarMetricasTipo(datos.tipoDetectado, costoUsd),
        this._registrarConsumo(sesion, procesamiento, preciosPorModelo),
      ]);
      return procesamiento;
    } catch (error) {
      // Un error de la IA deja el archivo en "error" sin detener la sesión;
      // cualquier otro (configuración, Firestore) se propaga.
      if (!(error instanceof ErrorExtraccion)) throw error;
      const procesamiento = await procesamientoIARepository.create({
        ...base,
        tipoDetectado: null,
        tipoDetectadoDescripcion: null,
        lado: null,
        datosExtraidos: null,
        modelo,
        tokensEntrada: 0,
        tokensSalida: 0,
        costoUsd: 0,
        latenciaMs: 0,
        reutilizadoDe: null,
        estado: "error",
        error: error.message,
      });
      const {preciosPorModelo} = await aiConfigService.obtenerParametros();
      await Promise.all([
        sesionRevisionRepository.incrementar(sesion.id, {errores: 1}),
        this._registrarConsumo(sesion, procesamiento, preciosPorModelo),
      ]);
      return procesamiento;
    }
  }
}

module.exports = new ProcesamientoService();
