import { useState } from "react";
import { BookmarkPlus, Bot, CheckCircle2, ChevronDown, CircleHelp, ClipboardCheck, FileCheck2, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { patronService } from "../../../services/patronService";
import { nombreSujetoPatron } from "../../../utils/loteRevision";
import { revisionRequerimientoIAService } from "../../../services/revisionRequerimientoIAService";
import { ESTADOS_IA_REQ, RESULTADOS_PROPUESTOS, SEVERIDADES } from "../../../utils/reglasIA";
import { describirRegla } from "../../../utils/describirRegla";
import { prepararPiezasIA } from "../../../utils/revisionIAArchivos";
import { sugerenciaChecklist } from "../../../utils/checklistReglas";
import { ReglasIAModal } from "./ReglasIAModal";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";
const CLASE_BOTON = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-50";
const RESULTADO = {
  cumple: { Icono: CheckCircle2, clase: "text-sage-darker", label: "Cumple" },
  no_cumple: { Icono: XCircle, clase: "text-red-600", label: "No cumple" },
  no_determinable: { Icono: CircleHelp, clase: "text-amber-600", label: "No determinable" },
};

// Título numerado de cada paso del modo requerimiento (orden de trabajo).
const Paso = ({ numero, titulo, children = null }) => (
  <p className="flex items-center gap-1.5 text-[11px] font-bold text-carbon-dark">
    <span className="w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shrink-0">{numero}</span>
    {titulo}
    {children}
  </p>
);

// Instrucción de una regla interpretativa: 2 líneas, expandible.
const Instruccion = ({ texto }) => {
  const [abierta, setAbierta] = useState(false);
  return (
    <button type="button" onClick={() => setAbierta((v) => !v)} className="block text-left text-[11px] text-slate-600 hover:text-carbon-dark">
      <span className={abierta ? "" : "line-clamp-2"}>{texto}</span>
    </button>
  );
};

// Panel lateral en "modo requerimiento" (ícono IA de un requisito de la planilla): encabezado, las
// reglas de validación como pauta (con un checklist que es solo ayuda visual en este navegador) y,
// con la IA habilitada, "Revisar con IA" sobre el documento abierto en el visor. La propuesta se
// aplica al formulario de la planilla (no guarda) o se descarta. El documento lo ubica el panel.
//  - datos: { instancia, pauta, propuesta, aplicada, puedeRevisar, acciones (ref: revisada, aplicar,
//    descartada) }.
//  - ctx: { tipoEntidad, sujeto, empresa, proyecto } para describir las reglas con datos reales.
//  - archivoAbierto: { file, rutaRelativa } del visor, o null.
//  - documento: { opciones: [{ ruta, nombre, candidato }], actual, onElegir, noEncontrado } | null.
//  - carpeta: dónde está el documento (controles de carpeta del panel), entre el encabezado y las reglas.
//  - mapeoExpediente: mapeo de la carpeta de este expediente (Empresa), para mostrar en Reglas IA
//    dónde está ubicado el requerimiento en ella.
//  - recordar (Persona / Maquinaria): { carpetaEmpresaId, ambito, sujeto, ubicado(ruta), onRecordado }
//    para "Recordar" el archivo elegido: aprende el patrón y la próxima vez se ubica solo.
export const PanelRequerimientoIA = ({ datos, ctx, expedienteId, archivoAbierto, documento, puedeDefinirReglas, onCerrar, carpeta = null, mapeoExpediente = null, recordar = null }) => {
  const { instancia, pauta, propuesta, aplicada, puedeRevisar, acciones } = datos;
  const reglas = pauta?.reglas || [];
  const estadoIA = pauta?.estadoIA || "sin_reglas";
  const estado = ESTADOS_IA_REQ[estadoIA] || ESTADOS_IA_REQ.sin_reglas;
  const [checks, setChecks] = useState({});
  const [propuestaVista, setPropuestaVista] = useState(null);
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState(null);
  const [editandoReglas, setEditandoReglas] = useState(false);
  const [recordado, setRecordado] = useState(null); // ruta del archivo recordado
  const [recordando, setRecordando] = useState(false);
  const recordarArchivo = async () => {
    setRecordando(true);
    setError(null);
    try {
      await patronService.confirmar({
        carpetaEmpresaId: recordar.carpetaEmpresaId, ambito: recordar.ambito,
        items: [{ requerimientoId: instancia.requerimientoId, nombreArchivo: archivoAbierto.file.name,
          nombreSujeto: nombreSujetoPatron(recordar.ambito, recordar.sujeto) }],
      });
      setRecordado(archivoAbierto.rutaRelativa);
      recordar.onRecordado?.();
    } catch (err) {
      setError(err.message || "No se pudo recordar el archivo.");
    } finally {
      setRecordando(false);
    }
  };
  const cerrarReglas = () => {
    setEditandoReglas(false);
    acciones.current.recargarPautas?.();
  };

  // Una propuesta nueva marca el checklist según su resultado (el evaluador puede cambiarlo).
  if (propuesta && propuesta.id !== propuestaVista) {
    setPropuestaVista(propuesta.id);
    setChecks(Object.fromEntries((propuesta.resultadosReglas || [])
      .map((r) => [r.vinculoId || r.reglaId, r.resultado === "cumple"])));
  }
  const resultadoDe = (regla) => (propuesta?.resultadosReglas || [])
    .find((r) => (r.vinculoId && r.vinculoId === regla.vinculoId) || r.reglaId === regla.reglaId) || null;

  const revisar = async () => {
    if (!archivoAbierto) return;
    setRevisando(true);
    setError(null);
    try {
      const archivos = await prepararPiezasIA([{ file: archivoAbierto.file, rutaRelativa: archivoAbierto.rutaRelativa }]);
      const revision = await revisionRequerimientoIAService.revisar(expedienteId, {
        expedienteRequerimientoId: instancia.id, archivos, origen: "carpeta_local",
      });
      acciones.current.revisada(revision);
    } catch (err) {
      setError(err.message || "No se pudo revisar con IA.");
    } finally {
      setRevisando(false);
    }
  };
  const descartar = async () => {
    setError(null);
    try {
      await revisionRequerimientoIAService.descartar(propuesta.id);
      acciones.current.descartada();
    } catch (err) {
      setError(err.message || "No se pudo descartar.");
    }
  };

  const propuesto = propuesta ? RESULTADOS_PROPUESTOS[propuesta.resultadoPropuesto?.resultado] : null;
  const pasoCarpeta = carpeta ? 1 : 0;
  const pasoReglas = pasoCarpeta + 1;
  const pasoDocumento = pasoReglas + 1;
  const pasoIA = pasoDocumento + 1;
  const habilitado = estadoIA === "habilitado";

  return (
    <div className="border-b border-slate-100 bg-primary-lighter/20 max-h-[50%] overflow-y-auto">
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Bot className={`w-4 h-4 mt-0.5 shrink-0 ${habilitado ? "text-primary" : "text-slate-400"}`} />
          <div className="min-w-0 mr-auto">
            <p className="text-xs font-bold text-carbon-dark" title={instancia.nombre}>{instancia.nombreCorto || instancia.nombre}</p>
            <p className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span>
              {pauta?.tipo && <span className="text-[10px] text-slate-500">{pauta.tipo.nombre} · {pauta.tipo.codigo}</span>}
              {puedeDefinirReglas && reglas.length > 0 && (
                <button type="button" onClick={() => setEditandoReglas(true)} className="text-[10px] font-bold text-primary hover:underline">Editar reglas</button>
              )}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Volver a documentos" title="Volver a documentos" className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {carpeta && (
          <div className="space-y-1.5">
            <Paso numero={pasoCarpeta} titulo="Ubicar el documento" />
            <div className="pl-5 space-y-1.5">{carpeta}</div>
          </div>
        )}

        {propuesta && (
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-bold text-carbon-dark">Resultado propuesto:</span>
              {propuesto && <span className={`${CLASE_BADGE} ${propuesto.clase}`}>{propuesto.label}</span>}
            </p>
            {propuesta.observacionesPropuestas && (
              <p className="whitespace-pre-wrap text-[11px] text-slate-600">{propuesta.observacionesPropuestas}</p>
            )}
            {puedeRevisar && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {aplicada
                  ? <span className="text-[11px] font-bold text-sage-darker">Aplicada: revise la fila y presione «Guardar Evaluación».</span>
                  : (
                    <button type="button" onClick={() => acciones.current.aplicar(propuesta)} className={`${CLASE_BOTON} bg-primary text-white hover:bg-primary-dark`}>
                      <FileCheck2 className="w-3.5 h-3.5" /> Aplicar propuesta
                    </button>
                  )}
                <button type="button" onClick={descartar} className={`${CLASE_BOTON} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>Descartar</button>
              </div>
            )}
          </div>
        )}

        <details open className="rounded-xl bg-white border border-slate-200">
          <summary className="flex items-center gap-1.5 px-2.5 py-2 cursor-pointer select-none">
            <Paso numero={pasoReglas} titulo={`Revisar las reglas de validación${reglas.length > 0 ? ` (${reglas.length})` : ""}`} />
            <ChevronDown className="w-3.5 h-3.5 ml-auto text-slate-400" />
          </summary>
          {reglas.length === 0 ? (
            <p className="px-2.5 pb-2.5 text-[11px] text-slate-500">
              Sin reglas de validación definidas.{" "}
              {puedeDefinirReglas && (
                <button type="button" onClick={() => setEditandoReglas(true)} className="font-bold text-primary hover:underline">Definir reglas</button>
              )}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reglas.map((regla) => {
                const id = regla.vinculoId || regla.reglaId;
                const r = resultadoDe(regla);
                const res = r ? RESULTADO[r.resultado] : null;
                return (
                  <li key={id} className="px-2.5 py-2 flex items-start gap-2">
                    <input type="checkbox" checked={Boolean(checks[id])} onChange={(e) => setChecks((c) => ({ ...c, [id]: e.target.checked }))}
                      aria-label={`Verificado: ${regla.nombre}`} className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary/30" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-carbon-dark">
                        {regla.nombre}
                        <span className={`${CLASE_BADGE} ${SEVERIDADES[regla.severidad]?.clase || ""}`}>{SEVERIDADES[regla.severidad]?.label || regla.severidad}</span>
                      </p>
                      {regla.tipo === "deterministica"
                        ? <p className="text-[11px] text-slate-600">{describirRegla(regla, ctx)}</p>
                        : <Instruccion texto={regla.instruccionIA || regla.nombre} />}
                      {res && (
                        <details className="text-[11px]">
                          <summary className={`inline-flex items-center gap-1 font-bold cursor-pointer ${res.clase}`}>
                            <res.Icono className="w-3.5 h-3.5" /> {res.label}
                          </summary>
                          {r.detalle && <p className="mt-0.5 text-slate-600">{r.detalle}</p>}
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {reglas.length > 0 && (() => {
            const sugerencia = sugerenciaChecklist(reglas, checks);
            return (
              <div className="px-2.5 pb-2.5 space-y-1.5">
                {sugerencia ? (
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[11px] text-slate-600">
                      Sugerencia: <b className={sugerencia.resultado === "cumple" ? "text-sage-darker" : "text-red-600"}>{sugerencia.texto}</b> · {sugerencia.observaciones}
                    </span>
                    {puedeRevisar && (
                      <button type="button" onClick={() => acciones.current.aplicarChecklist(sugerencia)}
                        className={`${CLASE_BOTON} ml-auto border border-primary/30 bg-white text-primary hover:bg-primary-lighter`}>
                        <ClipboardCheck className="w-3.5 h-3.5" /> Aplicar a la fila
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400">Marque las reglas que verificó en el documento: se sugiere el resultado para la fila.</p>
                )}
                <p className="text-[10px] text-slate-400">El checklist no se guarda; «Aplicar a la fila» solo llena SI/NO y la observación: se guarda con «Guardar Evaluación».</p>
              </div>
            );
          })()}
        </details>

        <div className="space-y-1">
          <Paso numero={pasoDocumento} titulo="Abrir el documento" />
          <p className="pl-5 text-[11px] text-slate-500">{archivoAbierto ? <>Abierto: <b className="text-carbon-dark">{archivoAbierto.file.name}</b></> : "Elíjalo en la lista de archivos de abajo."}</p>
        </div>
        {documento && (
          <div className="space-y-1 pl-5">
            {documento.noEncontrado && (
              <p className="text-[11px] text-amber-700">
                {recordar ? "Sin documento ubicado: elíjalo en la lista y use «Recordar» para que la próxima vez se ubique solo."
                  : "No se encontró automáticamente el documento de este requerimiento: elíjalo en la lista."}
              </p>
            )}
            {documento.opciones.length > 1 && (
              <label className="block text-[11px] text-slate-500">
                Documento
                <select value={documento.actual || ""} onChange={(e) => documento.onElegir(e.target.value)}
                  className="mt-0.5 w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-carbon-dark">
                  {!documento.actual && <option value="">Elija un archivo…</option>}
                  {documento.opciones.map((o) => <option key={o.ruta} value={o.ruta}>{o.candidato ? "★ " : ""}{o.nombre}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        {recordar && puedeRevisar && archivoAbierto && (
          <div className="pl-5">
            {recordar.ubicado(archivoAbierto.rutaRelativa) ? (
              <p className="text-[11px] text-sage-darker">Ubicado por patrón aprendido.</p>
            ) : recordado === archivoAbierto.rutaRelativa ? (
              <p className="text-[11px] text-sage-darker">Recordado: la próxima vez se ubicará solo (también en la revisión en lote).</p>
            ) : (
              <button type="button" onClick={recordarArchivo} disabled={recordando}
                className={`${CLASE_BOTON} border border-primary/30 bg-white text-primary hover:bg-primary-lighter`}>
                {recordando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                Recordar este archivo para «{instancia.nombreCorto || instancia.nombre}»
              </button>
            )}
          </div>
        )}

        {habilitado && puedeRevisar && (
          <Paso numero={pasoIA} titulo="Revisar con IA y aplicar a la fila" />
        )}
        {habilitado && puedeRevisar && archivoAbierto && (
          <div className="flex flex-wrap items-center gap-2 pl-5">
            <button type="button" onClick={revisar} disabled={revisando} className={`${CLASE_BOTON} bg-primary text-white hover:bg-primary-dark`}>
              {revisando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : propuesta ? <RotateCcw className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              {revisando ? "Revisando..." : propuesta ? "Volver a revisar" : "Revisar con IA"}
            </button>
            <span className="text-[10px] text-slate-400 truncate">Revisa «{archivoAbierto.file.name}». El costo se suma al gasto IA del mes.</span>
          </div>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
      {editandoReglas && (
        <ReglasIAModal requerimientoId={instancia.requerimientoId} nombre={instancia.nombre} onCerrar={cerrarReglas} mapeoExpediente={mapeoExpediente} />
      )}
    </div>
  );
};
