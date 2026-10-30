const express = require("express");
const router = express.Router();
const perfilRequerimientoController =
    require("../controllers/perfilRequerimientoController");
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
    "/", requireRole(ROLES_LECTURA), perfilRequerimientoController.list,
);
router.get(
    "/matriz/:perfilParticipacionId",
    requireRole(ROLES_LECTURA),
    perfilRequerimientoController.matriz,
);
// Los vínculos se crean con el guardado atómico de un Requerimiento
// (POST/PUT /requerimientos) o fijando el estado deseado de varios pares.
router.post(
    "/sincronizar",
    requireRole(ROLES_ESCRITURA),
    perfilRequerimientoController.sincronizar,
);
// "/reordenar" va ANTES de "/:id" — si no, Express lo capturaría como un id.
router.put(
    "/reordenar",
    requireRole(ROLES_ESCRITURA),
    perfilRequerimientoController.reordenar,
);
router.put(
    "/:id", requireRole(ROLES_ESCRITURA), perfilRequerimientoController.update,
);

module.exports = router;
