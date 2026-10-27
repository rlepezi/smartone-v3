const express = require("express");
const router = express.Router();
const controller = require("../controllers/fuenteDocumentalController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Fuentes documentales: superadmin (cualquier Mandante) y mandante_admin
// (solo el suyo; lo valida el service).
router.use(authMiddleware, requireRole(["superadmin", "mandante_admin"]));

router.get("/", controller.listar);
router.post("/", controller.crear);
router.get("/:id", controller.obtener);
router.put("/:id", controller.actualizar);
router.post("/:id/desactivar", controller.desactivar);
router.post("/:id/reactivar", controller.reactivar);

module.exports = router;
