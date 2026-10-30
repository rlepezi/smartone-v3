import React, { useEffect, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { expedienteService } from "../../services/expedienteService";
import { evidenciaService } from "../../services/evidenciaService";
import { formatFecha } from "../../utils/fechas";
import { ActionButton } from "../shared/ActionButton";
import { ErrorBanner } from "../shared/ErrorBanner";
import { DateInput } from "../ui/DateInput";

// `instanciaId`: la instancia de Requerimiento (expedienteRequerimientos) del sujeto elegido.
const FORM_VACIO = { expedienteId: "", sujeto: "empresa", instanciaId: "", fechaVencimiento: "" };

// Documentos (Evidencias) de los Expedientes de las Empresas del Proyecto —
// datos reales, no hay un modelo de "documento de Proyecto" propio. `participantes`
// da el nombre de cada Empresa.
//
// En modo edición (`modoEdicion`) suma "Subir documento": mismo flujo que el detalle
// del Expediente (evidenciaService.subirYVincular: Storage + Evidencia + vínculo con el
// Requerimiento). `sujeto` es "empresa", "persona:<id>" o "recurso:<id>".
export const DocumentosProyecto = ({
  proyectoId, participantes, modoEdicion = false, sujetos = [], personas = [], recursos = [], onCambio,
}) => {
  // undefined = cargando, null = falló, objeto = cargado.
  const [datos, setDatos] = useState(undefined);
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  // Instancias activas del sujeto elegido (se piden al elegir Expediente y sujeto).
  const [elegibles, setElegibles] = useState({ clave: null, instancias: [] });

  useEffect(() => {
    let activo = true;
    Promise.all([expedienteService.listar({}), evidenciaService.listar({})])
      .then(([expedientes, evidencias]) => {
        if (!activo) return;
        const delProyecto = (expedientes || []).filter((e) => e.proyectoId === proyectoId);
        const porExpediente = {};
        delProyecto.forEach((e) => { porExpediente[e.id] = e.empresaId; });
        setDatos({
          expedientes: delProyecto.filter((e) => e.estado !== "cerrado"),
          documentos: (evidencias || [])
            .filter((ev) => ev.expedienteId in porExpediente)
            .map((ev) => ({ ...ev, empresaId: porExpediente[ev.expedienteId] })),
        });
      })
      .catch(() => { if (activo) setDatos(null); });
    return () => { activo = false; };
  }, [proyectoId, version]);

  const nombreEmpresa = (empresaId) => participantes.find((p) => p.empresaId === empresaId)?.empresaNombre || "-";

  const cerrar = () => {
    setAbierto(false);
    setForm(FORM_VACIO);
    setArchivo(null);
    setError(null);
  };

  const expedienteElegido = datos?.expedientes?.find((e) => e.id === form.expedienteId) || null;
  const sujetosEmpresa = expedienteElegido
    ? sujetos.filter((a) => a.participacionId === expedienteElegido.participacionId) : [];
  const [tipoSujeto, idSujeto] = form.sujeto.split(":");

  // Requerimientos a los que se puede adjuntar: las instancias activas del sujeto elegido en ese
  // Expediente (las mismas filas de la planilla de evaluación).
  const claveElegibles = form.expedienteId ? `${form.expedienteId}|${form.sujeto}` : null;
  useEffect(() => {
    if (!claveElegibles) return undefined;
    let activo = true;
    const filtro = tipoSujeto === "persona" ? { personaId: idSujeto }
      : tipoSujeto === "recurso" ? { recursoId: idSujeto } : { empresa: true };
    expedienteService.listarRequerimientos(form.expedienteId, filtro)
      .then((instancias) => { if (activo) setElegibles({ clave: claveElegibles, instancias: instancias || [] }); })
      .catch(() => { if (activo) setElegibles({ clave: claveElegibles, instancias: [] }); });
    return () => { activo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveElegibles]);
  const requerimientosElegibles = elegibles.clave === claveElegibles ? elegibles.instancias : [];
  const requerimientoElegido = requerimientosElegibles.find((r) => r.id === form.instanciaId);

  const handleSubir = async () => {
    if (!form.expedienteId || !form.instanciaId || !archivo) {
      setError("Elija la Empresa, el requerimiento y un archivo.");
      return;
    }
    setSubiendo(true);
    setError(null);
    try {
      await evidenciaService.subirYVincular({
        expedienteId: form.expedienteId,
        archivo,
        expedienteRequerimientoId: form.instanciaId,
        personaId: tipoSujeto === "persona" ? idSujeto : null,
        recursoId: tipoSujeto === "recurso" ? idSujeto : null,
        fechaVencimiento: requerimientoElegido?.requiereVencimiento ? form.fechaVencimiento : null,
      });
      cerrar();
      setVersion((v) => v + 1);
      onCambio?.();
    } catch (err) {
      setError(err.message || "No se pudo subir el documento.");
    } finally {
      setSubiendo(false);
    }
  };

  if (datos === undefined) return <p className="text-xs text-slate-400 py-6 text-center">Cargando documentos...</p>;
  if (datos === null) return <p className="text-xs text-red-600 py-6 text-center">No se pudieron cargar los documentos.</p>;

  const formularioSubida = modoEdicion && (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Subir documento</h3>
        {!abierto && (
          <ActionButton variant="primary" icon={Upload} onClick={() => setAbierto(true)} disabled={datos.expedientes.length === 0}>
            Subir documento
          </ActionButton>
        )}
      </div>
      {datos.expedientes.length === 0 && (
        <p className="text-xs text-slate-400">Este proyecto no tiene expedientes abiertos donde adjuntar documentos.</p>
      )}
      {abierto && (
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Empresa *</label>
              <select
                value={form.expedienteId}
                onChange={(e) => setForm({ ...FORM_VACIO, expedienteId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="">Seleccione una Empresa...</option>
                {datos.expedientes.map((e) => <option key={e.id} value={e.id}>{nombreEmpresa(e.empresaId)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Corresponde a *</label>
              <select
                value={form.sujeto}
                onChange={(e) => setForm((p) => ({ ...p, sujeto: e.target.value, instanciaId: "" }))}
                disabled={!form.expedienteId}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white disabled:bg-slate-100"
              >
                <option value="empresa">La Empresa</option>
                {[...new Set(sujetosEmpresa.filter((a) => a.personaId).map((a) => a.personaId))].map((pid) => {
                  const p = personas.find((x) => x.id === pid);
                  return <option key={pid} value={`persona:${pid}`}>Persona: {p ? `${p.nombre} ${p.apellido}` : pid}</option>;
                })}
                {[...new Set(sujetosEmpresa.filter((a) => a.recursoId).map((a) => a.recursoId))].map((rid) => {
                  const r = recursos.find((x) => x.id === rid);
                  return <option key={rid} value={`recurso:${rid}`}>Maquinaria: {r?.nombre || rid}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Requerimiento *</label>
              <select
                value={form.instanciaId}
                onChange={(e) => setForm((p) => ({ ...p, instanciaId: e.target.value }))}
                disabled={!form.expedienteId}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white disabled:bg-slate-100"
              >
                <option value="">Seleccione un requerimiento...</option>
                {requerimientosElegibles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Archivo *</label>
              <input
                type="file"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                className="w-full text-xs file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-primary-lighter file:text-primary-dark file:font-semibold"
              />
            </div>
            {requerimientoElegido?.requiereVencimiento && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha de vencimiento</label>
                <DateInput
                  value={form.fechaVencimiento}
                  onChange={(e) => setForm((p) => ({ ...p, fechaVencimiento: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ActionButton variant="primary" busy={subiendo} busyLabel="Subiendo..." onClick={handleSubir}>
              Subir
            </ActionButton>
            <ActionButton disabled={subiendo} onClick={cerrar}>Cancelar</ActionButton>
          </div>
        </div>
      )}
    </div>
  );

  if (datos.documentos.length === 0) {
    return (
      <div className="space-y-6">
        {formularioSubida}
        <div className="bg-white p-10 rounded-2xl border border-slate-100 shadow-card text-center space-y-2">
          <FileText className="w-6 h-6 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-400">Aún no hay documentos a nivel Proyecto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {formularioSubida}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-6">Empresa</th>
              <th className="py-3 px-6">Documento</th>
              <th className="py-3 px-6">Vencimiento</th>
              <th className="py-3 px-6">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {datos.documentos.map((d) => (
              <tr key={d.id}>
                <td className="py-3 px-6 font-bold text-carbon-dark">{nombreEmpresa(d.empresaId)}</td>
                <td className="py-3 px-6">
                  {d.archivoUrl ? (
                    <a href={d.archivoUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-dark font-semibold">
                      {d.archivoNombre || "Documento"}
                    </a>
                  ) : (d.archivoNombre || "-")}
                </td>
                <td className="py-3 px-6 text-slate-600">{d.fechaVencimiento ? formatFecha(d.fechaVencimiento) : "-"}</td>
                <td className="py-3 px-6 text-slate-600 capitalize">{d.estado || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
