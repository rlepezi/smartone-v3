import { useState } from "react";
import { X } from "lucide-react";

// Lista de palabras editable como chips: Enter o coma agregan; la × quita.
export const ChipsInput = ({ valores, onChange, placeholder, ariaLabel, clase = "bg-primary-lighter text-primary-dark" }) => {
  const [texto, setTexto] = useState("");
  const agregar = () => {
    const nuevos = texto.split(",").map((v) => v.trim()).filter(Boolean)
      .filter((v) => !valores.some((x) => x.toLowerCase() === v.toLowerCase()));
    if (nuevos.length) onChange([...valores, ...nuevos]);
    setTexto("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-1.5 min-h-10 bg-slate-50/50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
      {valores.map((v) => (
        <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${clase}`}>
          {v}
          <button type="button" onClick={() => onChange(valores.filter((x) => x !== v))} aria-label={`Quitar ${v}`} className="opacity-60 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={texto}
        aria-label={ariaLabel}
        placeholder={valores.length ? "" : placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); agregar(); }
          if (e.key === "Backspace" && !texto && valores.length) onChange(valores.slice(0, -1));
        }}
        onBlur={agregar}
        className="flex-1 min-w-24 bg-transparent text-xs px-1 py-1 focus:outline-none"
      />
    </div>
  );
};
