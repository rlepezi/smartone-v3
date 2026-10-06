const express = require("express");
const router = express.Router();
const proyectoController = require("../controllers/proyectoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura
// (evaluador y mandante_lector incluidos, sin poder escribir).
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y mandante_admin.
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), proyectoController.list);
// "/siguiente-codigo" va ANTES de "/:id" — si no, Express lo capturaría
// como un id.
router.get(
    "/siguiente-codigo",
    requireRole(ROLES_LECTURA),
    proyectoController.siguienteCodigo,
);
router.get("/:id", requireRole(ROLES_LECTURA), proyectoController.getById);
router.get(
    "/:id/resumen", requireRole(ROLES_LECTURA), proyectoController.resumen,
);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    proyectoController.eventosRecientes,
);
router.post("/", requireRole(ROLES_ESCRITURA), proyectoController.create);
router.put("/:id", requireRole(ROLES_ESCRITURA), proyectoController.update);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    proyectoController.archive,
);

module.exports = router;
