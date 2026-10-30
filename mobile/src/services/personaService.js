import { personasApi } from "../api/personas";
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

  // Requerimientos con vigencia de UNA participación elegida en el selector
  // (proyectoId + empresaId de esa participación activa, con sus perfiles).
  async obtenerDetalleParticipacion(
      mandanteId, personaId, empresaId, proyectoId, perfilRecursoIds,
  ) {
    const expediente = await expedienteService.obtenerPorEmpresaYProyecto(
        mandanteId, empresaId, proyectoId,
    );
    return {
      expediente,
      filas: await evaluacionService.filasDeSujeto(expediente?.id, { personaId }),
    };
  },

};
