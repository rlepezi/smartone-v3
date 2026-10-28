import { nivelAcreditacion, textoPorcentaje } from "../../utils/cumplimientoCalculos";

// % de cumplimiento con el color y la etiqueta de su nivel de acreditación (Acreditada, Aceptable,
// Rechazada). Sin nada evaluable muestra "— Sin requisitos" en gris. `sinEtiqueta`: solo el %, con el color del nivel.
// `umbrales`: los del Mandante (`umbralesAcreditacion`); sin ellos rigen los de defecto.
export const BadgeAcreditacion = ({ pct, sinEtiqueta = false, umbrales = null }) => {
  const nivel = nivelAcreditacion(pct, umbrales);
  return (
    <span
      title={nivel.etiqueta ? `Cumplimiento: ${nivel.etiqueta}` : "Sin requisitos evaluables"}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-black whitespace-nowrap border ${nivel.caja} ${nivel.texto}`}
    >
      {textoPorcentaje(pct)}
      {!sinEtiqueta && <span className="font-bold">{nivel.etiqueta || "Sin requisitos"}</span>}
    </span>
  );
};
