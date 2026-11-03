// Datos de Inicio: índice de cumplimiento del Mandante (contadores del
// backend en cada Expediente) y los catálogos visibles para los accesos, el
// buscador global y "Requiere atención".
import { proyectosApi } from "../api/proyectos";
import { empresasApi } from "../api/empresas";
import { personasApi } from "../api/personas";
import { recursosApi } from "../api/recursos";
import { cumplimientoService } from "./cumplimientoService";

export const dashboardService = {
  async obtener({ mandanteId, umbralesDe, forzar = false } = {}) {
    const [indice, proyectos, empresas, personas, recursos] = await Promise.all([
      cumplimientoService.cargar({ mandanteId, umbralesDe, forzar }),
      proyectosApi.listar({ mandanteId }),
      empresasApi.listar({ estado: "activo", mandanteId }),
      personasApi.listar({ estado: "activo" }),
      recursosApi.listar({ estado: "activo" }),
    ]);
    return { indice, proyectos, empresas, personas, recursos };
  },
};
