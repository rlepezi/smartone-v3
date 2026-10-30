import { useState } from "react";
import { FileText, X } from "lucide-react";
import { revisionIAService } from "../../../services/revisionIAService";
import { ConfirmacionModal } from "../../shared/ConfirmacionModal";
import { CorregirResultadoModal } from "../CorregirResultadoModal";
import {
  CLASE_BADGE, ESTADO_CELDA, ESTADO_ENLACE, MODALIDAD_EVALUACION, PROPUESTA, RESULTADO_REGLA, RESULTADO_TEXTO, formatRun,
} from "../../../utils/revisionIA";
import { formatFecha, formatFechaHora } from "../../../utils/fechas";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO, NIVEL_TEXTO } from "./estilos";

// Datos extraídos que se muestran (fechas en dd/mm/aaaa).
const camposExtraidos = (d) => {
  if (!d) return [];
  const doc = d.cedula || d.licencia || {};
  return [
    ["RUN", d.run ? formatRun(d.run) : null],
    ["Nombres", d.nombres],
    ["Apellidos", d.apellidos],
    ["Fecha de nacimiento", d.fechaNacimiento ? formatFecha(d.fechaNacimiento) : null],
    ["Fecha de emisión", doc.fechaEmision ? formatFecha(doc.fechaEmision) : null],
    ["Fecha de vencimiento", doc.fechaVencimiento ? formatFecha(doc.fechaVencimiento) : null],
    ["N° de documento", doc.numeroDocumento],
    ["Próximo control", doc.fechaProximoControl ? formatFecha(doc.fechaProximoControl) : null],
    ["Clases", Array.isArray(doc.clases) ? doc.clases.join(", ") : null],
  ].filter(([, v]) => v);
};

const Seccion = ({ titulo, children }) => (
  <section className="space-y-1.5">
    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{titulo}</h4>
    {children}
  </section>
);

// Panel lateral de una celda de la matriz: estado, propuesta de la IA (datos extraídos, reglas y
// archivos de origen) e historial de evaluaciones (vigente e históricas). Aceptar / Corregir crean
// una nueva evaluación "ia_asistida" solo en este expediente (la vigente pasa a histórica);
// Descartar cierra la propuesta. Sobre una evaluación manual vigente (Discrepancia) se pide
// confirmación explícita: la IA nunca la reemplaza sola.
export const PanelCelda = ({ fila, columna, celda, expedienteId, puedeResolver, onResuelto, onEvaluarManual, onCerrar }) => {
  const propuesta = celda?.propuesta || null;
  const estado = celda ? ESTADO_CELDA[celda.estado] : null;
  const [accion, setAccion] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const vigenteManual = celda?.evaluacion && celda.evaluacion.modalidad !== "ia_asistida" ? celda.evaluacion : null;

  const resolver = async (datos) => {
    setOcupado(true);
    setError(null);
    try {
      await revisionIAService.resolver(propuesta.resultadoId, { ...datos, expedienteId });
      setAccion(null);
      onResuelto?.();
      onCerrar();
    } catch (err) {
      setError(err.message || "No se pudo resolver la propuesta.");
      setAccion(null);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onCerrar}>
      <aside
        role="dialog" aria-modal="true" aria-label={`${columna.nombre} · ${fila.nombre}`}
        className="w-full max-w-md h-full bg-white shadow-dropdown overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5 border-b border-slate-100">
          <div className="min-w-0 mr-auto">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{NIVEL_TEXTO[fila.tipoEntidad]} · {fila.nombre}</p>
            <h3 className="text-sm font-bold text-carbon-dark">{columna.nombreCompleto || columna.nombre}</h3>
            {estado && <span className={`${CLASE_BADGE} mt-1.5 ${estado.clase || "bg-slate-50 text-carbon-dark border-slate-200"}`}>{estado.label}</span>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {!celda && <p className="text-xs text-slate-400">Este requerimiento no aplica a este sujeto.</p>}

          {propuesta && (
            <Seccion titulo="Propuesta de la IA">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${CLASE_BADGE} ${PROPUESTA[propuesta.propuesta]?.clase || ""}`}>{PROPUESTA[propuesta.propuesta]?.label || propuesta.propuesta}</span>
                {ESTADO_ENLACE[propuesta.estadoEnlace] && (
                  <span className={`${CLASE_BADGE} ${ESTADO_ENLACE[propuesta.estadoEnlace].clase}`}>{ESTADO_ENLACE[propuesta.estadoEnlace].label}</span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {camposExtraidos(propuesta.datosConsolidados).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-carbon-dark">{v}</dd></div>
                ))}
              </dl>
              {propuesta.resultadoReglas.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {propuesta.resultadoReglas.map((r) => (
                    <li key={r.regla} className="flex gap-2">
                      <span className={`font-bold w-12 shrink-0 ${RESULTADO_REGLA[r.resultado]?.clase || ""}`}>{r.regla}</span>
                      <span className="text-slate-600">{RESULTADO_REGLA[r.resultado]?.label || r.resultado}{r.detalle ? ` · ${r.detalle}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              {propuesta.archivos.length > 0 && (
                <ul className="text-[11px] text-slate-500 space-y-0.5">
                  {propuesta.archivos.map((a) => (
                    <li key={a.rutaRelativa} className="flex items-center gap-1"><FileText className="w-3 h-3" /> {a.rutaRelativa}</li>
                  ))}
                </ul>
              )}
              {puedeResolver && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {["cumple", "no_cumple"].includes(propuesta.propuesta) && (
                    <button type="button" disabled={ocupado} onClick={() => setAccion("aceptar")} className={CLASE_PRIMARIO}>Aceptar</button>
                  )}
                  <button type="button" disabled={ocupado} onClick={() => setAccion("corregir")} className={CLASE_SECUNDARIO}>Corregir</button>
                  <button type="button" disabled={ocupado} onClick={() => setAccion("descartar")} className={CLASE_SECUNDARIO}>Descartar propuesta</button>
                </div>
              )}
              {vigenteManual && (
                <p className="text-[11px] text-amber-700">
                  Hay una evaluación {vigenteManual.modalidad === "reutilizada" ? "reutilizada" : "manual"} vigente ({RESULTADO_TEXTO[vigenteManual.resultado] || vigenteManual.resultado}). Aceptar o corregir la reemplaza y la deja como histórica.
                </p>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </Seccion>
          )}

          {celda && (
            <Seccion titulo="Historial de evaluaciones">
              {celda.historial.length === 0 ? (
                <p className="text-xs text-slate-400">Sin evaluaciones.</p>
              ) : (
                <ul className="space-y-2">
                  {celda.historial.map((e) => (
                    <li key={e.id} className="p-2.5 rounded-lg border border-slate-100 text-xs">
                      <p className="flex flex-wrap items-center gap-2">
                        <b className="text-carbon-dark">{RESULTADO_TEXTO[e.resultado] || e.resultado}</b>
                        <span className="text-slate-500">{MODALIDAD_EVALUACION[e.modalidad] || e.modalidad}</span>
                        <span className={`ml-auto text-[10px] font-bold ${e.estado === "vigente" ? "text-sage-dark" : "text-slate-400"}`}>{e.estado === "vigente" ? "Vigente" : "Histórica"}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {e.evaluadorNombre || "—"} · {formatFechaHora(e.createdAt)}
                        {e.fechaVencimiento ? ` · Vence ${formatFecha(e.fechaVencimiento)}` : ""}
                      </p>
                      {e.observaciones && <p className="text-[11px] text-slate-600 mt-0.5">"{e.observaciones}"</p>}
                    </li>
                  ))}
                </ul>
              )}
              {onEvaluarManual && (
                <button type="button" onClick={() => onEvaluarManual(fila, celda)} className={CLASE_SECUNDARIO}>Evaluar manualmente</button>
              )}
            </Seccion>
          )}
        </div>
      </aside>
      {accion === "aceptar" && (
        <ConfirmacionModal
          peligro={Boolean(vigenteManual)}
          titulo="Aceptar la propuesta de la IA"
          mensaje={vigenteManual
            ? `Se reemplazará la evaluación ${vigenteManual.modalidad === "reutilizada" ? "reutilizada" : "manual"} vigente (${RESULTADO_TEXTO[vigenteManual.resultado] || vigenteManual.resultado}) por "${PROPUESTA[propuesta.propuesta]?.label}" de IA. La anterior queda como histórica.`
            : `Se registrará la evaluación "${PROPUESTA[propuesta.propuesta]?.label}" en este expediente.`}
          textoConfirmar="Aceptar"
          ocupado={ocupado}
          onConfirmar={() => resolver({ accion: "aceptar" })}
          onCancelar={() => setAccion(null)}
        />
      )}
      {accion === "descartar" && (
        <ConfirmacionModal
          titulo="Descartar la propuesta"
          mensaje="La propuesta se cierra sin crear evaluaciones."
          textoConfirmar="Descartar"
          ocupado={ocupado}
          onConfirmar={() => resolver({ accion: "descartar" })}
          onCancelar={() => setAccion(null)}
        />
      )}
      {accion === "corregir" && (
        // El modal no detiene la propagación: sin este envoltorio, un clic en él cerraría el panel.
        <div onClick={(e) => e.stopPropagation()}>
          <CorregirResultadoModal
            resultado={propuesta}
            ocupado={ocupado}
            onConfirmar={(datos) => resolver({ accion: "corregir", ...datos })}
            onCancelar={() => setAccion(null)}
          />
        </div>
      )}
    </div>
  );
};
