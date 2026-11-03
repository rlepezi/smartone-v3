// Índice de cumplimiento del Mandante en contexto, armado con UNA lectura de
// GET /expedientes (con los contadores `resumen` / `resumenSujetos` que
// mantiene el backend). Lo comparten Inicio y todas las listas. No se cuentan
// evaluaciones en el cliente (mobile/AGENTS.md): solo se suman contadores.
import { expedientesApi } from "../api/expedientes";
import {
  nivelDeResumen, peorNivel, porcentajeCumplimiento, sumarResumenes, expedienteConVencidos,
} from "../utils/complianceStatus";

// Caché breve por Mandante para no repetir la lectura al cambiar de pestaña
// (el "tirar para actualizar" la fuerza).
const TTL_MS = 60 * 1000;
const cache = new Map();

const agregar = (mapa, clave, valor) => {
  if (!mapa.has(clave)) mapa.set(clave, []);
  mapa.get(clave).push(valor);
};

// Construye el índice. `umbralesDe(mandanteId)` da los umbrales de cada Mandante.
function construirIndice(expedientes, umbralesDe) {
  // Solo Expedientes abiertos (las participaciones vigentes); los cerrados son historia.
  const abiertos = (expedientes || []).filter((e) => e.estado !== "cerrado");
  const porEmpresa = new Map();
  const porProyecto = new Map();
  const porPersona = new Map();
  const porRecurso = new Map();
  abiertos.forEach((e) => {
    agregar(porEmpresa, e.empresaId, e);
    agregar(porProyecto, e.proyectoId, e);
    Object.entries(e.resumenSujetos || {}).forEach(([clave, resumen]) => {
      if (clave.startsWith("persona_")) agregar(porPersona, clave.slice(8), { expediente: e, resumen });
      else if (clave.startsWith("recurso_")) agregar(porRecurso, clave.slice(8), { expediente: e, resumen });
    });
  });

  const umbrales = (e) => (umbralesDe ? umbralesDe(e.mandanteId) : null);
  const nivelExpediente = (e) => nivelDeResumen(e.resumen, umbrales(e));

  // Agregado de varios Expedientes: % ponderado (sumando contadores) y el peor nivel de ellos.
  const agregado = (lista) => {
    if (!lista?.length) return null;
    const suma = sumarResumenes(lista.map((e) => e.resumen));
    const niveles = lista.map(nivelExpediente);
    const nivel = nivelDeResumen(suma, umbrales(lista[0]));
    return {
      ...nivel,
      clave: peorNivel(niveles.map((n) => n.clave)) || nivel.clave,
      pct: porcentajeCumplimiento(suma),
      conVencidos: lista.filter(expedienteConVencidos).length,
    };
  };

  // Sujeto (Persona o Equipo): peor nivel entre sus participaciones abiertas.
  const nivelSujeto = (filas) => {
    if (!filas?.length) return { clave: "sinParticipacion", pct: null };
    const niveles = filas.map((f) => nivelDeResumen(f.resumen, umbrales(f.expediente)));
    const suma = sumarResumenes(filas.map((f) => f.resumen));
    return {
      ...nivelDeResumen(suma, umbrales(filas[0].expediente)),
      clave: peorNivel(niveles.map((n) => n.clave)) || niveles[0].clave,
      pct: porcentajeCumplimiento(suma),
    };
  };

  return {
    expedientes: abiertos,
    nivelExpediente,
    empresa: (id) => {
      const lista = porEmpresa.get(id) || [];
      const a = agregado(lista);
      return a ? { ...a, proyectos: new Set(lista.map((e) => e.proyectoId)).size } : null;
    },
    expedientesDeEmpresa: (id) => porEmpresa.get(id) || [],
    proyecto: (id) => {
      const lista = porProyecto.get(id) || [];
      const a = agregado(lista);
      if (!a) return null;
      return {
        ...a,
        empresas: new Set(lista.map((e) => e.empresaId)).size,
        personas: lista.reduce((t, e) => t + (e.cantidadPersonas || 0), 0),
        equipos: lista.reduce((t, e) => t + (e.cantidadMaquinarias || 0), 0),
      };
    },
    expedientesDeProyecto: (id) => porProyecto.get(id) || [],
    persona: (id) => nivelSujeto(porPersona.get(id)),
    recurso: (id) => nivelSujeto(porRecurso.get(id)),
    expedienteDe: (empresaId, proyectoId) =>
      (porEmpresa.get(empresaId) || []).find((e) => e.proyectoId === proyectoId) || null,
  };
}

export const cumplimientoService = {
  // `mandanteId` null = todos los visibles para el rol.
  async cargar({ mandanteId = null, umbralesDe = null, forzar = false } = {}) {
    const clave = mandanteId || "*";
    const enCache = cache.get(clave);
    let expedientes;
    if (!forzar && enCache && Date.now() - enCache.t < TTL_MS) {
      expedientes = enCache.expedientes;
    } else {
      expedientes = await expedientesApi.listar({ mandanteId, incluirConteo: "true" });
      cache.set(clave, { t: Date.now(), expedientes });
    }
    return construirIndice(expedientes, umbralesDe);
  },
};
