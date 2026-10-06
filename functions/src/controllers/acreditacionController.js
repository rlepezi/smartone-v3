const acreditacionService = require("../services/acreditacionService");

/**
 * Controlador HTTP para el flujo "Reemplazar Acreditación". No expone un
 * CRUD propio — "acreditación" es una etiqueta de UI, no una entidad de
 * Firestore — sino la operación de reemplazo y sus endpoints de soporte
 * para el wizard.
 */
class AcreditacionController {
  /**
   * Ejecuta el reemplazo de acreditación de una Persona, Recurso
   * (maquinaria) o Empresa hacia un nuevo Proyecto.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async reemplazar(req, res, next) {
    try {
      const resultado = await acreditacionService.reemplazar(
          req.body, req.user,
      );
      res.status(201).json({
        message: "Acreditación reemplazada exitosamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista Personas, Recursos (maquinaria) o Empresas con su historial de
   * participaciones/asignaciones, para el Paso 2 del wizard.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarEntidades(req, res, next) {
    try {
      const {tipo, search, page, pageSize} = req.query;
      const resultado = await acreditacionService.listarEntidades({
        tipo,
        search,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });
      res.status(200).json(resultado);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Previsualiza el conteo de Requerimientos aplicables y reutilizables
   * por reemplazo, sin escribir nada — Paso 5 del wizard.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async previewRequerimientos(req, res, next) {
    try {
      const {
        entidadTipo, entidadId, perfilParticipacionId, fechaInicio,
      } = req.query;
      const resultado = await acreditacionService.previewRequerimientos({
        entidadTipo, entidadId, perfilParticipacionId, fechaInicio,
      });
      res.status(200).json({data: resultado});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Previsualiza el conteo agregado de Requerimientos aplicables y
   * reutilizables para el flujo de creación normal ("Nueva Acreditación"),
   * sin escribir nada — paso "Requerimientos" del wizard.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async previewNueva(req, res, next) {
    try {
      const {
        empresaId, perfilParticipacionId, fechaInicio, seleccion,
      } = req.body;
      const resultado = await acreditacionService.previewNueva({
        empresaId, perfilParticipacionId, fechaInicio, seleccion,
      });
      res.status(200).json({data: resultado});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Asigna (o mueve, si ya está activa en otro Proyecto) una Persona o
   * Recurso al Proyecto destino — paso "Personas y Maquinarias" del
   * wizard de Nueva Acreditación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async asignarEntidad(req, res, next) {
    try {
      const resultado = await acreditacionService.asignarEntidadAProyecto(
          req.body, req.user,
      );
      res.status(201).json({
        message: resultado.movida ?
            "Persona/Recurso movido al Proyecto exitosamente." :
            "Asignación creada exitosamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mueve la Participación/Asignación activa de una Persona a otro
   * Proyecto — puerta de entrada corta a "Reemplazar Acreditación" desde
   * la ficha de la Persona, sin pedir de nuevo Empresa/rol si ya puede
   * heredarlos de su Asignación activa actual.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cambiarProyectoPersona(req, res, next) {
    try {
      const resultado = await acreditacionService.cambiarProyectoPersona(
          req.params.personaId, req.body, req.user,
      );
      res.status(201).json({
        message: "Proyecto de la Persona cambiado exitosamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mueve la Participación/Asignación activa de un Recurso (maquinaria) a
   * otro Proyecto — análogo a `cambiarProyectoPersona`.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async cambiarProyectoRecurso(req, res, next) {
    try {
      const resultado = await acreditacionService.cambiarProyectoRecurso(
          req.params.recursoId, req.body, req.user,
      );
      res.status(201).json({
        message: "Proyecto de la Maquinaria cambiado exitosamente.",
        data: resultado,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista las Personas o Recursos (maquinaria) activos de una Empresa,
   * con su Asignación activa actual (en cualquier Proyecto) si tienen
   * una — paso "Personas y Maquinarias" del wizard de Nueva Acreditación.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async listarEntidadesDeEmpresa(req, res, next) {
    try {
      const {empresaId, tipo} = req.query;
      const resultado = await acreditacionService.listarEntidadesDeEmpresa(
          {empresaId, tipo},
      );
      res.status(200).json({data: resultado});
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AcreditacionController();
