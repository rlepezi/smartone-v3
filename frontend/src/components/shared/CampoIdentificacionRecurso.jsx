import { OpcionesRadio } from "./OpcionesRadio";
import { OPCIONES_IDENTIFICACION } from "../../utils/identificacionRecurso";

const CLASE_BASE = "block px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed";
// Patente: blanca con borde negro, como las placas chilenas, del ancho de sus 6 caracteres.
const LARGO_PATENTE = 6;
const CLASE_PATENTE = "w-40 rounded-none bg-white border border-black text-black font-mono font-bold text-base tracking-[0.3em] text-center focus:border-black";
const CLASE_SERIE = "w-full rounded-xl bg-gray-50/50 border focus:border-primary";

// Identificación de una Maquinaria: radio Patente / N° de serie y el campo, en mayúsculas. Con
// "Patente" el campo se ve como una placa chilena. `tipo` null (maquinarias anteriores): ningún
// radio marcado hasta que se elija.
export const CampoIdentificacionRecurso = ({
  tipo, valor, onCambiarTipo, onCambiarValor, error, disabled = false, inputRef, nombre = "tipoIdentificacion",
}) => (
  <div>
    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Identificación *</label>
    <OpcionesRadio
      compacto
      name={nombre}
      value={tipo || ""}
      onChange={(e) => onCambiarTipo(e.target.value)}
      opciones={OPCIONES_IDENTIFICACION}
      disabled={disabled}
      ariaLabel="Tipo de identificación"
    />
    <input
      ref={inputRef}
      type="text"
      name="patente"
      value={valor}
      onChange={(e) => {
        const texto = e.target.value.toLocaleUpperCase("es-CL");
        // Patente: solo letras y números (sin guiones ni espacios), hasta 6.
        onCambiarValor(tipo === "patente" ? texto.replace(/[^A-Z0-9]/g, "").slice(0, LARGO_PATENTE) : texto);
      }}
      disabled={disabled}
      maxLength={tipo === "patente" ? LARGO_PATENTE : 60}
      placeholder={tipo === "patente" ? "BBCC12" : tipo === "serie" ? "Ej: CAT320-88812" : "Elija el tipo de identificación"}
      aria-invalid={Boolean(error)}
      className={`mt-2 ${CLASE_BASE} ${tipo === "patente" ? CLASE_PATENTE : CLASE_SERIE} ${
        error ? "border-red-400" : tipo === "patente" ? "" : "border-gray-200"
      }`}
    />
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);
