const express = require("express");
const router = express.Router();
const expedienteController = require("../controllers/expedienteController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Crear: solo superadmin y mandante_admin — evaluador NO puede crear
// expedientes, solo evaluarlos.
const ROLES_CREAR = ["superadmin", "mandante_admin"];
// Transicionar: superadmin, mandante_admin y evaluador — mandante_lector
// queda excluido (es de solo lectura).
const ROLES_TRANSICIONAR = ["superadmin", "mandante_admin", "evaluador"];

router.get("/", requireRole(ROLES_LECTURA), expedienteController.list);
router.get("/:id", requireRole(ROLES_LECTURA), expedienteController.getById);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    expedienteController.eventosRecientes,
);
router.post("/", requireRole(ROLES_CREAR), expedienteController.create);
router.put(
    "/:id/transicionar",
    requireRole(ROLES_TRANSICIONAR),
    expedienteController.transicionar,
);
router.post(
    "/:id/requerimientos",
    requireRole(ROLES_TRANSICIONAR),
    expedienteController.agregarRequerimiento,
);
router.delete(
    "/:id/requerimientos/:requerimientoId",
    requireRole(ROLES_TRANSICIONAR),
    expedienteController.quitarRequerimiento,
);

module.exports = router;
