import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PerfilRecursoFormulario } from "./PerfilRecursoFormulario";

// "Nuevo Perfil de Recurso" en un modal: envuelve el MISMO formulario que la pantalla de Perfiles
// de Recurso (PerfilRecursoFormulario), sin copiar sus campos ni su lógica de guardado. Con `fijo`,
// Mandante y Clasificación vienen de `inicial` y son de solo lectura (alta desde una asignación).
// Se dibuja en un portal porque puede abrirse sobre otro modal (Ingresar recurso, Cambiar Proyecto).
export const NuevoPerfilRecursoModal = ({ inicial, fijo = false, onGuardado, onCerrar }) => createPortal(
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo Perfil de Recurso"
      className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Nuevo Perfil de Recurso</h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5">
        <PerfilRecursoFormulario inicial={inicial} fijo={fijo} onGuardado={onGuardado} onCancelar={onCerrar} />
      </div>
    </div>
  </div>,
  document.body,
);
