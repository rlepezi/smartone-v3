const express = require("express");
const controller = require("../controllers/reglaIAController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

const router = express.Router();

// Biblioteca de reglas de revisión IA: solo superadmin (el servicio también
// lo verifica).
router.use(authMiddleware, requireRole(["superadmin"]));

router.get("/", controller.listar);
router.get("/verificaciones", controller.verificaciones);
router.get("/:id", controller.obtener);
router.post("/", controller.crear);
router.put("/:id", controller.actualizar);
router.post("/:id/duplicar", controller.duplicar);
router.patch("/:id/estado", controller.cambiarEstado);

module.exports = router;
