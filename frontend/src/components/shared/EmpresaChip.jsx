import React from "react";

// Logo (si existe) + nombre de la Empresa — mismo patrón que
// MandanteChip.jsx, con su propio componente (no se reutiliza aquel
// directamente para no importar algo llamado "Mandante" en contextos de
// Empresa, aunque el shape sea idéntico).
//
// size="md" (default): uso discreto en columnas de tabla / tarjetas.
// size="lg": uso como "cabecera de identidad", logo y texto más grandes.
const SIZE_STYLES = {
  md: { img: "w-6 h-6", gap: "gap-2", text: "" },
  lg: { img: "w-10 h-10", gap: "gap-3", text: "text-base font-bold text-carbon-dark" },
};

// `conIniciales`: si la Empresa no tiene logo, muestra un círculo con su inicial (mismo
// criterio que el fallback de logo del resto del sistema) en vez de solo el texto.
export const EmpresaChip = ({ nombre, logoUrl, size = "md", conIniciales = false }) => {
  const estilos = SIZE_STYLES[size] || SIZE_STYLES.md;
  return (
    <span className={`inline-flex items-center ${estilos.gap}`}>
      {logoUrl && (
        <img
          src={logoUrl}
          alt=""
          className={`${estilos.img} rounded-full object-contain border border-slate-100 flex-shrink-0`}
        />
      )}
      {!logoUrl && conIniciales && (
        <span className={`${estilos.img} rounded-full bg-slate-100 border border-slate-200 text-slate-500 font-black text-xs flex items-center justify-center flex-shrink-0`}>
          {(nombre || "?").charAt(0).toUpperCase()}
        </span>
      )}
      <span className={estilos.text}>{nombre}</span>
    </span>
  );
};
