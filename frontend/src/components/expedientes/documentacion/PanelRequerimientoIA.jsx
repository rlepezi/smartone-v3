import { useState } from "react";
import { Bot, CheckCircle2, ChevronDown, CircleHelp, FileCheck2, FileText, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { revisionRequerimientoIAService } from "../../../services/revisionRequerimientoIAService";
import { ESTADOS_IA_REQ, RESULTADOS_PROPUESTOS, SEVERIDADES } from "../../../utils/reglasIA";
import { describirRegla } from "../../../utils/describirRegla";
import { prepararPiezasIA } from "../../../utils/revisionIAArchivos";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap";
const CLASE_BOTON = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const RESULTADO = {
  cumple: { Icono: CheckCircle2, clase: "text-sage-darker", label: "Cumple" },
  no_cumple: { Icono: XCircle, clase: "text-red-600", label: "No cumple" },
  no_determinable: { Icono: CircleHelp, clase: "text-amber-600", label: "No determinable" },
};
// Estados IA con los que se puede pedir la revisión desde el panel (la propuesta nunca se guarda sola).
const ESTADOS_REVISABLES = ["en_prueba", "habilitado"];

const VERIFICACIONES_EXISTENCIA = ["archivo_presente", "carpeta_presente"];

const PESTANAS_REQUERIMIENTO = [
  { value: "manual", label: "Evaluación manual" },
  { value: "ia", label: "Evaluación con IA" },
];

// Título de cada parte del flujo de evaluación (sin numeración).
export const TituloPaso = ({ children }) => <p className="text-[11px] font-bold text-carbon-dark">{children}</p>;

// Instrucción de una regla interpretativa: 2 líneas, expandible.
const Instruccion = ({ texto }) => {
  const [abierta, setAbierta] = useState(false);
  return (
    <button type="button" onClick={() => setAbierta((v) => !v)} className="block text-left text-[11px] text-slate-600 hover:text-carbon-dark">
      <span className={abierta ? "" : "line-clamp-2"}>{texto}</span>
    </button>
  );
};

// Panel lateral en "modo requerimiento" (ícono de cada requisito de la planilla): encabezado con el
// nombre, el Estado IA y las pestañas [Evaluación manual] [Evaluación con IA]. El contenido de la
// pestaña manual (ubicar y abrir el documento) lo arma PanelDocumentos; la pestaña IA es PestanaIA.
// Sin reglas definidas la pestaña IA se ve pero no se puede abrir (las reglas se definen solo en la
// configuración principal).
export const EncabezadoRequerimiento = ({ instancia, pauta, pestana, onPestana, onCerrar }) => {
  const estado = ESTADOS_IA_REQ[pauta?.estadoIA] || ESTADOS_IA_REQ.sin_reglas;
  const conReglas = (pauta?.reglas || []).length > 0;
  return (
    <div className="border-b border-slate-100 bg-primary-lighter/20">
      <div className="flex items-start gap-2 px-3 pt-3">
        <div className="min-w-0 mr-auto">
          <p className="text-xs font-bold text-carbon-dark" title={instancia.nombre}>{instancia.nombreCorto || instancia.nombre}</p>
          <p className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span>
            {pauta?.tipo && <span className="text-[10px] text-slate-500">{pauta.tipo.nombre} · {pauta.tipo.codigo}</span>}
          </p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Volver a documentos" title="Volver a documentos" className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div role="tablist" aria-label="Tipo de evaluación" className="flex gap-1 px-3 mt-2">
        {PESTANAS_REQUERIMIENTO.map((p) => {
          const activa = pestana === p.value;
          const bloqueada = p.value === "ia" && !conReglas;
          return (
            <button key={p.value} type="button" role="tab" aria-selected={activa} disabled={bloqueada}
              onClick={() => onPestana(p.value)} title={bloqueada ? "Este requerimiento no tiene reglas de validación definidas." : undefined}
              className={`px-3 py-1.5 -mb-px border-b-2 text-[11px] font-bold disabled:text-slate-300 disabled:cursor-not-allowed ${activa ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-carbon-dark"}`}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Reglas de validación como checklist de apoyo para la evaluación manual (o visual): cada regla con
// su casilla, solo ayuda en pantalla (no se guarda). Plegable: `abierto` / `onAlternar`; `checks`
// ({ id: bool }) / `onCheck(id, valor)` los maneja quien lo usa. Con `onMarcar(resultado, faltantes)`
// (quien puede evaluar): todas verificadas → "Marcar como Cumple"; alguna sin marcar → aviso con las
// que faltan y "Marcar como No cumple". Solo llenan la fila (no guardan); `marcado` es el resultado
// ya marcado desde aquí. Sin `checks` (pestaña IA) se muestran solo para leer. Sin reglas no se muestra.
export const ReglasApoyo = ({ reglas: reglasPauta, ctx, abierto, onAlternar, checks = null, onCheck, onMarcar = null, marcado = null }) => {
  if (!reglasPauta?.length) return null;
  // Las de existencia (archivo, carpeta) primero: sin documento, las demás no se pueden revisar.
  const reglas = [...reglasPauta].sort((a, b) => Number(VERIFICACIONES_EXISTENCIA.includes(b.verificacion))
    - Number(VERIFICACIONES_EXISTENCIA.includes(a.verificacion)));
  const conChecklist = Boolean(checks);
  const verificadas = conChecklist ? reglas.filter((r) => checks[r.vinculoId || r.reglaId]).length : 0;
  const faltantes = conChecklist ? reglas.filter((r) => !checks[r.vinculoId || r.reglaId]) : [];
  const todas = faltantes.length === 0;
  return (
    <div className="border-b border-slate-100 bg-white">
      <button type="button" onClick={onAlternar} aria-expanded={abierto}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-[11px] font-bold text-carbon-dark hover:bg-slate-50">
        Reglas de validación
        <span className="font-normal text-slate-500">
          · {conChecklist ? `${verificadas}/${reglas.length} verificadas` : reglas.length}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-primary">
          {abierto ? "Ocultar" : "Ver reglas"}
          <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </span>
      </button>
      {abierto && (
        <>
          <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {reglas.map((regla) => {
              const id = regla.vinculoId || regla.reglaId;
              return (
                <li key={id} className="px-3 py-2 flex items-start gap-2">
                  {conChecklist && <input type="checkbox" checked={Boolean(checks[id])} onChange={(e) => onCheck(id, e.target.checked)}
                    aria-label={`Verificado: ${regla.nombre}`} className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary/30" />}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-carbon-dark">
                      {regla.nombre}
                      <span className={`${CLASE_BADGE} ${SEVERIDADES[regla.severidad]?.clase || ""}`}>{SEVERIDADES[regla.severidad]?.label || regla.severidad}</span>
                    </p>
                    {regla.tipo === "deterministica"
                      ? <p className="text-[11px] text-slate-600">{describirRegla(regla, ctx)}</p>
                      : <Instruccion texto={regla.instruccionIA || regla.nombre} />}
                  </div>
                </li>
              );
            })}
          </ul>
          {conChecklist && <p className="px-3 pb-2 text-[10px] text-slate-400">Guía para revisar el documento: las casillas no se guardan; el resultado se marca en la fila.</p>}
        </>
      )}
      {onMarcar && (
        <div className="px-3 pb-2">
          {marcado ? (
            <p className="text-[11px] font-bold text-sage-darker">
              Marcado «{marcado === "cumple" ? "Cumple" : "No cumple"}» en la fila: revíselo y presione «Guardar Evaluación».
            </p>
          ) : todas ? (
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-sage-lighter/60 border border-sage-light">
              <span className="text-[11px] text-sage-darker">Cumple con todas las reglas.</span>
              <button type="button" onClick={() => onMarcar("cumple", [])}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-sage-dark text-white text-[11px] font-bold hover:bg-sage-darker">
                <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como Cumple
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-[11px] text-amber-800">
                {faltantes.length === 1 ? "Falta verificar la regla" : `Faltan verificar ${faltantes.length} reglas`}: <b>{faltantes.map((r) => r.nombre).join(", ")}</b>.
              </p>
              <button type="button" onClick={() => onMarcar("no_cumple", faltantes)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border border-red-200 bg-white text-[11px] font-bold text-red-700 hover:bg-red-50">
                <XCircle className="w-3.5 h-3.5" /> Marcar como No cumple
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Pestaña "Evaluación con IA": Estado IA, el documento elegido en la pestaña manual (comparten la
// selección), "Revisión IA" (con Estado IA en prueba o habilitado y un documento) y la propuesta con
// sus motivos por regla. Confirmarla solo llena SI/NO/N/A y la observación de la fila (no guarda).
//  - datos: { instancia, pauta, propuesta, aplicada, puedeRevisar, acciones (ref: revisada, aplicar,
//    descartada) }.
//  - documento: { ruta, nombre, leer() → Promise<File | null> } | null.
export const PestanaIA = ({ datos, expedienteId, documento, ctx, onIrAManual }) => {
  const { instancia, pauta, propuesta, aplicada, puedeRevisar, acciones } = datos;
  const reglas = pauta?.reglas || [];
  const estadoIA = pauta?.estadoIA || "sin_reglas";
  const estado = ESTADOS_IA_REQ[estadoIA] || ESTADOS_IA_REQ.sin_reglas;
  const [revisando, setRevisando] = useState(false);
  const [error, setError] = useState(null);
  const [reglasAbiertas, setReglasAbiertas] = useState(true);
  const revisable = ESTADOS_REVISABLES.includes(estadoIA);
  const habilitarRevision = revisable && Boolean(documento) && puedeRevisar && !revisando;

  const revisar = async () => {
    setRevisando(true);
    setError(null);
    try {
      const file = await documento.leer();
      if (!file) throw new Error("No se pudo leer el documento seleccionado.");
      const archivos = await prepararPiezasIA([{ file, rutaRelativa: documento.ruta }]);
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
  const nombreRegla = (r) => reglas.find((x) => (r.vinculoId && x.vinculoId === r.vinculoId) || x.reglaId === r.reglaId)?.nombre
    || r.nombre || "Regla";
  const motivoDeshabilitado = !revisable ? "Requiere Estado IA «En prueba» o «IA habilitada»."
    : !documento ? "Elija el documento en «Evaluación manual»."
      : !puedeRevisar ? "Solo superadmin y evaluador, con el expediente abierto a evaluación." : null;

  return (
    <div>
      {/* Las reglas que aplicará la IA, solo para leer. */}
      <ReglasApoyo reglas={reglas} ctx={ctx} abierto={reglasAbiertas} onAlternar={() => setReglasAbiertas((v) => !v)} />
    <div className="p-3 space-y-3">
      <div className="space-y-1">
        <TituloPaso>Estado IA</TituloPaso>
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span>
        </p>
        {estadoIA === "en_prueba" && (
          <p className="text-[10px] text-slate-400">En prueba: la propuesta es de apoyo; el evaluador decide el resultado.</p>
        )}
      </div>

      <div className="space-y-1">
        <TituloPaso>Documento que leerá la IA</TituloPaso>
        {documento ? (
          <p className="flex items-center gap-1.5 text-[11px] text-carbon-dark min-w-0" title={documento.ruta}>
            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" /><b className="truncate">{documento.nombre}</b>
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Ningún documento seleccionado.{" "}
            <button type="button" onClick={onIrAManual} className="font-bold text-primary hover:underline">Elegirlo en «Evaluación manual»</button>
          </p>
        )}
      </div>

      <div className="space-y-1">
        <button type="button" onClick={revisar} disabled={!habilitarRevision} title={motivoDeshabilitado || undefined}
          className={`${CLASE_BOTON} bg-primary text-white hover:bg-primary-dark`}>
          {revisando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : propuesta ? <RotateCcw className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
          {revisando ? "Revisando..." : propuesta ? "Volver a revisar" : "Revisión IA"}
        </button>
        {motivoDeshabilitado
          ? <p className="text-[10px] text-slate-400">{motivoDeshabilitado}</p>
          : <p className="text-[10px] text-slate-400">El costo se suma al gasto IA del mes.</p>}
      </div>

      {propuesta && (
        <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2">
          <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-bold text-carbon-dark">Propuesta de la IA:</span>
            {propuesto && <span className={`${CLASE_BADGE} ${propuesto.clase}`}>{propuesto.label}</span>}
          </p>
          {(propuesta.resultadosReglas || []).length > 0 && (
            <ul className="space-y-1">
              {propuesta.resultadosReglas.map((r) => {
                const res = RESULTADO[r.resultado];
                return (
                  <li key={r.vinculoId || r.reglaId} className="text-[11px]">
                    <p className={`flex items-center gap-1 font-bold ${res?.clase || "text-slate-600"}`}>
                      {res && <res.Icono className="w-3.5 h-3.5 shrink-0" />} {nombreRegla(r)}{res ? ` · ${res.label}` : ""}
                    </p>
                    {r.detalle && <p className="pl-[18px] text-slate-600">{r.detalle}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {propuesta.observacionesPropuestas && (
            <p className="whitespace-pre-wrap text-[11px] text-slate-600">{propuesta.observacionesPropuestas}</p>
          )}
          {puedeRevisar && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {aplicada
                ? <span className="text-[11px] font-bold text-sage-darker">Confirmada en la fila: revísela y presione «Guardar Evaluación».</span>
                : (
                  <button type="button" onClick={() => acciones.current.aplicar(propuesta)} className={`${CLASE_BOTON} bg-primary text-white hover:bg-primary-dark`}>
                    <FileCheck2 className="w-3.5 h-3.5" /> Confirmar en la fila
                  </button>
                )}
              <button type="button" onClick={descartar} className={`${CLASE_BOTON} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>Descartar</button>
            </div>
          )}
          <p className="text-[10px] text-slate-400">Confirmar solo marca SI/NO/N/A y las observaciones de la fila; nada se guarda solo.</p>
        </div>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
    </div>
  );
};
