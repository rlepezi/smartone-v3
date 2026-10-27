import { Bot, Repeat, UserRound } from "lucide-react";
import { formatFechaHora } from "../../utils/fechas";

const ORIGEN = {
  ia_asistida: { Icono: Bot, texto: "Validado con IA (Revisiones IA)", clase: "text-primary" },
  reutilizada: { Icono: Repeat, texto: "Reutilizada de otro expediente", clase: "text-slate-400" },
  manual: { Icono: UserRound, texto: "Evaluación manual", clase: "text-slate-400" },
};

// Ícono pequeño con el origen de la evaluación vigente (IA, manual o reutilizada); el tooltip dice
// quién la registró y cuándo.
export const OrigenEvaluacion = ({ evaluacion }) => {
  if (!evaluacion || evaluacion.resultado === "pendiente") return null;
  const base = ORIGEN[evaluacion.modalidad] || ORIGEN.manual;
  // "Revisar con IA" por requerimiento: el evaluador confirmó la propuesta de las reglas IA.
  const origen = evaluacion.revisionIAId ? { ...base, texto: "Propuesta IA (reglas del requerimiento) confirmada por el evaluador" } : base;
  const titulo = `${origen.texto} · ${evaluacion.evaluadorNombre || "—"} · ${formatFechaHora(evaluacion.createdAt)}`;
  return (
    <span title={titulo} className={`shrink-0 ${origen.clase}`}>
      <origen.Icono className="w-3.5 h-3.5" aria-label={titulo} />
    </span>
  );
};
