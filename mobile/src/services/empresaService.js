import { empresasApi } from "../api/empresas";
import { participacionesApi } from "../api/participaciones";
import { proyectosApi } from "../api/proyectos";
import {
  participacionPersonasApi, participacionRecursosApi, perfilesRecursoApi,
} from "../api/participacionSujetos";
import { personasApi } from "../api/personas";
import { recursosApi } from "../api/recursos";
import { agruparSujetos } from "../utils/sujetosParticipacion";
import { evaluacionService } from "./evaluacionService";
import { cumplimientoService } from "./cumplimientoService";

export const empresaService = {
  // `conCumplimiento` false (admin_comercial): solo el catálogo de Empresas.
  async listar({ mandanteId, umbralesDe, forzar = false, conCumplimiento = true } = {}) {
    const [empresas, indice] = await Promise.all([
      empresasApi.listar({ estado: "activo", mandanteId }),
      conCumplimiento ? cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }) : null,
    ]);
    return { empresas, indice };
  },

  // Empresa, sus participaciones activas (GET /empresas/:id/resumen: proyecto y perfil de
  // participación) con el código de cada Proyecto y las fechas de contrato, e índice de
  // cumplimiento.
  async obtenerDetalle(id, { mandanteId, umbralesDe, forzar = false, conCumplimiento = true } = {}) {
    const [empresa, resumen, participaciones, indice] = await Promise.all([
      empresasApi.obtener(id),
      conCumplimiento ? empresasApi.resumen(id) : null,
      conCumplimiento ? participacionesApi.listar({ empresaId: id }) : [],
      conCumplimiento ? cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }) : null,
    ]);
    const activas = (resumen?.participacionesActivas || [])
      .filter((p) => !mandanteId || p.mandanteId === mandanteId);
    const proyectos = await Promise.all(activas.map((p) => proyectosApi.obtener(p.proyectoId).catch(() => null)));
    const participacionesActivas = activas.map((p, i) => {
      const raw = (participaciones || []).find((x) => x.id === p.participacionId) || {};
      return {
        ...p,
        proyectoCodigo: proyectos[i]?.codigo || null,
        fechaInicio: raw.fechaInicio || null,
        fechaTermino: raw.fechaTermino || null,
      };
    });
    return { empresa, participacionesActivas, indice };
  },

  // Lo que depende de UNA participación: requerimientos de empresa, Personas y Equipos
  // asignados (con su ficha) y los perfiles de recurso para contarlos por rol.
  async obtenerDetalleParticipacion({ expediente, participacionId, mandanteId }) {
    const filtro = { participacionId, estado: "activa" };
    const [filasEmpresa, personas, recursos, perfiles] = await Promise.all([
      evaluacionService.filasDeSujeto(expediente?.id, { empresa: true }),
      participacionPersonasApi.listar(filtro),
      participacionRecursosApi.listar(filtro),
      perfilesRecursoApi.listar(mandanteId ? { mandanteId } : {}).catch(() => []),
    ]);
    const sujetos = agruparSujetos(personas || [], recursos || []);
    const [fichasPersonas, fichasRecursos] = await Promise.all([
      Promise.all(sujetos.filter((s) => s.personaId).map((s) => personasApi.obtener(s.personaId).catch(() => null))),
      Promise.all(sujetos.filter((s) => s.recursoId).map((s) => recursosApi.obtener(s.recursoId).catch(() => null))),
    ]);
    const fichas = Object.fromEntries([...fichasPersonas, ...fichasRecursos].filter(Boolean).map((f) => [f.id, f]));
    const perfilesPorId = Object.fromEntries((perfiles || []).map((p) => [p.id, p]));
    return { filasEmpresa, sujetos, fichas, perfilesPorId };
  },
};
