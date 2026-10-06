const express = require("express");
const router = express.Router();
const reporteController = require("../controllers/reporteController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// 100% de lectura, mismo esquema que Proyecto/Expediente: los 4 roles
// tienen acceso.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];

router.get("/resumen", requireRole(ROLES_LECTURA), reporteController.resumen);
router.get("/detalle", requireRole(ROLES_LECTURA), reporteController.detalle);
router.get(
    "/proyectos/:proyectoId/participantes",
    requireRole(ROLES_LECTURA),
    reporteController.participantesPorProyecto,
);

module.exports = router;
