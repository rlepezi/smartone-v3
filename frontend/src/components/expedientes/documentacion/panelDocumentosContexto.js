import { createContext, useContext } from "react";

// Estado del contenedor del panel de documentos que el panel necesita: si se puede expandir (vista
// de escritorio) y si está expandido (~65% del ancho). Lo provee ConPanelDocumentos.
export const PanelDocumentosContexto = createContext({ expandible: false, expandido: false, alternarExpandido: () => {} });
export const usePanelDocumentos = () => useContext(PanelDocumentosContexto);
export const CLAVE_PANEL_EXPANDIDO = "smartone:panelDocumentos:expandido";
