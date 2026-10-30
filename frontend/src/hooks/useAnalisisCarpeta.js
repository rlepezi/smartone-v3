import { useCallback, useState } from "react";
import { leerArbol } from "../services/fuentes/carpetaLocal";
import { revisionIAService } from "../services/revisionIAService";
import { guardarAnalisis, leerAnalisis } from "../utils/analisisCarpeta";

// Último análisis de estructura de la carpeta del expediente en este navegador (ver
// utils/analisisCarpeta) y "Reanalizar": lee la carpeta (solo metadatos) y la compara con la
// plantilla activa del Mandante, igual que Revisiones IA → paso 1.
export const useAnalisisCarpeta = (usuarioId, expedienteId, mandanteId) => {
  const [analisis, setAnalisis] = useState(() => leerAnalisis(usuarioId, expedienteId));
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState(null);

  const reanalizar = useCallback(async (handle) => {
    if (!handle) return;
    setAnalizando(true);
    setError(null);
    try {
      const { arbol } = await leerArbol(handle);
      const plan = await revisionIAService.analizar({ mandanteId, arbol, modoEstructura: "plantilla" });
      setAnalisis(guardarAnalisis(usuarioId, expedienteId, handle.name, plan));
    } catch (err) {
      setError(err.message || "No se pudo analizar la carpeta.");
    } finally {
      setAnalizando(false);
    }
  }, [usuarioId, expedienteId, mandanteId]);

  return { analisis, analizando, error, reanalizar };
};
