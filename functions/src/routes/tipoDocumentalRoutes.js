const express = require("express");
const router = express.Router();
const controller = require("../controllers/tipoDocumentalController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Administración de tipos documentales: solo superadmin.
router.use(authMiddleware, requireRole(["superadmin"]));

router.get("/", controller.listar);
router.get("/por-normalizar", controller.porNormalizar);
router.post("/", controller.crear);
router.put("/:id", controller.actualizar);
router.patch("/:id/estado", controller.cambiarEstado);

module.exports = router;
