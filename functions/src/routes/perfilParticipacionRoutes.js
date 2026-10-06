const express = require("express");
const router = express.Router();
const perfilParticipacionController =
    require("../controllers/perfilParticipacionController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y mandante_admin.
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get(
    "/", requireRole(ROLES_LECTURA), perfilParticipacionController.list,
);
router.get(
    "/:id",
    requireRole(ROLES_LECTURA),
    perfilParticipacionController.getById,
);
router.get(
    "/:id/resumen",
    requireRole(ROLES_LECTURA),
    perfilParticipacionController.resumen,
);
router.get(
    "/:id/requerimientos",
    requireRole(ROLES_LECTURA),
    perfilParticipacionController.requerimientos,
);
router.get(
    "/:id/otros-del-mandante",
    requireRole(ROLES_LECTURA),
    perfilParticipacionController.otrosDelMandante,
);
router.post(
    "/", requireRole(ROLES_ESCRITURA), perfilParticipacionController.create,
);
router.put(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    perfilParticipacionController.update,
);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    perfilParticipacionController.deactivate,
);

module.exports = router;
