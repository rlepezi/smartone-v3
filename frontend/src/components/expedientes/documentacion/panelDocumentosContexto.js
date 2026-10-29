import { createContext, useContext } from "react";

// Estado del contenedor del panel de documentos que el panel necesita: si se puede expandir (vista
// de escritorio) y si está expandido (~65% del ancho). Lo provee ConPanelDocumentos.
// `archivoAbierto` ({ file, rutaRelativa } | null): el archivo que muestra el visor del panel; lo
// informa el panel (`informarArchivo`) y lo usa "Revisar con IA" de la evaluación.
// "Modo requerimiento" (ícono IA de cada requisito de la planilla): `requerimientoActivo` son los
// datos que publica la planilla ({ instancia, pauta, propuesta, aplicada, puedeRevisar, acciones }) o
// null; `abrirRequerimiento(datos | null)` lo abre (y abre el panel si está colapsado) o vuelve al
// modo documentos; `actualizarRequerimiento(datos)` refresca los datos del que está abierto. Fuera de
// ConPanelDocumentos son null: la planilla no muestra el ícono.
export const PanelDocumentosContexto = createContext({
  expandible: false, expandido: false, alternarExpandido: () => {}, archivoAbierto: null, informarArchivo: () => {},
  requerimientoActivo: null, abrirRequerimiento: null, actualizarRequerimiento: null,
});
export const usePanelDocumentos = () => useContext(PanelDocumentosContexto);
export const CLAVE_PANEL_EXPANDIDO = "smartone:panelDocumentos:expandido";
