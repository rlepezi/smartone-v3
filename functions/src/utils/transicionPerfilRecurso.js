// TRANSICIÓN bloque 2: mientras las Asignaciones guarden el rol de la
// Persona como texto (`rol`) y la clasificación de la Maquinaria se derive
// del `tipo` del Recurso (catálogo global), este es el ÚNICO lugar que
// traduce ese texto al ID de Perfil de Recurso. Todo el resto del motor
// trabaja solo con `perfilRecursoId`. Eliminar este archivo cuando la
// Asignación guarde perfilRecursoId directamente.
const perfilRecursoRepository =
    require("../repositories/perfilRecursoRepository");
const recursoRepository = require("../repositories/recursoRepository");

/**
 * Normaliza un nombre para comparar: trim y sin distinguir mayúsculas.
 * @param {*} valor Texto a normalizar.
 * @return {string} Texto normalizado ("" si no es texto).
 */
function normalizar(valor) {
  return typeof valor === "string" ? valor.trim().toLowerCase() : "";
}

/**
 * Devuelve las Asignaciones con `perfilRecursoId` resuelto (por Mandante +
 * tipo + nombre, sin distinguir mayúsculas y con trim):
 * - Persona: por su `rol`.
 * - Recurso: por el `tipo` del Recurso.
 * Sin coincidencia → perfilRecursoId null (al sujeto solo le aplican los
 * Requerimientos "Todos") y un warning. Más de una coincidencia → se usa
 * la activa y se registra un warning. Una consulta de Perfiles por
 * Mandante distinto y una lectura en lote de los Recursos: sin N+1.
 * @param {Object[]} asignaciones Asignaciones (cualquier estado).
 * @return {Promise<Object[]>} Copias con `perfilRecursoId`.
 */
async function resolverPerfilesRecurso(asignaciones) {
  const lista = (asignaciones || []).filter(Boolean);
  if (lista.length === 0) return [];

  const mandanteIds = [...new Set(lista.map((a) => a.mandanteId))]
      .filter(Boolean);
  const recursoIds = [...new Set(
      lista.filter((a) => a.recursoId).map((a) => a.recursoId),
  )];
  const [perfilesPorMandante, tiposRecurso] = await Promise.all([
    Promise.all(
        mandanteIds.map((id) => perfilRecursoRepository.list({mandanteId: id})),
    ),
    recursoRepository.getTiposByIds(recursoIds),
  ]);

  const indice = new Map();
  perfilesPorMandante.flat().forEach((p) => {
    const clave = `${p.mandanteId}|${p.tipo}|${normalizar(p.nombre)}`;
    if (!indice.has(clave)) indice.set(clave, []);
    indice.get(clave).push(p);
  });

  return lista.map((a) => {
    const tipo = a.personaId ? "persona" : "recurso";
    const nombre = a.personaId ? a.rol : tiposRecurso[a.recursoId];
    const candidatos =
        indice.get(`${a.mandanteId}|${tipo}|${normalizar(nombre)}`) || [];
    if (candidatos.length === 0) {
      console.warn(
          `[TRANSICIÓN bloque 2] Sin Perfil de Recurso para ${tipo} ` +
          `'${nombre ?? ""}' (Mandante ${a.mandanteId}, Asignación ${a.id}).`,
      );
      return {...a, perfilRecursoId: null};
    }
    let elegido = candidatos[0];
    if (candidatos.length > 1) {
      elegido = candidatos.find((p) => p.estado === "activo") || candidatos[0];
      console.warn(
          `[TRANSICIÓN bloque 2] ${candidatos.length} Perfiles de Recurso ` +
          `coinciden con ${tipo} '${nombre}' (Mandante ${a.mandanteId}); ` +
          `se usa ${elegido.id}.`,
      );
    }
    return {...a, perfilRecursoId: elegido.id};
  });
}

module.exports = {resolverPerfilesRecurso};
