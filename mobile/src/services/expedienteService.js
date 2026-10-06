// La API no expone un filtro por empresaId/proyectoId en GET /expedientes
// (el controller solo acepta mandanteId/estado) — mismo gap ya conocido y
// ya resuelto igual en el frontend web (ver
// frontend/src/pages/empresas/EmpresaDetailPage.jsx: "expedienteService.listar
// no filtra por empresaId: se trae lo [todo] y se filtra en memoria").
// Se replica el mismo patrón acá en vez de inventar un endpoint nuevo.
import { expedientesApi } from "../api/expedientes";

export const expedienteService = {
  listarPorMandante: (mandanteId) => expedientesApi.listar({ mandanteId }),

  async obtenerPorEmpresaYProyecto(mandanteId, empresaId, proyectoId) {
    const todos = await expedientesApi.listar({ mandanteId });
    const deLaEmpresa = todos.filter((e) => e.empresaId === empresaId &&
      (!proyectoId || e.proyectoId === proyectoId));
    // Si hay más de uno (histórico), prevalece el que sigue abierto.
    return deLaEmpresa.find((e) => e.estado !== "cerrado") ||
      deLaEmpresa[0] || null;
  },

  obtener: (id) => expedientesApi.obtener(id),
};
