const express = require("express");
const router = express.Router();
const perfilRecursoController =
    require("../controllers/perfilRecursoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y mandante_admin.
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), perfilRecursoController.list);
router.get(
    "/:id", requireRole(ROLES_LECTURA), perfilRecursoController.getById,
);
router.post(
    "/", requireRole(ROLES_ESCRITURA), perfilRecursoController.create,
);
router.put(
    "/:id", requireRole(ROLES_ESCRITURA), perfilRecursoController.update,
);
router.delete(
    "/:id",
    requireRole(ROLES_ESCRITURA),
    perfilRecursoController.deactivate,
);

module.exports = router;
