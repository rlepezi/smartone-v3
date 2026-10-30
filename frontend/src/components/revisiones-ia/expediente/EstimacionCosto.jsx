import { AlertTriangle, Calculator } from "lucide-react";
import { formatUsd } from "../../../utils/revisionIA";

const miles = (n) => Number(n || 0).toLocaleString("es-CL");

// Estimación de costo de una validación con IA: archivos y llamadas por formato, tokens supuestos,
// precio del modelo, costo total y por archivo, y gasto del mes contra el límite mensual. Es una
// estimación (tokens supuestos por formato); el costo real se suma al procesar.
export const EstimacionCosto = ({ estimacion, faltanPrecios }) => {
  if (!estimacion) return null;
  const e = estimacion;
  const formatos = [
    e.porFormato.imagen && `${e.porFormato.imagen} ${e.porFormato.imagen === 1 ? "imagen" : "imágenes"}`,
    e.porFormato.pdf && `${e.porFormato.pdf} PDF`,
    e.porFormato.docx && `${e.porFormato.docx} Word (≈${e.supuestos.imagenesPorDocx} imágenes c/u)`,
  ].filter(Boolean).join(" · ");
  return (
    <section className="rounded-xl border border-primary/20 bg-primary-lighter/40 p-4 space-y-2">
      <h4 className="flex items-center gap-2 text-xs font-bold text-carbon-dark"><Calculator className="w-4 h-4 text-primary" /> Estimación de costo</h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-slate-500">Costo estimado</dt>
        <dd className="font-black text-carbon-dark">{faltanPrecios ? "Sin precios configurados" : formatUsd(e.costoEstimadoUsd, 4)}</dd>
        <dt className="text-slate-500">Costo por archivo</dt>
        <dd className="font-semibold text-carbon-dark">{faltanPrecios ? "—" : formatUsd(e.costoPorArchivoUsd, 4)}</dd>
        <dt className="text-slate-500">Archivos</dt>
        <dd className="text-carbon-dark">{e.archivos}{formatos ? ` (${formatos})` : ""} · {e.llamadas} {e.llamadas === 1 ? "llamada" : "llamadas"} a la IA</dd>
        <dt className="text-slate-500">Tokens estimados</dt>
        <dd className="text-carbon-dark">{miles(e.tokensEntrada)} de entrada · {miles(e.tokensSalida)} de salida</dd>
        <dt className="text-slate-500">Modelo y precio</dt>
        <dd className="text-carbon-dark">
          {e.modelo || "—"}{e.precio ? ` · US$${e.precio.entrada} / US$${e.precio.salida} por millón (entrada / salida)` : ""}
        </dd>
        {e.limiteMensualUsd !== null && e.limiteMensualUsd !== undefined && (
          <>
            <dt className="text-slate-500">Gasto del mes</dt>
            <dd className="text-carbon-dark">
              {formatUsd(e.gastoMesUsd, 4)} de {formatUsd(e.limiteMensualUsd, 2)} · disponible {formatUsd(e.saldoUsd, 4)}
            </dd>
          </>
        )}
      </dl>
      {e.superaLimite && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          La estimación supera lo disponible del límite mensual: la revisión puede detenerse al alcanzarlo.
        </p>
      )}
      <p className="text-[10px] text-slate-400">
        Supuestos: {miles(e.supuestos.tokensImagen)} tokens por imagen, {miles(e.supuestos.tokensPaginaPdf)} por página de PDF y {miles(e.supuestos.tokensSalida)} de respuesta por llamada. Un archivo ya procesado antes (mismo contenido) se reutiliza sin costo.
      </p>
    </section>
  );
};
