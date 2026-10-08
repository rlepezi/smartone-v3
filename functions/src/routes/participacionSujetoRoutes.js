const express = require("express");
const ParticipacionSujetoController =
    require("../controllers/participacionSujetoController");
const participacionPersonaService =
    require("../services/participacionPersonaService");
const participacionRecursoService =
    require("../services/participacionRecursoService");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Lectura: todos los roles. Escritura: superadmin y mandante_admin. Sin
// DELETE: finalizar se hace vía PUT (sin borrado físico).
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

/**
 * Router de una colección de sujetos de Participación.
 * @param {Object} service Servicio de la colección.
 * @return {express.Router} Router.
 */
function crearRouter(service) {
  const router = express.Router();
  const controller = new ParticipacionSujetoController(service);
  router.use(authMiddleware);
  router.get("/", requireRole(ROLES_LECTURA), controller.list);
  router.get("/:id", requireRole(ROLES_LECTURA), controller.getById);
  router.post("/", requireRole(ROLES_ESCRITURA), controller.create);
  router.put("/:id", requireRole(ROLES_ESCRITURA), controller.update);
  return router;
}

module.exports = {
  participacionPersonaRoutes: crearRouter(participacionPersonaService),
  participacionRecursoRoutes: crearRouter(participacionRecursoService),
};
