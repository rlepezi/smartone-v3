import { useState } from "react";
import { Cloud, FolderOpen, KeyRound, X } from "lucide-react";
import { SelectorCarpeta } from "../expedientes/documentacion/SelectorCarpeta";

const BOTON = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50";

// Bloque "Carpeta de la empresa" (opcional, al inicio de Nueva Empresa; solo superadmin). Con fuente
// local autorizada: "Vincular carpeta" abre SelectorCarpeta en la raíz, solo primer nivel, con las
// carpetas sin registrar destacadas y las registradas a otra empresa deshabilitadas. Con SharePoint,
// aviso; sin fuente, no se muestra.
export const BloqueCarpetaEmpresa = ({ fuenteNE, ruta, onElegir, onQuitar, compacto = false }) => {
  const [eligiendo, setEligiendo] = useState(false);
  const { fuente, base, autorizada, registradas } = fuenteNE;
  if (!fuente) return null;
  const marco = compacto ? "p-3 rounded-xl border border-slate-200 bg-white space-y-2" : "p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2";
  const titulo = (
    <p className="flex items-center gap-2 text-xs font-bold text-carbon-dark">
      <FolderOpen className="w-4 h-4 text-primary" /> Carpeta de la empresa <span className="font-normal text-slate-400">(opcional)</span>
    </p>
  );
  if (fuente.tipo === "sharepoint") {
    return <div className={marco}>{titulo}<p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Cloud className="w-3.5 h-3.5" /> Disponible cuando se conecte Microsoft Graph.</p></div>;
  }
  if (!autorizada) {
    return (
      <div className={marco}>
        {titulo}
        <p className="text-[11px] text-slate-500">La fuente «{fuente.etiqueta}» no está autorizada en este navegador.</p>
        <button type="button" onClick={base.handle && base.coincideFuente ? base.autorizar : base.autorizarFuente} disabled={!base.soportado}
          className={`${BOTON} border border-slate-200 bg-white text-carbon-dark hover:bg-slate-50`}>
          <KeyRound className="w-3.5 h-3.5" /> Autorizar «{fuente.etiqueta}»
        </button>
      </div>
    );
  }
  const porRuta = new Map(registradas.map((c) => [c.ruta.toLowerCase(), c]));
  const estadoCarpeta = (c) => {
    const r = porRuta.get(c.nombre.toLowerCase());
    return r ? { texto: `Registrada a ${r.empresaNombre || "otra empresa"}`, deshabilitada: true } : { texto: "Sin registrar", destacada: true };
  };
  return (
    <div className={marco}>
      {titulo}
      {ruta ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-carbon-dark mr-auto truncate" title={ruta}>{ruta}</span>
          <button type="button" onClick={() => setEligiendo(true)} className="font-bold text-primary hover:underline">Cambiar</button>
          <button type="button" onClick={onQuitar} className="inline-flex items-center gap-1 font-bold text-slate-500 hover:underline"><X className="w-3 h-3" /> Quitar</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setEligiendo(true)} className={`${BOTON} bg-primary text-white hover:bg-primary-dark`}>
            <FolderOpen className="w-3.5 h-3.5" /> Vincular carpeta
          </button>
          <span className="text-[11px] text-slate-500">Propone los datos desde la carpeta y sus documentos, y la deja registrada a la empresa.</span>
        </div>
      )}
      {eligiendo && (
        <SelectorCarpeta
          handle={base.handle}
          titulo={`Carpeta de la empresa en «${fuente.etiqueta}»`}
          soloPrimerNivel
          estadoCarpeta={estadoCarpeta}
          onElegir={(r) => { setEligiendo(false); onElegir(r); }}
          onCerrar={() => setEligiendo(false)}
        />
      )}
    </div>
  );
};
