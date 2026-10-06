const express = require("express");
const router = express.Router();
const requerimientoController =
    require("../controllers/requerimientoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: catálogo global, visible para todos los roles del sistema.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y cualquier mandante_admin (no hay "dueño").
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), requerimientoController.list);
router.get("/uso", requireRole(ROLES_LECTURA), requerimientoController.uso);
router.get(
    "/:id", requireRole(ROLES_LECTURA), requerimientoController.getById,
);
router.post(
    "/", requireRole(ROLES_ESCRITURA), requerimientoController.create,
);
router.put(
    "/:id", requireRole(ROLES_ESCRITURA), requerimientoController.update,
);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    requerimientoController.deactivate,
);

module.exports = router;
