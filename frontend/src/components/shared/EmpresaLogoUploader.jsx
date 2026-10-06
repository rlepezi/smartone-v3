import React, { useRef, useState } from "react";
import { HardHat, Upload } from "lucide-react";
import { storageService } from "../../services/storageService";

const TIPOS_ACEPTADOS = "image/png,image/jpeg,image/jpg,image/svg+xml";

// Sube el logo a Storage y notifica la URL resultante de inmediato — no
// espera al guardado general del formulario (mismo patrón que
// MandanteLogoUploader.jsx).
//
// Modo diferido (sin `empresaId`, ej. al crear una Empresa nueva): todavía
// no existe un ID real contra el cual subir el archivo, así que en vez de
// subirlo se lo entrega crudo al padre vía `onArchivoSeleccionado` — el
// padre lo sube recién después de crear la Empresa y obtener su ID real
// (ver EmpresaFormPage.jsx). El padre es responsable de mostrar una
// previsualización local (ej. con URL.createObjectURL) pasándola como
// `logoUrl`.
export const EmpresaLogoUploader = ({
  empresaId, logoUrl, onUploaded, onArchivoSeleccionado, disabled,
}) => {
  const inputRef = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;

    if (!empresaId) {
      onArchivoSeleccionado?.(archivo);
      return;
    }

    setError(null);
    setSubiendo(true);
    try {
      const { url } = await storageService.subirLogoEmpresa(empresaId, archivo);
      await onUploaded(url);
    } catch (err) {
      console.error("Error al subir el logo:", err);
      setError(err.message || "No se pudo subir el logo.");
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo de la empresa" className="w-full h-full object-contain" />
        ) : (
          <HardHat className="w-6 h-6 text-gray-300" />
        )}
      </div>
      {!disabled && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS_ACEPTADOS}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {subiendo ? "Subiendo..." : logoUrl ? "Reemplazar logo" : "Subir logo"}
          </button>
          <p className="text-[11px] text-gray-400 mt-1">PNG, JPG o SVG, máx. 2MB.</p>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
};
