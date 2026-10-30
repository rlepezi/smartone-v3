import { esPatenteChilena } from "../../utils/identificacionRecurso";

// Identificación de una Maquinaria para mostrar. Una patente se ve como placa chilena: fondo blanco,
// borde negro de una línea, letras negras. Es patente si así se registró o, en las maquinarias
// anteriores sin tipo, si el valor tiene formato de placa chilena. Un N° de serie se muestra como
// texto monoespaciado.
const esPatente = (valor, tipo) => tipo === "patente" || (!tipo && esPatenteChilena(valor));

export const PatenteChip = ({ valor, tipo = null, className = "" }) => {
  if (!valor) return null;
  if (esPatente(valor, tipo)) {
    return (
      <span
        title="Patente"
        className={`inline-block px-1.5 py-px bg-white border border-black text-black font-mono font-bold text-[11px] leading-tight tracking-[0.15em] whitespace-nowrap ${className}`}
      >
        {valor}
      </span>
    );
  }
  return (
    <span className={`font-mono ${className}`} title={tipo === "serie" ? "N° de serie / código interno" : "Identificación"}>
      {tipo === "serie" && <span className="font-sans text-slate-400 mr-1">N° serie</span>}
      {valor}
    </span>
  );
};
