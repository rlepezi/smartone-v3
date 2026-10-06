import { personasApi } from "../api/personas";
import { asignacionesApi } from "../api/asignaciones";
import { expedienteService } from "./expedienteService";
import { evaluacionService } from "./evaluacionService";

export const personaService = {
  listar: (params) => personasApi.listar(params),

  async obtenerDetalle(id) {
    const [persona, resumen] = await Promise.all([
      personasApi.obtener(id),
      personasApi.resumen(id),
    ]);
    return { persona, resumen };
  },

  // Requerimientos con vigencia de UNA Asignación elegida en el selector
  // (proyectoId + empresaId de esa asignación activa).
  async obtenerDetalleAsignacion(
      mandanteId, personaId, empresaId, proyectoId, perfilRecursoId,
  ) {
    const expediente = await expedienteService.obtenerPorEmpresaYProyecto(
        mandanteId, empresaId, proyectoId,
    );
    const evaluaciones = await evaluacionService.obtenerVigentesPorExpediente(
        expediente?.id,
    );
    const propias = evaluacionService.filtrarPorPersona(evaluaciones, personaId);
    return {
      expediente,
      filas: evaluacionService.combinarConRequerimientos(
          expediente, propias,
          { tipoEntidad: "persona", perfilRecursoId: perfilRecursoId || null },
      ),
    };
  },

  async obtenerAsignacionesActivas(personaId) {
    return asignacionesApi.listar({ personaId, estado: "activa" });
  },
};
