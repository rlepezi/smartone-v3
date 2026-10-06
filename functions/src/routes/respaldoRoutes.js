const express = require("express");
const router = express.Router();
const respaldoController = require("../controllers/respaldoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Módulo exclusivo de superadmin: cualquier otro rol recibe 403.
router.use(authMiddleware);
router.use(requireRole(["superadmin"]));

router.get("/configuracion", respaldoController.obtenerConfiguracion);
router.put("/configuracion", respaldoController.actualizarConfiguracion);
router.post("/probar-acceso", respaldoController.probarAcceso);
router.get("/", respaldoController.listar);
router.post("/ejecutar", respaldoController.ejecutar);
router.post("/:id/restaurar", respaldoController.restaurar);

module.exports = router;
