const perfilRequerimientoService =
    require("../services/perfilRequerimientoService");

/**
 * Controlador HTTP para el recurso Perfil-Requerimiento.
 */
class PerfilRequerimientoController {
  /**
   * Lista vínculos, opcionalmente filtrados.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async list(req, res, next) {
    try {
      const {mandanteId, perfilParticipacionId, estado} = req.query;
      const vinculos = await perfilRequerimientoService.listarVinculos(
          {mandanteId, perfilParticipacionId, estado}, req.user,
      );
      res.status(200).json({data: vinculos});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Devuelve el catálogo de Requerimientos activos anotado según su
   * vínculo con un Perfil de Participación específico.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async matriz(req, res, next) {
    try {
      const {perfilParticipacionId} = req.params;
      const matriz = await perfilRequerimientoService.obtenerMatriz(
          perfilParticipacionId, req.user,
      );
      res.status(200).json({data: matriz});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Fija en un solo paso el estado deseado de varios pares Perfil de
   * Participación + Requerimiento (a qué Perfiles de Recurso aplican, o
   * desvinculados).
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async sincronizar(req, res, next) {
    try {
      const resumen = await perfilRequerimientoService.sincronizarVinculos(
          req.body?.cambios, req.user,
      );
      res.status(200).json({
        message: "Vínculos actualizados exitosamente.",
        data: resumen,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reordena en batch un conjunto de vínculos de un mismo tipo.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async reordenar(req, res, next) {
    try {
      const {items} = req.body;
      await perfilRequerimientoService.reordenarVinculos(items, req.user);
      res.status(200).json({message: "Orden actualizado exitosamente."});
    } catch (error) {
      next(error);
    }
  }

  /**
   * Actualiza el estado de un vínculo existente.
   * @param {Object} req Petición Express.
   * @param {Object} res Respuesta Express.
   * @param {Function} next Siguiente middleware.
   * @return {Promise<void>}
   */
  async update(req, res, next) {
    try {
      const {id} = req.params;
      const vinculoActualizado = await perfilRequerimientoService
          .actualizarVinculo(id, req.body, req.user);
      res.status(200).json({
        message: "Vínculo actualizado exitosamente.",
        data: vinculoActualizado,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PerfilRequerimientoController();
