const express = require("express");
const router = express.Router();
const evaluacionController = require("../controllers/evaluacionController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Lectura: todos los roles del catálogo tienen al menos acceso de lectura.
const ROLES_LECTURA = [
  "superadmin", "mandante_admin", "mandante_lector", "evaluador",
];
// Creación: solo superadmin y evaluador — mandante_admin es SOLO
// lectura de su propio Mandante (no puede evaluarse a sí mismo).
const ROLES_CREAR = ["superadmin", "evaluador"];

router.get("/", requireRole(ROLES_LECTURA), evaluacionController.list);
router.post("/", requireRole(ROLES_CREAR), evaluacionController.create);

module.exports = router;
