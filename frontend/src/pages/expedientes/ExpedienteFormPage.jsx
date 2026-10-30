import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileCheck2, ArrowLeft, AlertCircle, Building2, FolderKanban, IdCard, Calendar } from "lucide-react";
import { expedienteService } from "../../services/expedienteService";
import { participacionService } from "../../services/participacionService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilRequerimientoService } from "../../services/perfilRequerimientoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { acreditacionService } from "../../services/acreditacionService";
import { formatFecha, aFechaISO, hoyISO } from "../../utils/fechas";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { EmpresaChip } from "../../components/shared/EmpresaChip";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { TIPOS_ENTIDAD } from "../../services/requerimientoService";

// Dato de solo lectura (mismo estilo atenuado que los campos no editables del resto del sistema).
const Dato = ({ icon: Icon, etiqueta, children }) => (
  <div className="min-w-0">
    <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
      <Icon className="w-3.5 h-3.5 text-slate-400" /> {etiqueta}
    </label>
    <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600 cursor-not-allowed min-h-[2.75rem] flex flex-col justify-center">
      {children}
    </div>
  </div>
);

export const ExpedienteFormPage = () => {
  const navigate = useNavigate();
  // ?participacionId= preselecciona la Participación (p. ej. desde su Detalle). Solo se respeta si sigue
  // siendo elegible (activa y sin Expediente en curso).
  const [searchParams] = useSearchParams();

  const [participaciones, setParticipaciones] = useState([]);
  const [proyectosMap, setProyectosMap] = useState({});
  const [empresasMap, setEmpresasMap] = useState({});
  const [empresasInfo, setEmpresasInfo] = useState({});
  const [proyectosInfo, setProyectosInfo] = useState({});
  const [cargandoOpciones, setCargandoOpciones] = useState(true);

  const [participacionId, setParticipacionId] = useState(searchParams.get("participacionId") || "");
  const [preview, setPreview] = useState([]);
  const [cargandoPreview, setCargandoPreview] = useState(false);

  const [error, setError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cargarOpciones = async () => {
      setError(null);
      try {
        const [activas, expedientes, proyectos, empresas] = await Promise.all([
          participacionService.listar({ estado: "activa" }),
          expedienteService.listar({}),
          proyectoService.listar({}),
          empresaService.listar(),
        ]);

        const conExpedienteEnCurso = new Set(
          (expedientes || [])
            .filter((e) => e.estado !== "cerrado")
            .map((e) => e.participacionId),
        );
        const elegibles = (activas || []).filter((p) => !conExpedienteEnCurso.has(p.id));
        setParticipaciones(elegibles);
        setParticipacionId((actual) => (elegibles.some((p) => p.id === actual) ? actual : ""));

        const pMap = {};
        const pInfo = {};
        (proyectos || []).forEach((p) => { pMap[p.id] = `${p.nombre} (${p.codigo})`; pInfo[p.id] = p; });
        setProyectosMap(pMap);
        setProyectosInfo(pInfo);

        const eMap = {};
        const eInfo = {};
        (empresas || []).forEach((e) => { eMap[e.id] = e.razonSocial; eInfo[e.id] = e; });
        setEmpresasMap(eMap);
        setEmpresasInfo(eInfo);
      } catch (err) {
        console.error("Error al cargar participaciones elegibles:", err);
        setError(err.message || "No se pudieron cargar las participaciones disponibles.");
      } finally {
        setCargandoOpciones(false);
      }
    };
    cargarOpciones();
  }, []);

  useEffect(() => {
    if (!participacionId) {
      setPreview([]);
      return;
    }
    const participacion = participaciones.find((p) => p.id === participacionId);
    if (!participacion) {
      setPreview([]);
      return;
    }

    setCargandoPreview(true);
    perfilRequerimientoService
      .obtenerMatriz(participacion.perfilParticipacionId)
      .then((data) => setPreview((data || []).filter((r) => r.vinculado)))
      .catch((err) => {
        console.error("Error al cargar preview de requerimientos:", err);
        setPreview([]);
      })
      .finally(() => setCargandoPreview(false));
  }, [participacionId, participaciones]);

  // Contexto de la Participación elegida: Mandante, Perfil y requisitos estimados. Los requisitos salen
  // del mismo cálculo que congela el Expediente (perfilParticipacionService.listarRequerimientos) y la
  // reutilización del mismo previewNueva del wizard (solo lectura), sin Personas/Maquinarias.
  const [contexto, setContexto] = useState(null);
  const [cargandoContexto, setCargandoContexto] = useState(false);

  useEffect(() => {
    const participacion = participaciones.find((p) => p.id === participacionId);
    if (!participacion) {
      setContexto(null);
      return undefined;
    }
    let vigente = true;
    setCargandoContexto(true);
    setContexto(null);
    Promise.all([
      mandanteService.obtenerPorId(participacion.mandanteId).catch(() => null),
      perfilParticipacionService.obtenerPorId(participacion.perfilParticipacionId).catch(() => null),
      perfilParticipacionService.listarRequerimientos(participacion.perfilParticipacionId).catch(() => []),
      acreditacionService
        .previewNueva({
          empresaId: participacion.empresaId,
          perfilParticipacionId: participacion.perfilParticipacionId,
          fechaInicio: aFechaISO(participacion.fechaInicio) || hoyISO(),
          seleccion: [],
        })
        .then((d) => d?.empresa || null)
        .catch(() => null),
    ])
      .then(([mandante, perfil, requisitos, empresaPreview]) => {
        if (vigente) setContexto({ mandante, perfil, requisitos, empresaPreview });
      })
      .finally(() => { if (vigente) setCargandoContexto(false); });
    return () => { vigente = false; };
  }, [participacionId, participaciones]);

  const participacionSel = participaciones.find((p) => p.id === participacionId) || null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    if (!participacionId) {
      setError("Debe seleccionar una Participación.");
      return;
    }

    setLoading(true);
    try {
      await expedienteService.crear({ participacionId });
      navigate("/expedientes");
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const previewPorNivel = (nivel) => preview
    .filter((r) => r.tipoEntidad === nivel)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header de página */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/expedientes")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Nuevo Expediente</h2>
            <p className="text-xs text-gray-500">Inicie el proceso de acreditación para una Participación activa.</p>
          </div>
        </div>
      </div>

      {(error || serverError) && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{serverError || error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <FileCheck2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Paso 1 · Participación</h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Participación *</label>
            <select
              value={participacionId}
              onChange={(e) => setParticipacionId(e.target.value)}
              disabled={cargandoOpciones}
              className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100"
            >
              <option value="">
                {cargandoOpciones ? "Cargando..." : "Seleccione una Participación..."}
              </option>
              {participaciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {empresasMap[p.empresaId] || p.empresaId} — {proyectosMap[p.proyectoId] || p.proyectoId}
                </option>
              ))}
            </select>
            {!cargandoOpciones && participaciones.length === 0 && (
              <p className="text-xs text-slate-400 mt-1">
                No hay Participaciones activas disponibles (sin un Expediente ya en curso).
              </p>
            )}
          </div>
        </div>

        {/* Paso 2: solo lectura. Siempre refleja exactamente la Participación elegida en el Paso 1;
            nunca es una fuente independiente (el backend deriva Mandante/Proyecto/Empresa/Perfil de la
            Participación al crear el Expediente, el formulario solo envía su id). */}
        <div className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4 ${participacionSel ? "" : "opacity-70"}`}>
          <div className="pb-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Paso 2 · Datos de la Participación</h3>
            <p className="text-[11px] text-slate-400 mt-1">
              {participacionSel
                ? "Datos de la Participación elegida (solo lectura)."
                : "Se completará al elegir la Participación del Paso 1."}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Dato icon={Building2} etiqueta="Mandante">
              {!participacionSel ? "—" : cargandoContexto || !contexto ? (
                <span className="inline-block h-4 w-28 rounded bg-slate-200 animate-pulse" />
              ) : contexto.mandante ? (
                <MandanteChip nombre={getMandanteDisplayName(contexto.mandante)} logoUrl={contexto.mandante.logoUrl || null} />
              ) : "-"}
            </Dato>
            <Dato icon={FolderKanban} etiqueta="Proyecto">
              {!participacionSel ? "—" : (
                <>
                  {proyectosInfo[participacionSel.proyectoId]?.nombre || participacionSel.proyectoId}
                  {proyectosInfo[participacionSel.proyectoId]?.codigo && (
                    <span className="text-[11px] text-slate-500 font-mono">{proyectosInfo[participacionSel.proyectoId].codigo}</span>
                  )}
                </>
              )}
            </Dato>
            <Dato icon={Building2} etiqueta="Empresa">
              {!participacionSel ? "—" : (
                <>
                  <EmpresaChip
                    nombre={empresasInfo[participacionSel.empresaId]?.razonSocial || participacionSel.empresaId}
                    logoUrl={empresasInfo[participacionSel.empresaId]?.logoUrl || null}
                    conIniciales
                  />
                  {empresasInfo[participacionSel.empresaId]?.rut && (
                    <span className="text-[11px] text-slate-500 font-mono">{formatRutDisplay(empresasInfo[participacionSel.empresaId].rut)}</span>
                  )}
                </>
              )}
            </Dato>
            <Dato icon={IdCard} etiqueta="Tipo de participación">
              {!participacionSel ? "—" : cargandoContexto || !contexto ? (
                <span className="inline-block h-4 w-28 rounded bg-slate-200 animate-pulse" />
              ) : (contexto.perfil?.nombre || "-")}
            </Dato>
            <Dato icon={Calendar} etiqueta="Fecha de inicio">
              {participacionSel ? formatFecha(participacionSel.fechaInicio) : "—"}
            </Dato>
            <Dato icon={FileCheck2} etiqueta="Requisitos estimados">
              {!participacionSel ? "—" : cargandoContexto || !contexto ? (
                <span className="inline-block h-4 w-28 rounded bg-slate-200 animate-pulse" />
              ) : (
                <>
                  {contexto.requisitos.length} {contexto.requisitos.length === 1 ? "requisito" : "requisitos"}
                  {contexto.empresaPreview && contexto.empresaPreview.total > 0 && (
                    <span className="text-[11px] text-slate-500">
                      {contexto.empresaPreview.reutilizables} de {contexto.empresaPreview.total} de nivel Empresa cubiertos por reutilización ·{" "}
                      {contexto.empresaPreview.total - contexto.empresaPreview.reutilizables} pendientes
                    </span>
                  )}
                </>
              )}
            </Dato>
          </div>
        </div>

        {participacionId && (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">
              Requerimientos que se generarán
            </h3>
            {cargandoPreview ? (
              <p className="text-xs text-slate-400">Cargando preview...</p>
            ) : preview.length === 0 ? (
              <p className="text-xs text-slate-400">
                El Perfil de Participación asociado no tiene Requerimientos activos vinculados — el Expediente se creará sin requerimientos aplicables.
              </p>
            ) : (
              <div className="space-y-4">
                {TIPOS_ENTIDAD.map((nivel) => {
                  const items = previewPorNivel(nivel.value);
                  if (items.length === 0) return null;
                  return (
                    <div key={nivel.value}>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{nivel.label}</p>
                      <ul className="space-y-1">
                        {items.map((r, idx) => (
                          <li key={r.id} className="text-xs text-slate-700 font-medium">
                            <span className="text-slate-400 font-semibold">{idx + 1}.</span> {r.nombreCorto || r.nombre}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/expedientes")}
            className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !participacionId}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Crear Expediente"}
          </button>
        </div>
      </form>
    </div>
  );
};
