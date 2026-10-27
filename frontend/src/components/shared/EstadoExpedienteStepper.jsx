import React from "react";
import { ESTADOS_EXPEDIENTE } from "../../services/expedienteService";
import { formatFecha } from "../../utils/fechas";

// Etapas del flujo de un Expediente (estado derivado de las Evaluaciones; ver decisions.md). Fuente
// única para las dos variantes:
//  - "compacta" (listado): las 4 primeras, con etiquetas cortas.
//  - "completa" (detalle): las 5, con etiquetas largas visibles.
// "Con Observaciones" no es una etapa aparte: es un desvío de "En Revisión" (⟲) — se pinta ámbar
// sobre esa misma etapa y su etiqueta cambia mientras dure.
const ETAPAS = [
  { corta: "Cre.", larga: "Creado" },
  { corta: "Rev.", larga: "En Revisión" },
  { corta: "Aprob.", larga: "Aprobado" },
  { corta: "Ejec.", larga: "En Ejecución" },
  { corta: "Cerr.", larga: "Cerrado" },
];

// Mapeo ÚNICO estado real -> color de cada etapa.
//  "gris": no alcanzada · "azul": alcanzada o en curso · "verde": completada · "ambar": con observaciones.
// `activa`: índice de la etapa en curso (se resalta con un anillo), o null si el flujo terminó.
const AZUL_HASTA = (n) => ETAPAS.map((_, i) => (i < n ? "azul" : "gris"));
const VERDES_HASTA = (n, resto) => ETAPAS.map((_, i) => (i < n ? "verde" : resto[i - n] || "gris"));

const CONFIG_STEPPER = {
  creado: { colores: AZUL_HASTA(1), activa: 0 },
  en_revision: { colores: AZUL_HASTA(2), activa: 1 },
  con_observaciones: { colores: ["azul", "ambar", "gris", "gris", "gris"], activa: 1 },
  aprobado: { colores: VERDES_HASTA(3, []), activa: null },
  en_ejecucion: { colores: VERDES_HASTA(3, ["azul"]), activa: 3 },
  cerrado: { colores: VERDES_HASTA(5, []), activa: null },
};

const CLASE_PUNTO = { gris: "bg-slate-200", azul: "bg-blue-500", verde: "bg-emerald-500", ambar: "bg-amber-500" };
const CLASE_ANILLO = { azul: "ring-blue-200", verde: "ring-emerald-200", gris: "ring-slate-100", ambar: "ring-amber-200" };
const CLASE_LINEA = { gris: "bg-slate-200", azul: "bg-blue-400", verde: "bg-emerald-400", ambar: "bg-amber-400" };

// Estado de un Expediente como stepper. Reusable: recibe solo el `estado` real; el texto muestra
// siempre el nombre específico del estado. `variante`: "compacta" (4 puntos) | "completa" (5 nodos
// con sus etiquetas largas). `fechas` (opcional): fecha en que se alcanzó cada etapa, por índice
// (0 = Creado … 4 = Cerrado), que se muestra en el tooltip de su punto.
export const EstadoExpedienteStepper = ({ estado, variante = "compacta", fechas = [] }) => {
  const config = CONFIG_STEPPER[estado] || CONFIG_STEPPER.creado;
  const completa = variante === "completa";
  const cantidad = completa ? ETAPAS.length : 4;
  const nombre = ESTADOS_EXPEDIENTE.find((e) => e.value === estado)?.label || estado;
  const punto = completa ? "w-3.5 h-3.5" : "w-2.5 h-2.5";
  // Con Observaciones se muestra sobre la etapa "En Revisión" (desvío ⟲), con su propio nombre.
  const etiquetaLarga = (etapa, i) => (estado === "con_observaciones" && i === 1 ? "Con observaciones" : etapa.larga);
  const tooltip = (etapa, i) => (fechas[i] ? `${etiquetaLarga(etapa, i)} · ${formatFecha(fechas[i])}` : etiquetaLarga(etapa, i));

  // Variante completa: una columna por etapa (punto centrado sobre su etiqueta larga).
  if (completa) {
    return (
      <div className="grid grid-cols-5 w-full">
        {ETAPAS.map((etapa, i) => {
          const color = config.colores[i];
          return (
            <div key={etapa.corta} className="flex flex-col items-center gap-2 min-w-0">
              <div className="flex items-center w-full">
                <span className={`flex-1 h-0.5 ${i > 0 ? CLASE_LINEA[color] : "bg-transparent"}`} />
                <span
                  className={`${punto} rounded-full shrink-0 ${CLASE_PUNTO[color]} ${config.activa === i ? `ring-4 ${CLASE_ANILLO[color]}` : ""}`}
                  title={tooltip(etapa, i)}
                />
                <span className={`flex-1 h-0.5 ${i < ETAPAS.length - 1 ? CLASE_LINEA[config.colores[i + 1]] : "bg-transparent"}`} />
              </div>
              <span
                title={tooltip(etapa, i)}
                className={`text-[11px] font-semibold text-center leading-tight px-1 ${color === "ambar" ? "text-amber-700" : "text-slate-500"}`}
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
    <div className={completa ? "w-full space-y-2" : "inline-flex flex-col gap-1.5 min-w-[9.5rem]"}>
      {!completa && <span className="text-xs font-bold text-carbon-dark whitespace-nowrap">{nombre}</span>}
      <div className="flex items-center">
        {ETAPAS.slice(0, cantidad).map((etapa, i) => {
          const color = config.colores[i];
          return (
            <React.Fragment key={etapa.corta}>
              {i > 0 && <span className={`flex-1 h-0.5 ${CLASE_LINEA[color]}`} />}
              <span
                className={`${punto} rounded-full shrink-0 ${CLASE_PUNTO[color]} ${config.activa === i ? `ring-4 ${CLASE_ANILLO[color]}` : ""}`}
                title={etiquetaLarga(etapa, i)}
              />
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex justify-between text-slate-400 leading-none gap-1">
        {ETAPAS.slice(0, cantidad).map((etapa, i) => (
          <span key={etapa.corta} className={completa ? "text-[11px] font-semibold text-center flex-1" : "text-[9px] font-semibold"}>
            {completa ? etiquetaLarga(etapa, i) : etapa.corta}
          </span>
        ))}
      </div>
    </div>
  );
};
