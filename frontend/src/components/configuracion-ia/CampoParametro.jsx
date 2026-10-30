import { CLASE_INPUT, CLASE_LABEL } from "./estilos";

// Un parámetro de una verificación, según su esquema: número, opción, clave de campo o lista
// (textos separados por coma; el backend los guarda en mayúsculas). Lo usan la biblioteca de reglas
// y la pestaña "Reglas IA" del requerimiento. `porDefecto`: valor de la regla, mostrado como ayuda.
export const CampoParametro = ({ nombre, esquema, valor, onChange, porDefecto, idPrefijo = "param" }) => {
  const id = `${idPrefijo}-${nombre}`;
  const base = porDefecto ?? esquema.default;
  return (
    <label htmlFor={id} className="block">
      <span className={CLASE_LABEL}>{esquema.etiqueta}{esquema.requerido ? " *" : ""}</span>
      {esquema.tipo === "opcion" ? (
        <select id={id} value={valor ?? base ?? ""} onChange={(e) => onChange(e.target.value)} className={CLASE_INPUT}>
          {esquema.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
        </select>
      ) : esquema.tipo === "numero" ? (
        <input id={id} type="number" min={esquema.min} max={esquema.max} value={valor ?? base ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className={CLASE_INPUT} />
      ) : esquema.tipo === "lista" ? (
        <input id={id} type="text" value={Array.isArray(valor) ? valor.join(", ") : (valor ?? (Array.isArray(base) ? base.join(", ") : ""))}
          placeholder="Separadas por coma, p. ej. B, D" onChange={(e) => onChange(e.target.value)} className={CLASE_INPUT} />
      ) : (
        <input id={id} type="text" value={valor ?? base ?? ""} placeholder="clave del campo, p. ej. folio" onChange={(e) => onChange(e.target.value)} className={CLASE_INPUT} />
      )}
      {base !== null && base !== undefined && base !== "" && (
        <span className="text-[11px] text-slate-400">Por defecto: {Array.isArray(base) ? base.join(", ") : String(base)}</span>
      )}
    </label>
  );
};
