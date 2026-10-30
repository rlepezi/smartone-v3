const express = require("express");
const router = express.Router();
const controller = require("../controllers/patronRequerimientoController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Patrones aprendidos del mapeo documental: solo superadmin y evaluador
// (el Mandante lo valida el service).
router.use(authMiddleware, requireRole(["superadmin", "evaluador"]));

router.get("/", controller.listar);
router.post("/confirmar", controller.confirmar);
router.post("/quitar", controller.quitar);
router.patch("/:id/estado", controller.cambiarEstado);

module.exports = router;
