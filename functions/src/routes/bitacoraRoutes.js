const express = require("express");
const router = express.Router();
const bitacoraController = require("../controllers/bitacoraController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen acceso de lectura. No hay
// POST/PUT/DELETE — la escritura es exclusivamente interna vía
// bitacoraLogger.js, nunca desde la API pública.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];

router.get("/", requireRole(ROLES_LECTURA), bitacoraController.list);

module.exports = router;
