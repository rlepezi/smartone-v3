const express = require("express");
const router = express.Router();
const participacionController =
    require("../controllers/participacionController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y mandante_admin. No hay DELETE: la única
// transición terminal (finalizar) se hace vía PUT.
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), participacionController.list);
router.get(
    "/:id/eventos-recientes",
    requireRole(ROLES_LECTURA),
    participacionController.eventosRecientes,
);
router.get(
    "/:id", requireRole(ROLES_LECTURA), participacionController.getById,
);
router.post(
    "/", requireRole(ROLES_ESCRITURA), participacionController.create,
);
router.put(
    "/:id", requireRole(ROLES_ESCRITURA), participacionController.update,
);

module.exports = router;
