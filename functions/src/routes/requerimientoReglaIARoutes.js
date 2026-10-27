const express = require("express");
const controller = require("../controllers/requerimientoReglaIAController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

const router = express.Router();

// Reglas IA de un requerimiento: solo superadmin (el servicio también lo
// verifica). Montado en /reglas-ia/requerimientos.
router.use(authMiddleware, requireRole(["superadmin"]));

router.get("/cobertura", controller.cobertura);
router.get("/:id", controller.obtener);
router.put("/:id/tipo", controller.asignarTipo);
router.patch("/:id/estado", controller.cambiarEstadoIA);
router.post("/:id/reglas", controller.agregarRegla);
router.patch("/:id/reglas/:vinculoId", controller.actualizarVinculo);
router.post("/:id/reglas/:vinculoId/quitar", controller.quitarVinculo);
router.put("/:id/orden", controller.ordenar);
router.post("/:id/copiar", controller.copiarDe);
router.post("/:id/probar", controller.probar);
router.get("/:id/pruebas", controller.listarPruebas);

module.exports = router;
