const revisionIAService = require("../services/revisionIAService");
const aiConfigService = require("../services/aiConfigService");
const consumoIAService = require("../services/consumoIAService");
const fuenteDocumentalService =
    require("../services/fuenteDocumentalService");
const estructuraRevisionService =
    require("../services/estructuraRevisionService");
const plantillaEstructuraRepository =
    require("../repositories/plantillaEstructuraRepository");

const ROLES_ALCANCE_FORZADO = ["mandante_admin", "mandante_lector"];

/**
 * Controlador HTTP de Revisiones IA (bloque 1: estimación, sesiones y
 * archivos).
 */
class RevisionIAController {
  /**
   * Estima el costo de un conjunto de archivos.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async estimar(req, res, next) {
    try {
      const data = await revisionIAService.estimar(req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Crea una sesión de revisión.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async crearSesion(req, res, next) {
    try {
      const data = await revisionIAService.crearSesion(req.body || {},
          req.user);
      res.status(201).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Analiza un árbol de carpetas contra la plantilla activa (no persiste).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async analizarEstructura(req, res, next) {
    try {
      const {mandanteId, arbol, calcesManuales, enlaces, modoEstructura,
        expedienteId, requerimientoIds, omitirValidados} = req.body || {};
      const data = await estructuraRevisionService.analizar({mandanteId, arbol,
        calcesManuales, enlaces, modoEstructura, expedienteId,
        requerimientoIds, omitirValidados}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Consolida una carpeta de la sesión.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async consolidar(req, res, next) {
    try {
      const data = await revisionIAService.consolidar(req.params.id,
          req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Finaliza la sesión (completada).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async finalizar(req, res, next) {
    try {
      const data = await revisionIAService.cerrar(req.params.id, "completada",
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancela la sesión.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cancelar(req, res, next) {
    try {
      const data = await revisionIAService.cerrar(req.params.id, "cancelada",
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista sesiones.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listar(req, res, next) {
    try {
      const {mandanteId, fuente, estado, desde, hasta, cursor, limite,
        origen} =
          req.query;
      const data = await revisionIAService.listar(
          {mandanteId, fuente, estado, desde, hasta, cursor, limite, origen},
          req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Detalle de una sesión con sus resultados.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async detalle(req, res, next) {
    try {
      const data = await revisionIAService.detalle(req.params.id, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resuelve un resultado (aceptar, corregir o descartar).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async resolver(req, res, next) {
    try {
      const data = await revisionIAService.resolver(req.params.id,
          req.body || {}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Si la IA está configurada (para habilitar "Iniciar revisión").
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async estadoIA(req, res, next) {
    try {
      const mandanteId = ROLES_ALCANCE_FORZADO.includes(req.user.rol) ?
          req.user.mandanteId : req.query.mandanteId;
      const [estado, sharepoint, plantilla] = await Promise.all([
        aiConfigService.estado(),
        mandanteId ? fuenteDocumentalService.sharePointActiva(mandanteId) :
          null,
        mandanteId ? plantillaEstructuraRepository.getActiva(mandanteId) :
          null,
      ]);
      res.status(200).json({data: {...estado, sharepoint,
        plantilla: plantilla ? {plantillaId: plantilla.id,
          nombre: plantilla.nombre, version: plantilla.version} : null}});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Tipos documentales activos.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarTipos(req, res, next) {
    try {
      const data = await revisionIAService.listarTiposDocumentales(
          req.query.entidad || null);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Consumo de IA (pestaña Consumo de Configuración IA).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async consumo(req, res, next) {
    try {
      const data = await consumoIAService.obtener(
          {mandanteId: req.query.mandanteId}, req.user);
      res.status(200).json({data});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Procesa un archivo de la sesión.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async procesarArchivo(req, res, next) {
    try {
      const data = await revisionIAService.procesarArchivo(req.params.id,
          req.body || {}, req.user);
      res.status(201).json({data});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RevisionIAController();
