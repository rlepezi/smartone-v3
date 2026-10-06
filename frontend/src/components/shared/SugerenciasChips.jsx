import React from "react";

// Chips de sugerencia bajo un campo de texto: un clic rellena el campo, que sigue siendo
// editable (no es un selector cerrado). Mismo estilo que las sugerencias de nombre del
// formulario de Perfil de Recurso.
export const SugerenciasChips = ({ opciones = [], valor = "", onElegir }) => {
  if (opciones.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="text-[11px] text-slate-400">Sugerencias:</span>
      {opciones.map((opcion) => (
        <button
          key={opcion}
          type="button"
          onClick={() => onElegir(opcion)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
            valor === opcion
              ? "bg-primary text-white border-primary"
              : "bg-primary-lighter text-primary-dark border-primary-light hover:bg-primary/20"
          }`}
        >
          {opcion}
        </button>
      ))}
    </div>
  );
};
