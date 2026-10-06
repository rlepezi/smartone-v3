import { proyectosApi } from "../api/proyectos";
import { reportesApi } from "../api/reportes";

export const proyectoService = {
  listar: (params) => proyectosApi.listar(params),

  async obtenerDetalle(id) {
    const [proyecto, resumen, participantes] = await Promise.all([
      proyectosApi.obtener(id),
      proyectosApi.resumen(id),
      // Cumplimiento agregado desde los Expedientes de sus empresas
      // participantes — nunca 0/0 cuando hay datos (ver theme/status.js /
      // reporteService.obtenerParticipantesPorProyecto).
      reportesApi.participantesPorProyecto(id),
    ]);
    return { proyecto, resumen, participantes };
  },
};
