import React from "react";

// Logo (si existe) + nombre del Mandante — mismo patrón usado en toda la
// app donde se muestra un Mandante ya resuelto (no aplica dentro de
// <option> de un <select>, ahí no se puede renderizar una imagen).
//
// size="md" (default): uso discreto en columnas de tabla / campos
// deshabilitados de formulario — el texto hereda el estilo del contenedor
// que lo envuelve, igual que siempre.
// size="xl": logo grande para tarjetas donde el Mandante es protagonista.
// size="lg": uso como "cabecera de identidad" (ej. "estos son los datos
// de [Mandante]" para mandante_admin/lector) — logo y texto más grandes,
// con su propio estilo de texto, pensado para ir solo en su propia fila.
const SIZE_STYLES = {
  md: { img: "w-6 h-6", gap: "gap-2", text: "" },
  lg: { img: "w-10 h-10", gap: "gap-3", text: "text-base font-bold text-carbon-dark" },
  xl: { img: "w-14 h-14", gap: "gap-3.5", text: "text-lg font-bold text-carbon-dark" },
};

export const MandanteChip = ({ nombre, logoUrl, size = "md" }) => {
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
      <span className={estilos.text}>{nombre}</span>
    </span>
  );
};
