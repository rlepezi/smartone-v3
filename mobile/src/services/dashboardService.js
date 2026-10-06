// Datos de la pantalla Inicio. Los conteos vienen 100% de
// GET /reportes/resumen — prohibido contar documentos en el cliente
// (mobile/AGENTS.md).
import { reportesApi } from "../api/reportes";
import { proyectosApi } from "../api/proyectos";
import { empresasApi } from "../api/empresas";
import { personasApi } from "../api/personas";
import { recursosApi } from "../api/recursos";

export const dashboardService = {
  async obtenerResumen({ mandanteId, diasVencimiento = 30 } = {}) {
    const [resumen, proyectos, empresas, personas, recursos] =
      await Promise.all([
        reportesApi.resumen({ diasVencimiento }),
        proyectosApi.listar({ mandanteId }),
        empresasApi.listar({}),
        personasApi.listar({}),
        recursosApi.listar({}),
      ]);

    return {
      // empresas: {total, acreditadas, enProceso, observadas} — 3
      // categorías reales (ver decisions.md / theme/status.js). No existe
      // una 4ta categoría "vencida" a nivel de Expediente en el backend;
      // "vencido" es un conteo aparte, de documentos/evaluaciones, no de
      // empresas (ver `vencimientos` abajo).
      acreditacion: resumen.empresas,
      vencimientos: resumen.vencimientos,
      // GAP conocido (ver auditoría Fase A): no existe un agregado de
      // backend con el total de Proyectos/Empresas/Personas/Recursos —
      // /reportes/resumen no lo incluye. `.length` sobre la respuesta de
      // un GET de la API no es "contar documentos de Firestore en el
      // cliente" (lo prohibido es sumar/promediar resultados de
      // Evaluación a mano, que es donde vive el bug 0/0 ya conocido),
      // pero sí es una carga completa de cada catálogo solo para contar.
      // Reportar como pendiente de un endpoint agregado si las listas
      // crecen lo suficiente para que esto pese en performance.
      conteos: {
        proyectos: proyectos.length,
        empresas: empresas.length,
        personas: personas.length,
        recursos: recursos.length,
      },
    };
  },

  async obtenerDocumentosPorVencer(diasVencimiento = 30) {
    return reportesApi.detalle({ tipo: "por_vencer", diasVencimiento });
  },
};
