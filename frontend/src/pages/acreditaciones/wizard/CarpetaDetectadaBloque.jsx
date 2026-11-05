import { useState } from "react";
import { KeyRound } from "lucide-react";
import { SelectorCarpeta } from "../../../components/expedientes/documentacion/SelectorCarpeta";

const BOTON = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap";
const ELEGIR = { persona: "📁 Elegir carpeta del personal", recurso: "📁 Elegir carpeta de maquinarias" };

// Control de carpeta para el encabezado de la pestaña: "📁 <ruta> · Cambiar", "Elegir carpeta…" o
// "Re-autorizar". Nada si no hay carpeta local vinculada.
// `onElegirListado(rutaArchivo)`: planilla de la carpeta elegida como listado (personal o vehículos).
export const CarpetaCabecera = ({ tipo, carpeta, ruta, onElegirRuta, onElegirListado = null }) => {
  const [eligiendo, setEligiendo] = useState(false);
  if (!carpeta) return null;
  if (!carpeta.lista) {
    return carpeta.handle && carpeta.permiso !== "granted" ? (
      <button type="button" onClick={carpeta.reautorizar} className={BOTON}><KeyRound className="w-3 h-3" /> Re-autorizar</button>
    ) : null;
  }
  return (
    <>
      {!ruta ? (
        <button type="button" onClick={() => setEligiendo(true)} className={BOTON}>{ELEGIR[tipo]}</button>
      ) : (
        <span className="min-w-0 max-w-[22rem] truncate text-[11px] text-slate-600" title={ruta}>
          📁 <b className="text-carbon-dark">{ruta}</b> · <button type="button" onClick={() => setEligiendo(true)} className="font-bold text-primary hover:underline">Cambiar</button>
        </span>
      )}
      {eligiendo && (
        <SelectorCarpeta
          handle={carpeta.handle}
          tipo={tipo}
          rutaInicial={ruta ? ruta.split("/").slice(0, -1).join("/") : ""}
          titulo={tipo === "persona" ? "Carpeta del personal" : "Carpeta de maquinarias"}
          onElegir={(r) => { setEligiendo(false); onElegirRuta(r); }}
          onElegirListado={onElegirListado}
          onCerrar={() => setEligiendo(false)}
        />
      )}
    </>
  );
};
