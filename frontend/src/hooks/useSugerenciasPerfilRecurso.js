import { useEffect, useState } from "react";
import { perfilRecursoService } from "../services/perfilRecursoService";

// Nombres de los Perfiles de Recurso activos de un tipo ("persona" -> Cargo, "recurso" -> Tipo /
// Clasificación) del/los Mandante(s) indicado(s) (un id o un arreglo). Se consulta al montar y solo
// se vuelve a consultar cuando cambia el conjunto de Mandantes (nunca por tecla). Sin Mandante no se
// sugiere nada: sin él se mezclarían catálogos.
export const useSugerenciasPerfilRecurso = (mandanteIds, tipo) => {
  const [nombres, setNombres] = useState([]);
  const ids = (Array.isArray(mandanteIds) ? mandanteIds : [mandanteIds]).filter(Boolean);
  const clave = [...new Set(ids)].sort().join(",");

  useEffect(() => {
    if (!clave) {
      setNombres([]);
      return undefined;
    }
    let vigente = true;
    Promise.all(clave.split(",").map((mandanteId) => perfilRecursoService.listar({ mandanteId, tipo, estado: "activo" })))
      .then((listas) => {
        if (vigente) setNombres([...new Set(listas.flat().map((p) => p.nombre).filter(Boolean))]);
      })
      .catch((err) => console.error("Error al cargar sugerencias:", err));
    return () => { vigente = false; };
  }, [clave, tipo]);

  return nombres;
};
