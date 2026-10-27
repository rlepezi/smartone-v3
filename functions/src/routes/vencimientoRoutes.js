const express = require("express");
const router = express.Router();
const vencimientoController = require("../controllers/vencimientoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

router.use(authMiddleware);

// Mismos roles que leen Expedientes; mandante_admin y mandante_lector quedan
// acotados a su propio Mandante en el servicio.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];

router.get("/", requireRole(ROLES_LECTURA), vencimientoController.listar);

module.exports = router;
