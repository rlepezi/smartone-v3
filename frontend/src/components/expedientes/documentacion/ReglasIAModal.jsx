import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ReglasIARequerimiento } from "../../requerimientos/reglas-ia/ReglasIARequerimiento";

// "Definir reglas" / "Editar reglas" desde el panel de evaluación (solo superadmin): la pestaña
// Reglas IA del requerimiento en un modal, sin salir del expediente. Cada cambio se guarda al
// momento; al cerrar, la planilla recarga la pauta (estado IA y reglas).
// `carpetaExpediente`: carpeta asignada al requerimiento en el expediente desde el que se abre.
export const ReglasIAModal = ({ requerimientoId, nombre, onCerrar, carpetaExpediente = null }) => createPortal(
  // Los eventos de un portal suben por el árbol de React: sin cortarlos, un clic acá llegaría al
  // modal de requisitos que está debajo.
  <div className="fixed inset-0 z-[58] flex items-center justify-center p-4 bg-black/40"
    onClick={(e) => { e.stopPropagation(); onCerrar(); }} onDoubleClick={(e) => e.stopPropagation()}>
    <div role="dialog" aria-modal="true" aria-label={`Reglas IA de ${nombre}`} onClick={(e) => e.stopPropagation()}
      className="bg-white rounded-2xl shadow-dropdown w-full max-w-3xl max-h-[90vh] flex flex-col">
      <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Reglas IA</h3>
          <p className="text-xs text-slate-500 mt-0.5">{nombre}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        <ReglasIARequerimiento requerimientoId={requerimientoId} carpetaExpediente={carpetaExpediente} />
      </div>
    </div>
  </div>,
  document.body,
);
