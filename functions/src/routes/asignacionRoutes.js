const express = require("express");
const router = express.Router();
const asignacionController = require("../controllers/asignacionController");
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

router.get("/", requireRole(ROLES_LECTURA), asignacionController.list);
router.get(
    "/:id", requireRole(ROLES_LECTURA), asignacionController.getById,
);
router.post(
    "/", requireRole(ROLES_ESCRITURA), asignacionController.create,
);
router.put(
    "/:id", requireRole(ROLES_ESCRITURA), asignacionController.update,
);

module.exports = router;
