import { Link } from "react-router-dom";
import { FileText, UserPlus, X } from "lucide-react";
import { CLASE_BADGE, MOTIVO_EXCLUSION, formatRun, formatUsd } from "../../../utils/revisionIA";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";
import { EstimacionCosto } from "./EstimacionCosto";

const Lista = ({ titulo, vacio, children, cantidad }) => (
  <section className="space-y-1.5">
    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{titulo} ({cantidad})</h4>
    {cantidad === 0 ? <p className="text-xs text-slate-400">{vacio}</p> : <ul className="space-y-1 text-xs">{children}</ul>}
  </section>
);

// Modal de vista previa de "Validar con IA" en el Expediente: personas del expediente contra
// carpetas (calzadas, sin carpeta y carpetas sin persona), archivos que irán a la IA, excluidos con
// su motivo, costo estimado y la opción de no reenviar lo ya validado.
export const VistaPreviaValidacion = ({
  plan, expedienteId, omitirValidados, onOmitirValidados, iaDisponible, analizando, iniciando, onConfirmar, onCerrar,
}) => {
  const empresa = plan.empresas[0];
  const calzadas = empresa.entidades.filter((e) => e.personaSugerida);
  const extra = plan.expediente;
  const excluidos = {};
  empresa.archivosExcluidosIA.forEach((x) => { excluidos[x.motivo] = (excluidos[x.motivo] || 0) + 1; });
  const archivos = empresa.archivosIA;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !iniciando && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-labelledby="vista-previa-titulo"
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 id="vista-previa-titulo" className="text-sm font-bold text-carbon-dark">Vista previa de la validación</h3>
          <button type="button" onClick={onCerrar} disabled={iniciando} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <Lista titulo="Personas con carpeta" cantidad={calzadas.length} vacio="Ninguna carpeta calzó con una persona del expediente.">
            {calzadas.map((e) => (
              <li key={e.entidadClave} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-carbon-dark">{e.personaSugerida.nombre}</span>
                <span className={`${CLASE_BADGE} ${e.personaSugerida.por === "rut" ? "bg-sage-lighter text-sage-darker border-sage-light" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {e.personaSugerida.por === "rut" ? "Por RUT" : "Por nombre"}
                </span>
                <span className="text-slate-400 truncate">{e.entidadCarpeta || "(archivo en la raíz)"}</span>
              </li>
            ))}
          </Lista>

          <Lista titulo="Personas del expediente sin carpeta" cantidad={extra.personasSinCarpeta.length} vacio="Todas las personas tienen carpeta.">
            {extra.personasSinCarpeta.map((p) => (
              <li key={p.personaId} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-carbon-dark">{p.nombre}</span>
                {p.rut && <span className="text-slate-400">{formatRun(p.rut)}</span>}
                <span className={`${CLASE_BADGE} bg-slate-100 text-slate-500 border-slate-200`}>Pendiente · sin documento</span>
              </li>
            ))}
          </Lista>

          <Lista titulo="Carpetas sin persona en el expediente (no se procesan)" cantidad={extra.carpetasSinPersona.length} vacio="Todas las carpetas corresponden a personas del expediente.">
            {extra.carpetasSinPersona.map((c) => (
              <li key={c.entidadCarpeta || c.entidadNombre} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-carbon-dark">{c.entidadNombre || "—"}</span>
                <span className="text-slate-400 truncate">{c.entidadCarpeta}</span>
                <Link to={`/expedientes/${expedienteId}?tab=persona`} onClick={onCerrar} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
                  <UserPlus className="w-3 h-3" /> Agregar a la participación
                </Link>
              </li>
            ))}
          </Lista>

          <Lista titulo="Archivos que se enviarán a la IA" cantidad={archivos.length} vacio="No hay archivos que enviar.">
            {archivos.map((a) => (
              <li key={a.rutaRelativa} className="flex items-center gap-1 text-slate-600"><FileText className="w-3 h-3 text-slate-400" /> {a.rutaRelativa}</li>
            ))}
          </Lista>
          {Object.keys(excluidos).length > 0 && (
            <p className="text-[11px] text-slate-500">
              Excluidos: {Object.entries(excluidos).map(([m, n]) => `${MOTIVO_EXCLUSION[m] || m}: ${n}`).join(" · ")}
            </p>
          )}

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={omitirValidados} disabled={analizando || iniciando} onChange={(e) => onOmitirValidados(e.target.checked)} className="mt-0.5 text-primary rounded" />
            <span>
              <b>No volver a enviar documentos ya validados</b><br />
              Excluye a quienes ya tienen una evaluación vigente "Cumple" (manual o IA) no vencida.
            </span>
          </label>

          {plan.estimacion ? <EstimacionCosto estimacion={plan.estimacion} faltanPrecios={plan.faltanPrecios} /> : (
            <p className="text-xs text-slate-600">
              Costo estimado: <b>{plan.faltanPrecios ? "sin precios configurados" : formatUsd(plan.costoEstimadoUsd, 4)}</b>
            </p>
          )}
          {!iaDisponible && <p className="text-xs text-amber-700">La IA no está disponible (configuración o precios).</p>}
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" onClick={onCerrar} disabled={iniciando} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="button" onClick={onConfirmar} disabled={iniciando || analizando || !archivos.length || !iaDisponible} className={CLASE_PRIMARIO}>
            {iniciando ? "Iniciando..." : analizando ? "Actualizando..." : `Confirmar y enviar ${archivos.length} ${archivos.length === 1 ? "archivo" : "archivos"}`}
          </button>
        </div>
      </div>
    </div>
  );
};
