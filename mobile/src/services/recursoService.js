import { recursosApi } from "../api/recursos";
import { participacionRecursosApi } from "../api/participacionSujetos";
import { agruparSujetos } from "../utils/sujetosParticipacion";
import { expedienteService } from "./expedienteService";
import { evaluacionService } from "./evaluacionService";

export const recursoService = {
  listar: (params) => recursosApi.listar(params),
  obtener: (id) => recursosApi.obtener(id),
  tipos: () => recursosApi.tipos(),

  async obtenerDetalleParticipacion(
      mandanteId, recursoId, empresaId, proyectoId, perfilRecursoIds,
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
          { tipoEntidad: "recurso", perfilRecursoIds: perfilRecursoIds || [] },
      ),
    };
  },

  // Participaciones activas de la Maquinaria (agrupadas, con su perfil).
  async obtenerParticipacionesActivas(recursoId) {
    const docs = await participacionRecursosApi.listar({ recursoId, estado: "activa" });
    return agruparSujetos([], docs || []);
  },
};
