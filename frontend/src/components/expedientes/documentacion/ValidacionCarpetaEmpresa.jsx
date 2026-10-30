import { AlertTriangle, CheckCircle2, FolderSearch, Unlink } from "lucide-react";
import { CLASE_SECUNDARIO } from "./estilos";

// Resultado de validarCarpetaEmpresa bajo la carpeta vinculada: check verde si la carpeta es de la
// Empresa, o advertencia ámbar con lo que se buscó y los botones para corregirla.
//  - nombreCarpeta: nombre validado (null: una URL de SharePoint sin carpeta).
//  - resultado: { valida, terminosBuscados }.
//  - onElegirOtra / onQuitar: opcionales (sin ellos no se muestran los botones).
export const ValidacionCarpetaEmpresa = ({ nombreCarpeta, resultado, empresaNombre, onElegirOtra, onQuitar }) => {
  if (resultado.valida) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-sage-dark">
        <CheckCircle2 className="w-4 h-4" /> La carpeta corresponde a {empresaNombre}
      </p>
    );
  }
  return (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs text-amber-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <div className="space-y-1">
          {nombreCarpeta ? (
            <p>La carpeta «{nombreCarpeta}» no contiene el nombre de la empresa <b>{empresaNombre}</b>.</p>
          ) : (
            <p>La URL no apunta a una carpeta. Ingresa la URL de la carpeta específica de la empresa <b>{empresaNombre}</b>.</p>
          )}
          {resultado.terminosBuscados.length > 0 && (
            <p>
              Se buscó: {resultado.terminosBuscados.map((t) => `«${t}»`).join(", ")}. Verifica que sea la carpeta correcta.
            </p>
          )}
        </div>
      </div>
      {(onElegirOtra || onQuitar) && (
        <div className="flex flex-wrap gap-2 pl-6">
          {onElegirOtra && (
            <button type="button" onClick={onElegirOtra} className={CLASE_SECUNDARIO}><FolderSearch className="w-3.5 h-3.5" /> Elegir otra carpeta</button>
          )}
          {onQuitar && (
            <button type="button" onClick={onQuitar} className={CLASE_SECUNDARIO}><Unlink className="w-3.5 h-3.5" /> Quitar vinculación</button>
          )}
        </div>
      )}
    </div>
  );
};
