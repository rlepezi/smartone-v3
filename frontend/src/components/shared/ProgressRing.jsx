import React from "react";

// Anillo de progreso simple vía SVG + stroke-dasharray — no hay ninguna
// librería de gráficos en el proyecto (revisado package.json), así que
// no se agrega una nueva dependencia solo para esto.
export const ProgressRing = ({
  value,
  size = 56,
  strokeWidth = 6,
  trackClassName = "text-slate-100",
  progressClassName = "text-sage-dark",
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const valorAcotado = Math.min(Math.max(value || 0, 0), 100);
  const offset = circumference - (valorAcotado / 100) * circumference;

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
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={`${progressClassName} transition-all duration-500`}
      />
    </svg>
  );
};
