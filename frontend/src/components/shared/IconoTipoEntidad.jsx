import { ICONO_TIPO_ENTIDAD } from "../../utils/iconosEntidad";

// Ícono que identifica si un requerimiento es de Empresa, Persona o Maquinaria (con su nombre como
// tooltip). `tipo`: empresa | persona | recurso | maquinaria.
export const IconoTipoEntidad = ({ tipo, className = "w-3.5 h-3.5 shrink-0 text-slate-400" }) => {
  const dato = ICONO_TIPO_ENTIDAD[tipo];
  if (!dato) return null;
  const { Icono, label } = dato;
  return (
    <span title={label} className="inline-flex">
      <Icono className={className} aria-label={label} />
    </span>
  );
};
