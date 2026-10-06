const express = require("express");
const router = express.Router();
const mandanteController = require("../controllers/mandanteController");
const {authMiddleware, requireRole} = require("../middlewares/authMiddleware");

// Middleware de autenticación para todas las operaciones
router.use(authMiddleware);

// Listado — SmartApplication (superadmin y admin_comercial, este último
// para su gestión comercial de clientes): un mandante_admin no tiene
// acceso a la lista completa de Mandantes (fuga cross-tenant).
router.get(
    "/",
    requireRole(["superadmin", "admin_comercial"]),
    mandanteController.list,
);

// GET por ID — excepción acotada: los 5 roles pueden pedir este endpoint,
// pero el Service (getMandanteById) decide qué ven: superadmin/evaluador/
// admin_comercial sin restricción; mandante_admin/mandante_lector solo su
// PROPIO mandanteId (403 si piden uno ajeno). Habilita resolver el nombre
// del Mandante en pantallas como ProyectosListPage sin exponer el listado
// completo.
router.get(
    "/:id",
    requireRole(
        [
          "superadmin", "mandante_admin", "mandante_lector", "evaluador",
          "admin_comercial",
        ],
    ),
    mandanteController.getById,
);

// Rutas administrativas (creación / edición / borrado lógico) — CRUD
// completo también para admin_comercial (mismo nivel que superadmin en
// este módulo puntual: da de alta clientes nuevos).
const PUEDE_ADMINISTRAR_MANDANTES = ["superadmin", "admin_comercial"];

router.post(
    "/",
    requireRole(PUEDE_ADMINISTRAR_MANDANTES),
    mandanteController.create,
);
// PUT — también habilitado para mandante_admin (autogestión acotada de su
// propio Mandante: "Mi Mandante"). El Service filtra qué campos aplica
// según el rol; el alcance a su propio mandanteId lo fuerza getMandanteById.
router.put(
    "/:id",
    requireRole([...PUEDE_ADMINISTRAR_MANDANTES, "mandante_admin"]),
    mandanteController.update,
);
router.delete(
    "/:id",
    requireRole(PUEDE_ADMINISTRAR_MANDANTES),
    mandanteController.deactivate,
);

module.exports = router;
