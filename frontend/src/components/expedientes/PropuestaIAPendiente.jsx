import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

const TEXTO = { cumple: "Cumple", no_cumple: "No cumple", revision_humana: "Revisión humana" };

// Propuesta de Revisiones IA aún sin resolver para un requisito: NO es una evaluación (el estado no
// cambia hasta aceptarla o corregirla). El tooltip dice por qué no se propuso "Cumple"; el enlace
// lleva a la pestaña Revisiones IA del expediente para resolverla.
export const PropuestaIAPendiente = ({ propuesta, expedienteId }) => {
  if (!propuesta) return null;
  const motivos = (propuesta.reglasPendientes || [])
    .map((r) => `${r.regla}${r.detalle ? `: ${r.detalle}` : ""}`).join("\n");
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <span
        title={motivos || undefined}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-dashed border-primary bg-primary-lighter text-primary-dark whitespace-nowrap"
      >
        <Sparkles className="w-3 h-3" aria-hidden="true" /> IA propone: {TEXTO[propuesta.propuesta] || propuesta.propuesta}
      </span>
      <Link to={`/expedientes/${expedienteId}?tab=revisiones_ia`} className="text-[10px] font-bold text-primary hover:underline">Resolver</Link>
    </span>
  );
};
