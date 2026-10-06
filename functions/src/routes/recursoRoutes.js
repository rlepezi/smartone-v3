const express = require("express");
const router = express.Router();
const recursoController = require("../controllers/recursoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: catálogo global, visible para todos los roles del sistema.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y cualquier mandante_admin (no hay "dueño").
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

// "/tipos" va ANTES de "/:id" — si no, Express lo capturaría como un id.
router.get(
    "/tipos", requireRole(ROLES_LECTURA), recursoController.listarTipos,
);
router.get("/", requireRole(ROLES_LECTURA), recursoController.list);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    recursoController.eventosRecientes,
);
router.get("/:id", requireRole(ROLES_LECTURA), recursoController.getById);
router.post("/", requireRole(ROLES_ESCRITURA), recursoController.create);
router.put("/:id", requireRole(ROLES_ESCRITURA), recursoController.update);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    recursoController.deactivate,
);
router.get(
    "/:id/relaciones",
    requireRole(ROLES_LECTURA),
    recursoController.listarRelaciones,
);
router.post(
    "/:id/cambiar-empresa",
    requireRole(ROLES_ESCRITURA),
    recursoController.cambiarEmpresa,
);

module.exports = router;
