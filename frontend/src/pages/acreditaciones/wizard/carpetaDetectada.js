import { useMemo } from "react";
import { clasificarCarpetas } from "../../../utils/carpetasSujetos";

// Clasificación memoizada de las subcarpetas (la usan la lista "Detectadas en carpeta" y el contador
// de pendientes de la pestaña).
export const useFilasDetectadas = (detectadas, tipo, propios, otros) => useMemo(
  () => (detectadas ? clasificarCarpetas(detectadas, tipo, propios, otros) : []),
  [detectadas, tipo, propios, otros],
);

// Filas sin resolver (para el punto de la pestaña): sugeridas o ambiguas cuyo sujeto no está
// seleccionado, y no registradas. "Otra empresa" es solo informativa.
export const contarPendientes = (filas, estaSeleccionado) => filas.filter((f) =>
  f.estado !== "otra_empresa" && !f.candidatos.some((c) => estaSeleccionado(c.id))).length;
