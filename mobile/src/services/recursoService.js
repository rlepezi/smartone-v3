import { recursosApi } from "../api/recursos";
import { asignacionesApi } from "../api/asignaciones";
import { expedienteService } from "./expedienteService";
import { evaluacionService } from "./evaluacionService";

export const recursoService = {
  listar: (params) => recursosApi.listar(params),
  obtener: (id) => recursosApi.obtener(id),
  tipos: () => recursosApi.tipos(),

  async obtenerDetalleAsignacion(
      mandanteId, recursoId, empresaId, proyectoId, perfilRecursoId,
  ) {
    const expediente = await expedienteService.obtenerPorEmpresaYProyecto(
        mandanteId, empresaId, proyectoId,
    );
    const evaluaciones = await evaluacionService.obtenerVigentesPorExpediente(
        expediente?.id,
    );
    const propias = evaluacionService.filtrarPorRecurso(evaluaciones, recursoId);
    return {
      expediente,
      filas: evaluacionService.combinarConRequerimientos(
          expediente, propias,
          { tipoEntidad: "recurso", perfilRecursoId: perfilRecursoId || null },
      ),
    };
  },

  async obtenerAsignacionesActivas(recursoId) {
    return asignacionesApi.listar({ recursoId, estado: "activa" });
  },
};
