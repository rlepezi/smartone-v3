// Campo de formulario con exactamente 2 opciones: radio buttons en línea (con 3 o más se usa un
// select). Reemplaza al <select> sin cambiar el contrato: `onChange` recibe el evento nativo del
// radio, con `target.name` = name y `target.value` = el valor de la opción, así que sirve el mismo
// handleChange del formulario. `name` debe ser único dentro de la página (agrupa los radios).
// No se usa en los filtros de los listados.
export const OpcionesRadio = ({
  name, value, onChange, opciones, disabled = false, ariaLabel, compacto = false,
}) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 ${compacto ? "" : "min-h-[42px]"}`}
  >
    {opciones.map((o) => (
      <label
        key={o.value}
        className={`inline-flex items-center gap-2 ${compacto ? "text-xs" : "text-sm"} ${
          disabled ? "text-gray-400 cursor-not-allowed" : "text-gray-700 cursor-pointer"
        }`}
      >
        <input
          type="radio"
          name={name}
          value={o.value}
          checked={value === o.value}
          onChange={onChange}
          disabled={disabled}
          className="w-4 h-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
        />
        {o.label}
      </label>
    ))}
  </div>
);
