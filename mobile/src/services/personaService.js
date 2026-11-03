import { personasApi } from "../api/personas";
import { evaluacionService } from "./evaluacionService";
import { cumplimientoService } from "./cumplimientoService";

export const personaService = {
  async listar({ mandanteId, umbralesDe, forzar = false } = {}) {
    const [personas, indice] = await Promise.all([
      personasApi.listar({ estado: "activo" }),
      cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }),
    ]);
    return { personas, indice };
  },

  // Persona (con su empresa actual, de empresaPersonas), sus participaciones activas (de
  // participacionPersonas, con proyecto y perfiles de recurso) y su historial de empresas.
  async obtenerDetalle(id, { mandanteId, umbralesDe, forzar = false } = {}) {
    const [persona, resumen, relaciones, indice] = await Promise.all([
      personasApi.obtener(id),
      personasApi.resumen(id),
      personasApi.relaciones(id).catch(() => []),
      cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }),
    ]);
    const participacionesActivas = (resumen?.participacionesActivas || [])
      .filter((p) => !mandanteId || p.mandanteId === mandanteId);
    return { persona, participacionesActivas, relaciones: relaciones || [], indice };
  },

  filas: (expedienteId, personaId) => evaluacionService.filasDeSujeto(expedienteId, { personaId }),
};
