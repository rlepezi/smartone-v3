import { recursosApi } from "../api/recursos";
import { proyectosApi } from "../api/proyectos";
import { participacionRecursosApi, perfilesRecursoApi } from "../api/participacionSujetos";
import { agruparSujetos } from "../utils/sujetosParticipacion";
import { evaluacionService } from "./evaluacionService";
import { cumplimientoService } from "./cumplimientoService";

export const recursoService = {
  async listar({ mandanteId, umbralesDe, forzar = false } = {}) {
    const [recursos, indice] = await Promise.all([
      recursosApi.listar({ estado: "activo" }),
      cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }),
    ]);
    return { recursos, indice };
  },

  // Equipo (con su empresa actual, de empresaRecursos), sus participaciones activas (de
  // participacionRecursos, con nombre y código del proyecto y sus perfiles) y el índice.
  async obtenerDetalle(id, { mandanteId, umbralesDe, forzar = false } = {}) {
    const [recurso, docs, perfiles, indice] = await Promise.all([
      recursosApi.obtener(id),
      participacionRecursosApi.listar({ recursoId: id, estado: "activa" }),
      perfilesRecursoApi.listar(mandanteId ? { mandanteId } : {}).catch(() => []),
      cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }),
    ]);
    const sujetos = agruparSujetos([], docs || []);
    const proyectos = await Promise.all(sujetos.map((s) => proyectosApi.obtener(s.proyectoId).catch(() => null)));
    const perfilesPorId = Object.fromEntries((perfiles || []).map((p) => [p.id, p]));
    const participacionesActivas = sujetos
      .map((s, i) => ({
        ...s,
        proyectoNombre: proyectos[i]?.nombre || null,
        proyectoCodigo: proyectos[i]?.codigo || null,
        mandanteId: proyectos[i]?.mandanteId || null,
        perfiles: s.perfilRecursoIds.map((pid) => perfilesPorId[pid]?.nombre).filter(Boolean),
      }))
      .filter((p) => !mandanteId || p.mandanteId === mandanteId);
    return { recurso, participacionesActivas, indice };
  },

  filas: (expedienteId, recursoId) => evaluacionService.filasDeSujeto(expedienteId, { recursoId }),
};
