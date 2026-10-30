import React from "react";
import { ESTADOS_EXPEDIENTE } from "../../services/expedienteService";
import { formatFecha } from "../../utils/fechas";

// Etapas del flujo de un Expediente: Creado → En ejecución → Completado (avance de la evaluación,
// calculado por el backend). "Completado con pendientes" no es una etapa aparte: es Completado en
// amarillo. "Cerrado" se agrega al final solo si el Expediente está cerrado.
//  - "compacta" (listado): puntos con etiquetas cortas y el nombre del estado arriba.
//  - "completa" (detalle): una columna por etapa con su etiqueta larga.
const ETAPAS = [
  { corta: "Cre.", larga: "Creado" },
  { corta: "Ejec.", larga: "En ejecución" },
  { corta: "Compl.", larga: "Completado" },
];
const ETAPA_CERRADO = { corta: "Cerr.", larga: "Cerrado" };

// Estado -> color de cada etapa. "gris": no alcanzada · "azul": en curso · "verde": completada ·
// "ambar": completado con pendientes. `activa`: etapa resaltada con un anillo (o null).
const CONFIG_STEPPER = {
  creado: { colores: ["azul", "gris", "gris"], activa: 0 },
  en_ejecucion: { colores: ["azul", "azul", "gris"], activa: 1 },
  completado: { colores: ["verde", "verde", "verde"], activa: 2 },
  completado_pendientes: { colores: ["verde", "verde", "ambar"], activa: 2 },
  cerrado: { colores: ["verde", "verde", "verde", "gris"], activa: 3 },
};

const CLASE_PUNTO = { gris: "bg-slate-200", azul: "bg-blue-500", verde: "bg-emerald-500", ambar: "bg-amber-500" };
const CLASE_ANILLO = { azul: "ring-blue-200", verde: "ring-emerald-200", gris: "ring-slate-200", ambar: "ring-amber-200" };
const CLASE_LINEA = { gris: "bg-slate-200", azul: "bg-blue-400", verde: "bg-emerald-400", ambar: "bg-amber-400" };

// `estado`: el que se muestra (ver estadoVisibleExpediente). `fechas` (opcional): fecha en que se
// alcanzó cada etapa, por índice (0 Creado, 1 En ejecución, 2 Completado, 3 Cerrado), en el tooltip.
export const EstadoExpedienteStepper = ({ estado, variante = "compacta", fechas = [] }) => {
  const config = CONFIG_STEPPER[estado] || CONFIG_STEPPER.creado;
  const etapas = estado === "cerrado" ? [...ETAPAS, ETAPA_CERRADO] : ETAPAS;
  const completa = variante === "completa";
  const nombre = ESTADOS_EXPEDIENTE.find((e) => e.value === estado)?.label || estado;
  const punto = completa ? "w-3.5 h-3.5" : "w-2.5 h-2.5";
  const etiquetaLarga = (etapa, i) => (estado === "completado_pendientes" && i === 2 ? "Completado con pendientes" : etapa.larga);
  const tooltip = (etapa, i) => (fechas[i] ? `${etiquetaLarga(etapa, i)} · ${formatFecha(fechas[i])}` : etiquetaLarga(etapa, i));
  const anillo = (i, color) => (config.activa === i ? `ring-4 ${CLASE_ANILLO[color]}` : "");

  if (completa) {
    return (
      <div className="grid w-full" style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}>
        {etapas.map((etapa, i) => {
          const color = config.colores[i];
          return (
            <div key={etapa.corta} className="flex flex-col items-center gap-2 min-w-0">
              <div className="flex items-center w-full">
                <span className={`flex-1 h-0.5 ${i > 0 ? CLASE_LINEA[color] : "bg-transparent"}`} />
                <span className={`${punto} rounded-full shrink-0 ${CLASE_PUNTO[color]} ${anillo(i, color)}`} title={tooltip(etapa, i)} />
                <span className={`flex-1 h-0.5 ${i < etapas.length - 1 ? CLASE_LINEA[config.colores[i + 1]] : "bg-transparent"}`} />
              </div>
              <span
                title={tooltip(etapa, i)}
                className={`text-[11px] font-semibold text-center leading-tight px-1 ${
                  color === "ambar" ? "text-amber-700" : config.activa === i && color === "verde" ? "text-emerald-700" : "text-slate-500"
                }`}
              >
                {etiquetaLarga(etapa, i)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1.5 min-w-[9.5rem]">
      <span className={`text-xs font-bold whitespace-nowrap ${estado === "completado_pendientes" ? "text-amber-700" : "text-carbon-dark"}`}>{nombre}</span>
      <div className="flex items-center">
        {etapas.map((etapa, i) => {
          const color = config.colores[i];
          return (
            <React.Fragment key={etapa.corta}>
              {i > 0 && <span className={`flex-1 h-0.5 ${CLASE_LINEA[color]}`} />}
              <span className={`${punto} rounded-full shrink-0 ${CLASE_PUNTO[color]} ${anillo(i, color)}`} title={etiquetaLarga(etapa, i)} />
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex justify-between text-slate-400 leading-none gap-1">
        {etapas.map((etapa) => (
          <span key={etapa.corta} className="text-[9px] font-semibold">{etapa.corta}</span>
        ))}
      </div>
    </div>
  );
};
