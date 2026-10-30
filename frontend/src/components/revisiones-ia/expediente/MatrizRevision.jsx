import { useMemo, useState } from "react";
import { Bot, CheckCheck, Clock, Download, UserRound } from "lucide-react";
import { revisionExpedienteService } from "../../../services/revisionExpedienteService";
import { ConfirmacionModal } from "../../shared/ConfirmacionModal";
import { CLASE_BADGE, ESTADO_CELDA, CLASE_RESULTADO_CELDA, textoCelda } from "../../../utils/revisionIA";
import { formatFecha } from "../../../utils/fechas";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO, NIVEL_TEXTO } from "./estilos";
import { PanelCelda } from "./PanelCelda";

const ORDEN_FILTROS = ["pendiente", "propuesta_ia", "validado_ia", "validado_manual", "no_aplica", "vencido", "discrepancia"];
const BOM_UTF8 = "﻿";

const Celda = ({ celda, onClick }) => {
  if (!celda) return <span className="text-slate-200">—</span>;
  const validado = ["validado_ia", "validado_manual"].includes(celda.estado);
  const clase = validado ? CLASE_RESULTADO_CELDA[celda.resultado] || "bg-slate-100 text-slate-500 border-slate-200" : ESTADO_CELDA[celda.estado]?.clase;
  const Icono = celda.estado === "vencido" ? Clock : celda.estado === "validado_ia" ? Bot : celda.estado === "validado_manual" ? UserRound : null;
  return (
    <button type="button" onClick={onClick} className={`${CLASE_BADGE} gap-1 ${clase} hover:shadow-sm`}>
      {Icono && <Icono className="w-3 h-3" aria-hidden="true" />}
      {textoCelda(celda)}
      {celda.estado === "vencido" && celda.fechaVencimiento && <span className="font-normal">({formatFecha(celda.fechaVencimiento)})</span>}
    </button>
  );
};

const exportarCsv = (columnas, filas, nombreArchivo) => {
  const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lineas = [
    ["Sujeto", "Nivel", "RUT / Patente", ...columnas.map((c) => c.nombre)].map(escapar).join(";"),
    ...filas.map((f) => [f.nombre, NIVEL_TEXTO[f.tipoEntidad], f.detalle || "",
      ...columnas.map((c) => textoCelda(f.celdas[c.requerimientoId]))].map(escapar).join(";")),
  ];
  const blob = new Blob([BOM_UTF8 + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
};

// Matriz de estado del expediente: filas (empresa, personas, recursos) × columnas (requerimientos).
// Filtros por estado con contadores, "solo habilitados para IA" y exportación CSV. Al hacer clic
// en una celda se abre el panel con la propuesta, sus reglas y el historial de evaluaciones.
export const MatrizRevision = ({ matriz, expedienteId, nombreExpediente, puedeResolver, onEvaluarManual, onCambio }) => {
  const [soloIA, setSoloIA] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Propuestas "cumple" sin discrepancia (las discrepancias tienen su propio estado), una por
  // resultado de revisión.
  const aceptables = useMemo(() => [...new Set((matriz?.filas || []).flatMap((f) => Object.values(f.celdas))
    .filter((c) => c.estado === "propuesta_ia" && c.propuesta?.propuesta === "cumple")
    .map((c) => c.propuesta.resultadoId))], [matriz]);

  const aceptarLote = async () => {
    setAceptando(true);
    try {
      const r = await revisionExpedienteService.aceptarLote(expedienteId, aceptables);
      setAviso(`${r.aceptados.length} aceptadas${r.omitidos.length ? ` · ${r.omitidos.length} omitidas` : ""}${r.errores.length ? ` · ${r.errores.length} con error: ${r.errores.map((e) => e.mensaje).join(" · ")}` : ""}.`);
      onCambio?.();
    } catch (err) {
      setAviso(err.message || "No se pudieron aceptar las propuestas.");
    } finally {
      setAceptando(false);
      setConfirmarLote(false);
    }
  };

  const columnas = useMemo(
    () => (matriz?.columnas || []).filter((c) => !soloIA || c.habilitadoIA),
    [matriz, soloIA],
  );
  const filas = useMemo(() => (matriz?.filas || [])
    .filter((f) => columnas.some((c) => f.celdas[c.requerimientoId]))
    .filter((f) => !filtroEstado || columnas.some((c) => f.celdas[c.requerimientoId]?.estado === filtroEstado)),
  [matriz, columnas, filtroEstado]);
  const contadores = useMemo(() => {
    const conteo = {};
    (matriz?.filas || []).forEach((f) => columnas.forEach((c) => {
      const celda = f.celdas[c.requerimientoId];
      if (celda) conteo[celda.estado] = (conteo[celda.estado] || 0) + 1;
    }));
    return conteo;
  }, [matriz, columnas]);

  if (!matriz) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {ORDEN_FILTROS.filter((e) => contadores[e]).map((e) => (
          <button
            key={e} type="button" onClick={() => setFiltroEstado((f) => (f === e ? null : e))}
            className={`${CLASE_BADGE} ${filtroEstado === e ? "ring-2 ring-primary/40" : ""} ${ESTADO_CELDA[e].clase || "bg-white text-carbon-dark border-slate-200"}`}
          >
            {ESTADO_CELDA[e].label} ({contadores[e]})
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {puedeResolver && aceptables.length > 0 && (
            <button type="button" onClick={() => setConfirmarLote(true)} disabled={aceptando} className={CLASE_PRIMARIO}>
              <CheckCheck className="w-3.5 h-3.5" /> Aceptar todas las propuestas que cumplen ({aceptables.length})
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={soloIA} onChange={(e) => setSoloIA(e.target.checked)} className="text-primary rounded" />
            Solo habilitados para IA
          </label>
          <button type="button" onClick={() => exportarCsv(columnas, filas, `matriz-revision-${nombreExpediente || "expediente"}.csv`)} disabled={!filas.length} className={CLASE_SECUNDARIO}>
            <Download className="w-3.5 h-3.5" /> Exportar CSV
          </button>
        </span>
      </div>

      {aviso && <p className="text-xs text-slate-600">{aviso}</p>}

      {columnas.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">
          {soloIA ? "No hay requerimientos habilitados para IA. Habilítelos en el paso 2 o desmarque \"Solo habilitados para IA\"." : "El expediente no tiene requerimientos."}
        </p>
      ) : filas.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">No hay celdas con ese estado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-3 py-2 sticky left-0 bg-slate-50 min-w-[12rem]">Sujeto</th>
                {columnas.map((c) => <th key={c.requerimientoId} className="px-3 py-2 whitespace-nowrap" title={c.nombreCompleto}>{c.nombre}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td className="px-3 py-2 sticky left-0 bg-white">
                    <p className="font-semibold text-carbon-dark">{f.nombre}</p>
                    <p className="text-[10px] text-slate-400">{NIVEL_TEXTO[f.tipoEntidad]}{f.detalle ? ` · ${f.detalle}` : ""}</p>
                  </td>
                  {columnas.map((c) => (
                    <td key={c.requerimientoId} className="px-3 py-2">
                      <Celda celda={f.celdas[c.requerimientoId]} onClick={() => setSeleccion({ fila: f, columna: c })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seleccion && (
        <PanelCelda
          fila={seleccion.fila}
          columna={seleccion.columna}
          celda={seleccion.fila.celdas[seleccion.columna.requerimientoId]}
          expedienteId={expedienteId}
          puedeResolver={puedeResolver}
          onResuelto={onCambio}
          onEvaluarManual={onEvaluarManual}
          onCerrar={() => setSeleccion(null)}
        />
      )}
      {confirmarLote && (
        <ConfirmacionModal
          titulo="Aceptar todas las propuestas que cumplen"
          mensaje={`Se aceptarán ${aceptables.length} ${aceptables.length === 1 ? "propuesta" : "propuestas"} con resultado Cumple. No incluye discrepancias ni las de revisión humana.`}
          textoConfirmar="Aceptar todas"
          ocupado={aceptando}
          onConfirmar={aceptarLote}
          onCancelar={() => setConfirmarLote(false)}
        />
      )}
    </div>
  );
};
