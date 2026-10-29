const express = require("express");
const router = express.Router();
const controller = require("../controllers/fuenteDocumentalController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Fuentes documentales (una sola activa por Mandante):
//  - SharePoint: superadmin (cualquier Mandante) y mandante_admin (solo el
//    suyo; lo valida el service).
//  - Carpeta local: solo superadmin.
//  - Fuente activa (para vincular Carpetas de empresa y leer la carpeta del
//    expediente): también evaluador y mandante_lector (acotado en el
//    service).
const ADMINISTRAN = requireRole(["superadmin", "mandante_admin"]);

router.use(authMiddleware);

router.get("/activa", requireRole(["superadmin", "evaluador",
  "mandante_admin", "mandante_lector"]), controller.activa);
router.put("/local/:mandanteId", requireRole(["superadmin"]),
    controller.guardarLocal);
router.get("/", ADMINISTRAN, controller.listar);
router.post("/", ADMINISTRAN, controller.crear);
router.get("/:id", ADMINISTRAN, controller.obtener);
router.put("/:id", ADMINISTRAN, controller.actualizar);
router.post("/:id/desactivar", ADMINISTRAN, controller.desactivar);
router.post("/:id/reactivar", ADMINISTRAN, controller.reactivar);

module.exports = router;
