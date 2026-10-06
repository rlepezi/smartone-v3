import { empresasApi } from "../api/empresas";
import { participacionesApi } from "../api/participaciones";
import { asignacionesApi } from "../api/asignaciones";
import { expedienteService } from "./expedienteService";
import { evaluacionService } from "./evaluacionService";

export const empresaService = {
  listar: (params) => empresasApi.listar(params),

  async obtenerDetalle(id) {
    const [empresa, resumen, participaciones] = await Promise.all([
      empresasApi.obtener(id),
      empresasApi.resumen(id),
      participacionesApi.listar({ empresaId: id }),
    ]);
    return { empresa, resumen, participaciones };
  },

  // Todo lo que depende de UNA Participación elegida en el selector
  // (porcentaje/ratio, requerimientos, recursos asignados por rol).
  async obtenerDetalleParticipacion(mandanteId, empresaId, proyectoId) {
    const expediente = await expedienteService.obtenerPorEmpresaYProyecto(
        mandanteId, empresaId, proyectoId,
    );
    const [evaluaciones, asignaciones] = await Promise.all([
      evaluacionService.obtenerVigentesPorExpediente(expediente?.id),
      asignacionesApi.listar({ proyectoId, empresaId, estado: "activa" }),
    ]);
    const requerimientosEmpresa = evaluacionService.filtrarNivelEmpresa(
        evaluaciones,
    );
    return { expediente, evaluaciones, requerimientosEmpresa, asignaciones };
  },
};
