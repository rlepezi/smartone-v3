import React from "react";

// Anillo de progreso con VARIOS segmentos de color (a diferencia de
// ProgressRing.jsx, que solo pinta un único valor/color) — mismo truco
// SVG de stroke-dasharray, apilando un <circle> por segmento con su
// propio dashoffset acumulado. No reemplaza a ProgressRing (se deja tal
// cual donde ya se usa), este es para paneles que necesitan mostrar una
// distribución de varias categorías en un solo anillo (ej. "Estado de
// Cumplimiento General" del Dashboard).
export const MultiSegmentRing = ({
  segments,
  size = 160,
  strokeWidth = 16,
  trackClassName = "text-slate-100",
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);

  let offsetAcumulado = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        stroke="currentColor"
        className={trackClassName}
      />
      {total > 0 && segments
        .filter((s) => (s.value || 0) > 0)
        .map((s) => {
          const largo = (s.value / total) * circumference;
          const dashoffset = -offsetAcumulado;
          offsetAcumulado += largo;
          return (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              fill="none"
              stroke="currentColor"
              strokeDasharray={`${largo} ${circumference - largo}`}
              strokeDashoffset={dashoffset}
              className={`${s.className} transition-all duration-500`}
            />
          );
        })}
    </svg>
  );
};
