import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { formatFecha, parseFechaDMA, hoyISO } from "../../utils/fechas";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]; // semana desde el lunes
const ANCHO_CALENDARIO = 280;
const ALTO_CALENDARIO = 340;

const dos = (n) => String(n).padStart(2, "0");

// Las clases de ancho y margen del campo van al contenedor (para que el botón del calendario
// quede dentro del campo); el resto, al campo de texto.
const RE_CLASE_CONTENEDOR = /^(?:[a-z]+:)*(?:w-|max-w-|min-w-|flex-1|grow|shrink|m[trblxy]?-|col-span-)/;
const repartirClases = (className) => {
  const todas = String(className || "").split(/\s+/).filter(Boolean);
  return {
    // Sin ancho propio (campos compactos en tablas): un ancho fijo suficiente para dd/mm/aaaa.
    contenedor: todas.some((c) => /^(?:[a-z]+:)*(?:w-|flex-1)/.test(c))
      ? todas.filter((c) => RE_CLASE_CONTENEDOR.test(c)).join(" ")
      : `inline-block w-40 ${todas.filter((c) => RE_CLASE_CONTENEDOR.test(c)).join(" ")}`,
    campo: todas.filter((c) => !RE_CLASE_CONTENEDOR.test(c)).join(" "),
  };
};
const aTexto = (iso) => (iso ? formatFecha(iso) : "");

// Máscara dd/mm/aaaa: deja solo números e inserta las barras. Un "aaaa-mm-dd" pegado se convierte.
const enmascarar = (crudo) => {
  const limpio = String(crudo || "").trim();
  const iso = limpio.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const digitos = limpio.replace(/\D/g, "").slice(0, 8);
  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join("/");
};

// Motivo por el que un texto no es una fecha aceptable, o null si lo es (o está vacío).
const errorDe = (texto, min, max) => {
  if (!texto) return null;
  if (texto.length < 10) return "Fecha incompleta (dd/mm/aaaa).";
  const iso = parseFechaDMA(texto);
  if (!iso) return "La fecha no existe.";
  if (min && iso < min) return `Debe ser desde el ${formatFecha(min)}.`;
  if (max && iso > max) return `Debe ser hasta el ${formatFecha(max)}.`;
  return null;
};

// Calendario mensual en español (semana desde el lunes), con navegación por mes y año y "Hoy".
const Calendario = ({ valor, min, max, onElegir }) => {
  const hoy = hoyISO();
  const base = valor || hoy;
  const [vista, setVista] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) });

  const mover = (meses) => setVista(({ y, m }) => {
    const total = y * 12 + (m - 1) + meses;
    return { y: Math.floor(total / 12), m: (total % 12) + 1 };
  });

  const diasDelMes = new Date(Date.UTC(vista.y, vista.m, 0)).getUTCDate();
  // 0 = lunes … 6 = domingo, del día 1.
  const desfase = (new Date(Date.UTC(vista.y, vista.m - 1, 1)).getUTCDay() + 6) % 7;
  const celdas = [...Array(desfase).fill(null), ...Array.from({ length: diasDelMes }, (_, i) => i + 1)];
  const claseNav = "p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="p-3 space-y-2" style={{ width: ANCHO_CALENDARIO }}>
      <div className="flex items-center justify-between gap-1">
        <button type="button" onClick={() => mover(-12)} aria-label="Año anterior" title="Año anterior" className={claseNav}>
          <ChevronLeft className="w-3.5 h-3.5 -mr-2 inline" /><ChevronLeft className="w-3.5 h-3.5 inline" />
        </button>
        <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior" title="Mes anterior" className={claseNav}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="flex-1 text-center text-xs font-bold text-carbon-dark" aria-live="polite">
          {MESES[vista.m - 1]} {vista.y}
        </span>
        <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente" title="Mes siguiente" className={claseNav}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button type="button" onClick={() => mover(12)} aria-label="Año siguiente" title="Año siguiente" className={claseNav}>
          <ChevronRight className="w-3.5 h-3.5 inline" /><ChevronRight className="w-3.5 h-3.5 -ml-2 inline" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS.map((d) => (
          <span key={d} className="py-1 text-[10px] font-bold text-slate-400 uppercase">{d}</span>
        ))}
        {celdas.map((dia, i) => {
          if (dia === null) return <span key={`v${i}`} />;
          const iso = `${vista.y}-${dos(vista.m)}-${dos(dia)}`;
          const fuera = (min && iso < min) || (max && iso > max);
          const elegido = iso === valor;
          return (
            <button
              key={iso}
              type="button"
              disabled={fuera}
              aria-pressed={elegido}
              aria-label={formatFecha(iso)}
              onClick={() => onElegir(iso)}
              className={`h-8 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:text-slate-300 disabled:cursor-not-allowed ${
                elegido ? "bg-primary text-white"
                  : iso === hoy ? "border border-primary/50 text-primary-dark hover:bg-primary-lighter"
                    : "text-carbon-dark hover:bg-slate-100"
              }`}
            >
              {dia}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end pt-1 border-t border-slate-100">
        <button
          type="button"
          disabled={(min && hoy < min) || (max && hoy > max)}
          onClick={() => onElegir(hoy)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-primary-lighter disabled:text-slate-300 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Hoy
        </button>
      </div>
    </div>
  );
};

// Campo de fecha de toda la aplicación: se escribe y se muestra como dd/mm/aaaa, sin depender del
// idioma del navegador (reemplaza a <input type="date">). Campo de texto con máscara + botón que
// abre un calendario en español.
// API de input controlado: `value` y `onChange` trabajan en "aaaa-mm-dd" ("" si está vacío), así
// los formularios y los payloads no cambian. `onChange` recibe un evento con `target.name` y
// `target.value`, igual que un input. Mientras lo escrito no es una fecha completa y válida (y
// dentro de `min`/`max`) el valor es "".
// `className` es la clase del campo de texto (la misma que tenía el input que reemplaza).
export const DateInput = ({
  value = "", onChange, name, id, disabled = false, required = false, min, max,
  placeholder = "dd/mm/aaaa", className = "", "aria-invalid": ariaInvalid, "aria-label": ariaLabel,
  ...resto
}) => {
  const idError = useId();
  const [texto, setTexto] = useState(() => aTexto(value));
  const [ultimoValor, setUltimoValor] = useState(value);
  const [tocado, setTocado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState(null);
  const contenedorRef = useRef(null);
  const calendarioRef = useRef(null);
  const botonRef = useRef(null);

  // El valor cambió desde afuera (carga del registro, reinicio del formulario): se refleja en el
  // texto, salvo que sea el "" que este mismo campo avisó mientras se escribe una fecha incompleta.
  if (value !== ultimoValor) {
    setUltimoValor(value);
    if (value !== (parseFechaDMA(texto) || "")) setTexto(aTexto(value));
  }

  const avisar = (iso) => onChange?.({ target: { name, value: iso, id } });

  const escribir = (crudo) => {
    const nuevo = enmascarar(crudo);
    setTexto(nuevo);
    avisar(errorDe(nuevo, min, max) ? "" : (parseFechaDMA(nuevo) || ""));
  };

  const elegir = (iso) => {
    setTexto(aTexto(iso));
    setTocado(true);
    setAbierto(false);
    avisar(iso);
    botonRef.current?.focus();
  };

  const abrir = () => {
    const r = contenedorRef.current.getBoundingClientRect();
    const haciaArriba = r.bottom + ALTO_CALENDARIO > window.innerHeight && r.top > ALTO_CALENDARIO;
    setPosicion({
      top: haciaArriba ? r.top - ALTO_CALENDARIO - 4 : r.bottom + 4,
      left: Math.max(8, Math.min(r.left, window.innerWidth - ANCHO_CALENDARIO - 8)),
    });
    setAbierto(true);
  };

  // Cierra con Escape, con un clic fuera o al desplazar o redimensionar la página.
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = () => setAbierto(false);
    const alClic = (e) => {
      if (contenedorRef.current?.contains(e.target) || calendarioRef.current?.contains(e.target)) return;
      cerrar();
    };
    const alTecla = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cerrar();
      botonRef.current?.focus();
    };
    const alDesplazar = (e) => { if (!calendarioRef.current?.contains(e.target)) cerrar(); };
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTecla, true);
    window.addEventListener("scroll", alDesplazar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTecla, true);
      window.removeEventListener("scroll", alDesplazar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  const clases = repartirClases(className);
  const error = tocado ? errorDe(texto, min, max) : null;
  const invalido = Boolean(error) || ariaInvalid === true || ariaInvalid === "true";

  return (
    <div ref={contenedorRef} className={`relative ${clases.contenedor}`}>
      <input
        {...resto}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={id}
        name={name}
        value={texto}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        maxLength={10}
        aria-label={ariaLabel}
        aria-invalid={invalido || undefined}
        aria-describedby={error ? idError : undefined}
        onChange={(e) => escribir(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          escribir(e.clipboardData.getData("text"));
        }}
        onBlur={() => setTocado(true)}
        onKeyDown={(e) => {
          // Enter confirma lo escrito (marca el error si está incompleto) sin abrir el calendario.
          if (e.key === "Enter") setTocado(true);
        }}
        className={`w-full ${clases.campo} pr-9 ${error ? "border-red-400 bg-red-50/30" : ""}`}
      />
      <button
        ref={botonRef}
        type="button"
        disabled={disabled}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-label="Abrir calendario"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Calendar className="w-4 h-4" />
      </button>
      {error && <p id={idError} className="text-xs text-red-500 mt-1">{error}</p>}

      {abierto && posicion && createPortal(
        <div
          ref={calendarioRef}
          role="dialog"
          aria-label="Elegir fecha"
          className="fixed z-[70] bg-white rounded-2xl border border-slate-200 shadow-dropdown"
          style={{ top: posicion.top, left: posicion.left }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Calendario
            valor={parseFechaDMA(texto) || ""}
            min={min}
            max={max}
            onElegir={elegir}
          />
        </div>,
        document.body,
      )}
    </div>
  );
};
