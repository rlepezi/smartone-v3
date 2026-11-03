import { proyectosApi } from "../api/proyectos";
import { reportesApi } from "../api/reportes";
import { cumplimientoService } from "./cumplimientoService";

export const proyectoService = {
  async listar({ mandanteId, umbralesDe, forzar = false } = {}) {
    const [proyectos, indice] = await Promise.all([
      proyectosApi.listar({ mandanteId }),
      cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }),
    ]);
    return { proyectos, indice };
  },

  // Proyecto, sus empresas participantes (nombre, RUT y perfil de participación desde
  // /reportes/proyectos/:id/participantes) y el índice para su cumplimiento.
  async obtenerDetalle(id, { mandanteId, umbralesDe, forzar = false } = {}) {
    const [proyecto, participantes, indice] = await Promise.all([
      proyectosApi.obtener(id),
      reportesApi.participantesPorProyecto(id).catch(() => []),
      cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }),
    ]);
    return { proyecto, participantes: participantes || [], indice };
  },
};
