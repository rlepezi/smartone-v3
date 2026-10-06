const express = require("express");
const router = express.Router();
const sesionController = require("../controllers/sesionController");
const {authMiddleware} = require("../middlewares/authMiddleware");

// Cualquier usuario autenticado puede iniciar/latir/cerrar SU PROPIA
// sesión — no hay restricción de rol acá (todos los roles inician
// sesión al hacer login). La pertenencia (solo el dueño puede latir/
// cerrar) se valida en el Service, no en la ruta.
router.use(authMiddleware);

router.post("/iniciar", sesionController.iniciar);
router.post("/:id/latido", sesionController.latido);
router.post("/:id/cerrar", sesionController.cerrar);

module.exports = router;
