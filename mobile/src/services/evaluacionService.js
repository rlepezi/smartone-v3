import { evaluacionesApi } from "../api/evaluaciones";
import { aplicaRequerimientoASujeto } from "../utils/aplicabilidadRequerimiento";

// GET /evaluaciones no acepta personaId/recursoId como filtro server-side
// (evaluacionController.list): se filtra en memoria, mismo criterio que
// PlanillaEvaluacion.jsx en el frontend web.
export const evaluacionService = {
  async obtenerVigentesPorExpediente(expedienteId) {
    if (!expedienteId) return [];
    return evaluacionesApi.listar({ expedienteId });
  },

  filtrarPorPersona(evaluaciones, personaId) {
    return evaluaciones.filter((e) => e.personaId === personaId);
  },

  filtrarPorRecurso(evaluaciones, recursoId) {
    return evaluaciones.filter((e) => e.recursoId === recursoId);
  },

  filtrarNivelEmpresa(evaluaciones) {
    return evaluaciones.filter((e) => !e.personaId && !e.recursoId);
  },

  // Une el snapshot de requerimientosAplicables del Expediente (que trae
  // `nombre`) con la Evaluación vigente de ese sujeto, para no mostrar un
  // id crudo en la UI. Qué Requerimientos son "propios" lo decide la regla
  // única utils/aplicabilidadRequerimiento.js. `sujeto`: { tipoEntidad,
  // perfilRecursoId } (el Perfil de Recurso de su Asignación activa).
  combinarConRequerimientos(expediente, evaluacionesDelSujeto, sujeto) {
    const aplicables = (expediente?.requerimientosAplicables || [])
        .filter((r) => aplicaRequerimientoASujeto(r, sujeto));
    const porRequerimiento = Object.fromEntries(
        evaluacionesDelSujeto.map((e) => [e.requerimientoId, e]),
    );
    return aplicables.map((requerimiento) => ({
      requerimiento,
      evaluacion: porRequerimiento[requerimiento.requerimientoId] || null,
    }));
  },
};
