import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { VisorDocumentosCarpeta } from "./VisorDocumentosCarpeta";

const ANCHO_ESCRITORIO = 1024;
const esAncho = () => typeof window !== "undefined" && window.innerWidth >= ANCHO_ESCRITORIO;

// Marco de los modales "Nueva Persona" / "Nueva Maquinaria": encabezado y, si hay carpeta
// (`documento`), el interruptor "📄 Ver documento". Activo: modal ancho (min(1200px, 95vw) × 85vh)
// con el visor a la izquierda (~60%) y el formulario sin cambios a la derecha (~40%); bajo 1024px,
// pestañas "Documento" / "Datos" (el formulario no se desmonta: lo tipeado se conserva).
//  - documento: { handle, tipo, rutaListados, rutaPropia, nombrePropio, activoInicial } o null.
//  - campoFocoRef: campo que recibe el foco al activar el visor (RUT o patente).
export const LayoutModalDocumento = ({
  titulo, onCerrar, documento = null, nombreBuscado, onRut, onSugerenciaRut, campoFocoRef, children,
}) => {
  const [activo, setActivo] = useState(Boolean(documento?.activoInicial));
  const [pestana, setPestana] = useState("documento");
  const [ancho, setAncho] = useState(esAncho);

  useEffect(() => {
    const alCambiar = () => setAncho(esAncho());
    window.addEventListener("resize", alCambiar);
    return () => window.removeEventListener("resize", alCambiar);
  }, []);

  useEffect(() => {
    if (activo && ancho) campoFocoRef?.current?.focus();
  }, [activo, ancho, campoFocoRef]);

  const conVisor = Boolean(documento) && activo;
  const cabecera = (
    <div className="flex items-center justify-between gap-3 p-5 border-b border-slate-100">
      <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">{titulo}</h3>
      <div className="flex items-center gap-3">
        {documento && (
          <button type="button" role="switch" aria-checked={activo} onClick={() => setActivo((a) => !a)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${activo ? "border-primary bg-primary-lighter text-primary-dark" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <FileText className="w-3.5 h-3.5" /> Ver documento
          </button>
        )}
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
    </div>
  );
  const visor = conVisor && (
    <VisorDocumentosCarpeta
      handle={documento.handle} tipo={documento.tipo} rutaListados={documento.rutaListados}
      rutaPropia={documento.rutaPropia} nombrePropio={documento.nombrePropio}
      nombreBuscado={nombreBuscado} onRut={onRut} onSugerenciaRut={onSugerenciaRut}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div
        className={conVisor
          ? "bg-white rounded-2xl shadow-dropdown w-[min(1200px,95vw)] h-[85vh] flex flex-col overflow-hidden"
          : "bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[90vh] overflow-y-auto"}
        onClick={(e) => e.stopPropagation()}
      >
        {cabecera}
        {!conVisor ? children : ancho ? (
          <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)" }}>
            <div className="min-h-0 border-r border-slate-100 flex flex-col">{visor}</div>
            <div className="min-h-0 overflow-y-auto">{children}</div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex border-b border-slate-100" role="tablist">
              {[["documento", "Documento"], ["datos", "Datos"]].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
                  className={`flex-1 py-2 text-xs font-bold ${pestana === k ? "text-primary border-b-2 border-primary" : "text-slate-500"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className={pestana === "documento" ? "flex-1 min-h-0 flex flex-col" : "hidden"}>{visor}</div>
            <div className={pestana === "datos" ? "flex-1 min-h-0 overflow-y-auto" : "hidden"}>{children}</div>
          </div>
        )}
      </div>
    </div>
  );
};
