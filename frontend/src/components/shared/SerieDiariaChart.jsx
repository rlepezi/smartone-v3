import React from "react";

const ALTO = 160;
const ANCHO = 640;
const PADDING = 24;

// Barras (accesos) + línea (minutos conectados) por día, vía SVG puro —
// no hay ninguna librería de gráficos en el proyecto (ver ProgressRing.jsx),
// así que no se agrega una nueva dependencia solo para el gráfico de
// "Resumen" del detalle de Usuario. Cada serie usa su propia escala
// (eje secundario implícito para la línea) porque accesos y minutos
// conectados no comparten magnitud.
export const SerieDiariaChart = ({ serieDiaria = [] }) => {
  if (serieDiaria.length === 0) {
    return <p className="text-xs text-slate-400 italic py-8 text-center">Sin datos en el período seleccionado.</p>;
  }

  const anchoUtil = ANCHO - PADDING * 2;
  const altoUtil = ALTO - PADDING * 2;
  const pasoX = serieDiaria.length > 1 ? anchoUtil / (serieDiaria.length - 1) : 0;
  const anchoBarra = Math.min(28, (anchoUtil / serieDiaria.length) * 0.5);

  const maxAccesos = Math.max(1, ...serieDiaria.map((d) => d.accesos || 0));
  const maxMinutos = Math.max(1, ...serieDiaria.map((d) => d.minutosConectado || 0));

  const xDe = (i) => PADDING + i * pasoX;
  const yBarra = (v) => altoUtil - (v / maxAccesos) * altoUtil + PADDING;
  const yLinea = (v) => altoUtil - (v / maxMinutos) * altoUtil + PADDING;

  const puntosLinea = serieDiaria
    .map((d, i) => `${xDe(i)},${yLinea(d.minutosConectado || 0)}`)
    .join(" ");

  const formatEtiquetaFecha = (fecha) => {
    const [, mes, dia] = (fecha || "").split("-");
    return mes && dia ? `${dia}/${mes}` : fecha;
  };

  // Se muestra como máximo ~8 etiquetas en el eje X para no saturar en
  // períodos largos (ej. 90 días) — el resto de los puntos se sigue
  // dibujando, solo se omite su etiqueta.
  const pasoEtiqueta = Math.max(1, Math.ceil(serieDiaria.length / 8));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary-light" /> Accesos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 rounded-full bg-sage-dark" /> Minutos conectado
        </span>
      </div>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-40" preserveAspectRatio="none">
        <line x1={PADDING} y1={ALTO - PADDING} x2={ANCHO - PADDING} y2={ALTO - PADDING} className="stroke-slate-200" strokeWidth="1" />
        {serieDiaria.map((d, i) => (
          <rect
            key={d.fecha}
            x={xDe(i) - anchoBarra / 2}
            y={yBarra(d.accesos || 0)}
            width={anchoBarra}
            height={Math.max(0, altoUtil + PADDING - yBarra(d.accesos || 0))}
            className="fill-primary-light"
            rx={2}
          >
            <title>{`${d.fecha}: ${d.accesos || 0} accesos`}</title>
          </rect>
        ))}
        <polyline
          points={puntosLinea}
          fill="none"
          className="stroke-sage-dark"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {serieDiaria.map((d, i) => (
          <circle key={d.fecha} cx={xDe(i)} cy={yLinea(d.minutosConectado || 0)} r="2.5" className="fill-sage-dark">
            <title>{`${d.fecha}: ${d.minutosConectado || 0} min conectado`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-semibold text-slate-400 px-1">
        {serieDiaria.map((d, i) => (
          <span key={d.fecha} className={i % pasoEtiqueta === 0 ? "" : "invisible"}>
            {formatEtiquetaFecha(d.fecha)}
          </span>
        ))}
      </div>
    </div>
  );
};
