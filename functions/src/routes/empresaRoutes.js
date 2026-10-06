const express = require("express");
const router = express.Router();
const empresaController = require("../controllers/empresaController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: catálogo global, visible para todos los roles del sistema.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y CUALQUIER mandante_admin (no hay "dueño").
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), empresaController.list);
router.get("/:id", requireRole(ROLES_LECTURA), empresaController.getById);
router.get(
    "/:id/resumen", requireRole(ROLES_LECTURA), empresaController.resumen,
);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    empresaController.eventosRecientes,
);
router.post("/", requireRole(ROLES_ESCRITURA), empresaController.create);
router.put("/:id", requireRole(ROLES_ESCRITURA), empresaController.update);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    empresaController.deactivate,
);

module.exports = router;
