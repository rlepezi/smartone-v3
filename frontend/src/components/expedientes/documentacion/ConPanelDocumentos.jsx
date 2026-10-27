import { useEffect, useMemo, useState } from "react";
import { FolderOpen, PanelRightClose, X } from "lucide-react";
import { CLAVE_PANEL_ABIERTO } from "./estilos";
import { PanelDocumentosContexto, CLAVE_PANEL_EXPANDIDO } from "./panelDocumentosContexto";

const leer = (clave, porDefecto) => {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? porDefecto : v === "1";
  } catch {
    return porDefecto;
  }
};
const guardar = (clave, valor) => {
  try {
    localStorage.setItem(clave, valor ? "1" : "0");
  } catch {
    // Sin almacenamiento local: funciona igual, sin recordar el estado.
  }
};

const ANCHO_ESCRITORIO = 1024;
const esAncho = () => typeof window !== "undefined" && window.innerWidth >= ANCHO_ESCRITORIO;

// Vista dividida: a la izquierda la evaluación (children), que sigue completamente usable, y a la
// derecha el panel de documentos (~40%, o ~65% "Expandido"), colapsable con el botón "Documentos".
// Abierto y expandido se recuerdan en este navegador. En pantallas angostas el panel se abre como
// un drawer superpuesto.
export const ConPanelDocumentos = ({ panel, children }) => {
  const [abierto, setAbierto] = useState(() => leer(CLAVE_PANEL_ABIERTO, true));
  const [expandido, setExpandido] = useState(() => leer(CLAVE_PANEL_EXPANDIDO, false));
  const [ancho, setAncho] = useState(esAncho);

  useEffect(() => {
    const alCambiar = () => setAncho(esAncho());
    window.addEventListener("resize", alCambiar);
    return () => window.removeEventListener("resize", alCambiar);
  }, []);

  const cambiar = (valor) => {
    setAbierto(valor);
    guardar(CLAVE_PANEL_ABIERTO, valor);
  };
  const contexto = useMemo(() => ({
    expandible: ancho,
    expandido: ancho && expandido,
    alternarExpandido: () => setExpandido((v) => {
      guardar(CLAVE_PANEL_EXPANDIDO, !v);
      return !v;
    }),
  }), [ancho, expandido]);

  const botonAbrir = (
    <button type="button" onClick={() => cambiar(true)} aria-expanded={false}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary/30 bg-primary-lighter text-xs font-bold text-primary-dark hover:bg-primary-lighter/70">
      <FolderOpen className="w-3.5 h-3.5" /> Documentos
    </button>
  );
  const cabecera = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white">
      <FolderOpen className="w-4 h-4 text-primary" />
      <span className="text-xs font-bold text-carbon-dark mr-auto">Documentos</span>
      <button type="button" onClick={() => cambiar(false)} aria-label="Ocultar documentos" aria-expanded
        className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        {ancho ? <PanelRightClose className="w-4 h-4" /> : <X className="w-4 h-4" />}
      </button>
    </div>
  );

  if (!ancho) {
    return (
      <PanelDocumentosContexto.Provider value={contexto}>
        <div className="space-y-3">
          <div className="flex justify-end">{botonAbrir}</div>
          {children}
          {abierto && (
            <div className="fixed inset-0 z-[55] flex justify-end bg-black/30" onClick={() => cambiar(false)}>
              <aside role="dialog" aria-modal="true" aria-label="Documentos" onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md h-full bg-white shadow-dropdown flex flex-col">
                {cabecera}
                <div className="flex-1 min-h-0 flex flex-col">{panel}</div>
              </aside>
            </div>
          )}
        </div>
      </PanelDocumentosContexto.Provider>
    );
  }

  return (
    <PanelDocumentosContexto.Provider value={contexto}>
      <div className={abierto ? "grid gap-4 items-start" : "space-y-3"}
        style={abierto ? { gridTemplateColumns: expandido ? "minmax(0, 7fr) minmax(0, 13fr)" : "minmax(0, 3fr) minmax(0, 2fr)" } : undefined}>
        <div className="min-w-0 space-y-3">
          {!abierto && <div className="flex justify-end">{botonAbrir}</div>}
          {children}
        </div>
        {abierto && (
          <aside aria-label="Documentos" className="sticky top-4 rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col h-[calc(100vh-2rem)] max-h-[56rem]">
            {cabecera}
            <div className="flex-1 min-h-0 flex flex-col">{panel}</div>
          </aside>
        )}
      </div>
    </PanelDocumentosContexto.Provider>
  );
};
