const express = require("express");
const router = express.Router();
const controller = require("../controllers/configuracionIAController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Configuración → Inteligencia Artificial: solo superadmin.
router.use(authMiddleware, requireRole(["superadmin"]));

router.get("/", controller.obtener);
router.put("/", controller.actualizar);
router.put("/api-key", controller.guardarApiKey);
router.post("/desactivar", controller.desactivar);
router.post("/probar", controller.probar);
router.get("/gasto-mes", controller.gastoMes);
// Resumen de consumo por Mandante: ?desde=&hasta= (AAAA-MM-DD) y
// ?mandanteId= (un Mandante, o "interno" para los sin Mandante).
router.get("/consumo/resumen", controller.resumenConsumo);

module.exports = router;
