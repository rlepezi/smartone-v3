import { evaluacionesApi } from "../api/evaluaciones";
import { expedientesApi } from "../api/expedientes";

// Requisitos de un sujeto en un Expediente = sus instancias de Requerimiento (las genera el
// backend; la app no cruza requerimientos con sujetos). `sujeto`: { empresa: true } |
// { personaId } | { recursoId }.
export const evaluacionService = {
  // Filas { requerimiento, evaluacion } del sujeto: cada instancia activa (que trae su nombre
  // congelado) con su Evaluación vigente, si la tiene.
  async filasDeSujeto(expedienteId, sujeto) {
    if (!expedienteId) return [];
    const [instancias, evaluaciones] = await Promise.all([
      expedientesApi.requerimientos(expedienteId, sujeto),
      evaluacionesApi.listar({ expedienteId, ...sujetoComoParams(sujeto) }),
    ]);
    const porId = Object.fromEntries((evaluaciones || []).map((e) => [e.id, e]));
    return (instancias || []).map((i) => ({
      requerimiento: {
        requerimientoId: i.requerimientoId,
        nombre: i.nombre,
        requiereVencimiento: i.requiereVencimiento,
      },
      evaluacion: i.evaluacionVigenteId ? porId[i.evaluacionVigenteId] || null : null,
    }));
  },
};

function sujetoComoParams(sujeto) {
  if (sujeto.personaId) return { personaId: sujeto.personaId };
  if (sujeto.recursoId) return { recursoId: sujeto.recursoId };
  return { empresa: "true" };
}
