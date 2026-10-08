import { empresasApi } from "../api/empresas";
import { participacionesApi } from "../api/participaciones";
import {
  participacionPersonasApi, participacionRecursosApi, perfilesRecursoApi,
} from "../api/participacionSujetos";
import { agruparSujetos } from "../utils/sujetosParticipacion";
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
  // (porcentaje/ratio, requerimientos, recursos asignados por perfil).
  async obtenerDetalleParticipacion(mandanteId, empresaId, proyectoId) {
    const expediente = await expedienteService.obtenerPorEmpresaYProyecto(
        mandanteId, empresaId, proyectoId,
    );
    // Personas y Maquinarias de la Participación del Expediente, agrupadas
    // por sujeto con sus Perfiles de Recurso (y el catálogo para nombrarlos).
    const filtro = { participacionId: expediente?.participacionId, estado: "activa" };
    const [evaluaciones, personas, recursos, perfiles] = await Promise.all([
      evaluacionService.obtenerVigentesPorExpediente(expediente?.id),
      expediente ? participacionPersonasApi.listar(filtro) : [],
      expediente ? participacionRecursosApi.listar(filtro) : [],
      perfilesRecursoApi.listar({ mandanteId }).catch(() => []),
    ]);
    const sujetos = agruparSujetos(personas || [], recursos || []);
    const perfilesPorId = Object.fromEntries((perfiles || []).map((p) => [p.id, p]));
    const requerimientosEmpresa = evaluacionService.filtrarNivelEmpresa(
        evaluaciones,
    );
    return { expediente, evaluaciones, requerimientosEmpresa, sujetos, perfilesPorId };
  },
};
