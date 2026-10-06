const express = require("express");
const router = express.Router();
const evidenciaRequerimientoController =
    require("../controllers/evidenciaRequerimientoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Creación: "evaluador" SÍ puede crear vínculos (a diferencia de Evidencia,
// donde no puede subir archivos nuevos).
const ROLES_CREAR = ["superadmin", "mandante_admin", "evaluador"];
// Edición de estado: solo superadmin y mandante_admin.
const ROLES_EDITAR = ["superadmin", "mandante_admin"];

router.get(
    "/", requireRole(ROLES_LECTURA), evidenciaRequerimientoController.list,
);
router.get(
    "/:id",
    requireRole(ROLES_LECTURA),
    evidenciaRequerimientoController.getById,
);
router.post(
    "/", requireRole(ROLES_CREAR), evidenciaRequerimientoController.create,
);
router.put(
    "/:id",
    requireRole(ROLES_EDITAR),
    evidenciaRequerimientoController.update,
);

module.exports = router;
