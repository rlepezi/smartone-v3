// Contexto legible de un evento de Bitácora: a QUIÉN se refiere (nombre y ficha a la que lleva) y
// un detalle corto (de qué empresa a cuál, de qué proyecto a cuál...). Los nombres se resuelven con
// mapas id → nombre ya cargados por la pantalla (`nombres`): { personas, recursos, empresas,
// proyectos, expedientes }, donde `expedientes` es id → { empresaId, proyectoId }. Si un nombre no
// está en los mapas, se usa el que el propio evento haya guardado; nunca se muestra un ID crudo.

const nombreDe = (mapa, id) => (id && mapa ? mapa[id] || null : null);

// Ficha de una entidad, abierta en su pestaña Historial.
const RUTAS = {
  persona: (id) => `/personas/${id}?tab=historial`,
  recurso: (id) => `/recursos/${id}?tab=historial`,
  empresa: (id) => `/empresas/${id}?tab=historial`,
  proyecto: (id) => `/proyectos/${id}?tab=historial`,
  expediente: (id) => `/expedientes/${id}`,
};

const unir = (...partes) => partes.filter(Boolean).join(" · ") || null;
const deA = (desde, hacia) => (desde && hacia ? `De ${desde} a ${hacia}` : hacia ? `A ${hacia}` : null);

// { sujeto: { nombre, ruta } | null, detalle: string | null }
export const contextoEvento = (evento, nombres = {}) => {
  const { entidad, entidadId, accion, detalle: d = {} } = evento || {};
  const persona = (id) => (id ? { nombre: nombreDe(nombres.personas, id), ruta: RUTAS.persona(id) } : null);
  const recurso = (id) => (id ? { nombre: nombreDe(nombres.recursos, id), ruta: RUTAS.recurso(id) } : null);
  const empresa = (id, guardado) => (id ? { nombre: nombreDe(nombres.empresas, id) || guardado || null, ruta: RUTAS.empresa(id) } : null);
  const empresaNombre = (id, guardado) => nombreDe(nombres.empresas, id) || guardado || null;
  const proyectoNombre = (id) => nombreDe(nombres.proyectos, id);

  switch (entidad) {
    case "persona":
    case "recurso": {
      const sujeto = entidad === "persona" ? persona(entidadId) : recurso(entidadId);
      if (accion === "cambio_empresa") {
        return {
          sujeto,
          detalle: deA(empresaNombre(d.empresaAnteriorId, d.empresaAnteriorNombre), empresaNombre(d.empresaNuevaId, d.empresaNuevaNombre)),
        };
      }
      if (accion === "relacion_terminada" || accion === "creado") {
        return { sujeto, detalle: empresaNombre(d.empresaId) ? `Empresa: ${empresaNombre(d.empresaId)}` : null };
      }
      return { sujeto, detalle: null };
    }
    case "participacionPersona":
    case "participacionRecurso": {
      const esPersona = entidad === "participacionPersona";
      const sujetoId = accion === "reemplazo_acreditacion" ? d.entidadId : (esPersona ? d.personaId : d.recursoId);
      const sujeto = esPersona ? persona(sujetoId) : recurso(sujetoId);
      if (accion === "reemplazo_acreditacion") {
        return { sujeto, detalle: deA(proyectoNombre(d.proyectoOrigenId), proyectoNombre(d.proyectoDestinoId)) };
      }
      return { sujeto, detalle: proyectoNombre(d.proyectoId) ? `Proyecto: ${proyectoNombre(d.proyectoId)}` : null };
    }
    case "participacion": {
      if (accion === "reemplazo_acreditacion" && d.entidadTipo === "empresa") {
        return { sujeto: empresa(d.entidadId), detalle: proyectoNombre(d.proyectoDestinoId) ? `A ${proyectoNombre(d.proyectoDestinoId)}` : null };
      }
      return { sujeto: empresa(d.empresaId), detalle: proyectoNombre(d.proyectoId) ? `Proyecto: ${proyectoNombre(d.proyectoId)}` : null };
    }
    case "empresa":
      return { sujeto: empresa(entidadId, d.empresaNombre || d.razonSocial), detalle: null };
    case "proyecto":
      return { sujeto: entidadId ? { nombre: proyectoNombre(entidadId), ruta: RUTAS.proyecto(entidadId) } : null, detalle: null };
    case "expediente": {
      const exp = nombres.expedientes?.[entidadId];
      return {
        sujeto: { nombre: exp ? empresaNombre(exp.empresaId) : null, ruta: RUTAS.expediente(entidadId) },
        detalle: unir(exp ? proyectoNombre(exp.proyectoId) : null, d.motivo && d.estadoNuevo === "cerrado" ? `Motivo: ${d.motivo.replace(/_/g, " ")}` : null),
      };
    }
    case "evaluacion": {
      const tab = d.personaId ? "persona" : d.recursoId ? "recurso" : "empresa";
      const sujetoId = d.personaId || d.recursoId;
      const nombre = d.personaId ? nombreDe(nombres.personas, d.personaId)
        : d.recursoId ? nombreDe(nombres.recursos, d.recursoId)
          : empresaNombre(nombres.expedientes?.[d.expedienteId]?.empresaId);
      return {
        sujeto: d.expedienteId ? {
          nombre,
          ruta: `/expedientes/${d.expedienteId}?tab=${tab}${sujetoId ? `&sujeto=${sujetoId}` : ""}`,
        } : null,
        detalle: null,
      };
    }
    case "requerimiento":
      return { sujeto: { nombre: null, ruta: `/requerimientos?editar=${entidadId}` }, detalle: null };
    case "usuario":
      return { sujeto: { nombre: null, ruta: `/usuarios/${entidadId}` }, detalle: null };
    case "perfil_recurso":
      return { sujeto: { nombre: null, ruta: `/perfiles-recurso/${entidadId}` }, detalle: null };
    case "perfil_participacion":
      return { sujeto: { nombre: null, ruta: `/perfiles-participacion/${entidadId}` }, detalle: null };
    default:
      return { sujeto: null, detalle: null };
  }
};
