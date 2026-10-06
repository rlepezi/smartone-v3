const express = require("express");
const router = express.Router();
const relacionLaboralController =
    require("../controllers/relacionLaboralController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

router.use(authMiddleware);

// Lectura: catálogo global, visible para todos los roles del sistema
// (mismo criterio que Persona).
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Escritura: solo superadmin y cualquier mandante_admin (mismo criterio
// que Persona).
const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

router.get("/", requireRole(ROLES_LECTURA), relacionLaboralController.list);
router.post(
    "/personas/:personaId/cambiar-empresa",
    requireRole(ROLES_ESCRITURA),
    relacionLaboralController.cambiarEmpresa,
);

module.exports = router;
