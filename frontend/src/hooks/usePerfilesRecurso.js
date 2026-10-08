import { useEffect, useState } from "react";
import { perfilRecursoService } from "../services/perfilRecursoService";

// Mapa id -> Perfil de Recurso (cualquier estado) de los visibles para el
// actor, para mostrar el nombre de los perfiles de una Persona/Maquinaria
// asignada (el nombre nunca se guarda en la asignación, solo el ID).
export const usePerfilesRecurso = () => {
  const [perfilesPorId, setPerfilesPorId] = useState({});
  useEffect(() => {
    let vigente = true;
    perfilRecursoService.listar({})
      .then((data) => {
        if (vigente) setPerfilesPorId(Object.fromEntries((data || []).map((p) => [p.id, p])));
      })
      .catch((err) => console.error("Error al cargar perfiles de recurso:", err));
    return () => { vigente = false; };
  }, []);
  return perfilesPorId;
};
