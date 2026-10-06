const express = require("express");
const router = express.Router();
const derechosArcoService = require("../services/derechosArcoService");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Configuración de privacidad (periodo de gracia de la purga): solo superadmin.
router.use(authMiddleware);
router.use(requireRole(["superadmin"]));

router.get("/", async (req, res, next) => {
  try {
    const diasGraciaPurga = await derechosArcoService.obtenerDiasGracia();
    res.status(200).json({data: {diasGraciaPurga}});
  } catch (error) {
    next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const data = await derechosArcoService.actualizarDiasGracia(
        req.body?.diasGraciaPurga, req.user,
    );
    res.status(200).json({data});
  } catch (error) {
    next(error);
  }
});

module.exports = router;
