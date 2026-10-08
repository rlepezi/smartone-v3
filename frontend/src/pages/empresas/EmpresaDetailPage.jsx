import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Users, Truck, ClipboardCheck, FileText, Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { empresaService } from "../../services/empresaService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { evaluacionService, RESULTADOS_EVALUACION } from "../../services/evaluacionService";
import { expedienteService } from "../../services/expedienteService";
import { reporteService } from "../../services/reporteService";
import { participacionService } from "../../services/participacionService";
import { sujetoService, nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";
import { mandanteService } from "../../services/mandanteService";
import { proyectoService } from "../../services/proyectoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { formatFecha } from "../../utils/fechaFormatters";
import { evaluarSujeto } from "../../utils/evaluacionSujeto";
import { aplicaRequerimientoASujeto } from "../../utils/aplicabilidadRequerimiento";
import { estadoPorCumplimiento, claseAnilloCumplimiento } from "../../utils/cumplimientoClases";
import { KpiCard, KpiValor, TarjetaPanel, CampoInfo } from "../../components/shared/DetalleUI";
import { Tabs } from "../../components/shared/Tabs";
import { ProgressRing } from "../../components/shared/ProgressRing";
import { EmpresaChip } from "../../components/shared/EmpresaChip";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { ActionButton } from "../../components/shared/ActionButton";
import { NuevaParticipacionModal } from "../../components/shared/NuevaParticipacionModal";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import {
  StatusBadge, MAPA_EVALUACION, MAPA_ACTIVO_INACTIVO, MAPA_ESTADO_PARTICIPACION,
} from "../../components/shared/StatusBadge";
import { UltimosEventos, HistorialEventos } from "../../components/shared/EventosBitacora";
import { GrupoRequerimientos } from "../../components/shared/RequerimientosLista";
import { BotonesEdicion } from "../../components/shared/BotonesEdicion";
import { EmpresaEdicionForm } from "../../components/empresas/EmpresaEdicionForm";
import { MandantesAsociadosPanel } from "../../components/empresas/MandantesAsociadosPanel";
import { useEdicionInPlace } from "../../hooks/useEdicionInPlace";
import { RecursosBloques } from "../../components/shared/RecursosBloques";
import { ParticipantesCell } from "../../components/shared/ParticipantesCell";
import { BarraCumplimiento } from "../../components/proyectos/EmpresasParticipantesTable";

// Mismos roles que ya exige el backend en POST /evaluaciones: mandante_admin
// es intencionalmente solo lectura acá (no evalúa a sus propias contratistas).
const ROLES_ESCRITURA = ["superadmin", "mandante_admin", "admin_comercial"];
const ROLES_EVALUACION = ["superadmin", "evaluador"];
// Gestión de la asociación Empresa-Mandante (pestaña Mandantes).
const ROLES_GESTION_MANDANTES = ["superadmin", "admin_comercial"];

// Espejo de MAPEO_ESTADO_KPI_EMPRESA (reporteService.js) y del listado de
// Empresas: estado del Expediente más reciente -> categoría de acreditación.
const CATEGORIA_ACREDITACION = {
  aprobado: "acreditada",
  en_ejecucion: "acreditada",
  cerrado: "acreditada",
  creado: "en_proceso",
  en_revision: "en_proceso",
  con_observaciones: "con_observaciones",
};

const ACREDITACION_MAP = {
  acreditada: { label: "Acreditada", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  en_proceso: { label: "En Proceso", className: "bg-amber-50 text-amber-700 border-amber-200" },
  con_observaciones: { label: "Con Observaciones", className: "bg-red-50 text-red-700 border-red-200" },
};

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "mandantes", label: "Mandantes" },
  { key: "proyectos", label: "Proyectos" },
  { key: "recursos", label: "Recursos" },
  { key: "documentacion", label: "Documentación" },
  { key: "historial", label: "Historial" },
];

export const EmpresaDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);
  const puedeEvaluar = ROLES_EVALUACION.includes(profile?.rol);
  const gestionaMandantes = ROLES_GESTION_MANDANTES.includes(profile?.rol);

  const [tab, setTab] = useState("resumen");

  const {
    modoEdicion, iniciarEdicion, cancelar, alGuardar, confirmarSalida,
    guardando, setGuardando, setHayCambiosSinGuardar,
  } = useEdicionInPlace({ puedeEditar: puedeEscribir, onGuardado: async () => { setEmpresa(await empresaService.obtenerPorId(id)); } });
  // Ficha completa de cada Mandante (razón social, RUT, contacto), por id.
  const [mandantesDetalle, setMandantesDetalle] = useState({});
  // Proyecto elegido en la pestaña Proyectos (null = se ven los de todos).
  const [proyectoSeleccionadoId, setProyectoSeleccionadoId] = useState(null);
  const [mostrandoNuevaParticipacion, setMostrandoNuevaParticipacion] = useState(false);
  const [empresa, setEmpresa] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Resumen (Participaciones activas con Proyecto/Perfil/Mandante y
  // totales) y fila de la Empresa en el reporte de cumplimiento.
  const [resumen, setResumen] = useState(null);
  const [filaReporte, setFilaReporte] = useState(undefined); // undefined = cargando
  const [cargandoResumen, setCargandoResumen] = useState(true);

  // Todas las Participaciones (cualquier estado) + catálogos para nombrarlas.
  const [participaciones, setParticipaciones] = useState([]);
  const [proyectosMap, setProyectosMap] = useState({});
  const [perfilesMap, setPerfilesMap] = useState({});

  const [personasEmpresa, setPersonasEmpresa] = useState([]);
  const [recursosEmpresa, setRecursosEmpresa] = useState([]);
  const [evaluacionesEmpresa, setEvaluacionesEmpresa] = useState([]);
  const [expedientesEmpresa, setExpedientesEmpresa] = useState([]);
  const [sujetosEmpresa, setSujetosEmpresa] = useState([]);
  const perfilesPorId = usePerfilesRecurso();
  const [cargandoActividad, setCargandoActividad] = useState(true);

  // Evaluación inline de un Requerimiento de nivel Empresa — mismo
  // formulario y endpoint (evaluacionService.crear) que ya usaba la pantalla
  // combinada anterior.
  const [evaluacionAbierta, setEvaluacionAbierta] = useState(null); // {expedienteId, requerimientoId}
  const [resultadoForm, setResultadoForm] = useState(RESULTADOS_EVALUACION[0]?.value || "");
  const [observacionesForm, setObservacionesForm] = useState("");
  // Método de verificación: "" = documental (hay evidencia adjunta; el backend lo comprueba);
  // "presencial"/"otro" = sin documento, con justificación obligatoria en Observaciones.
  const [metodoForm, setMetodoForm] = useState("");
  const [evaluando, setEvaluando] = useState(false);
  const [errorEvaluacion, setErrorEvaluacion] = useState(null);

  const cargarResumenYAvance = () => {
    const p1 = empresaService
      .obtenerResumen(id)
      .then(setResumen)
      .catch((err) => console.error("Error al cargar el resumen de la empresa:", err));

    const p2 = reporteService
      .obtenerResumen({})
      .then((data) => setFilaReporte((data?.porEmpresa || []).find((r) => r.empresaId === id) || null))
      .catch((err) => {
        console.error("Error al cargar el avance de cumplimiento:", err);
        setFilaReporte(null);
      });

    return Promise.all([p1, p2]);
  };

  const cargarActividad = () => {
    return Promise.all([
      personaService.listar(undefined, id),
      recursoService.listar(undefined, id),
      evaluacionService.listarGlobal({ empresaId: id }),
      // expedienteService.listar no filtra por empresaId: se trae lo
      // alcanzable por el actor y se acota acá.
      expedienteService.listar({}),
      sujetoService.listar({ empresaId: id, estado: "activa" }),
    ]).then(([personasData, recursosData, evaluacionesData, expedientesData, sujetosData]) => {
      setPersonasEmpresa(personasData || []);
      setRecursosEmpresa(recursosData || []);
      setEvaluacionesEmpresa(evaluacionesData || []);
      setExpedientesEmpresa((expedientesData || []).filter((e) => e.empresaId === id));
      // El backend no filtra por empresaId para roles de Mandante: se acota acá.
      setSujetosEmpresa((sujetosData || []).filter((a) => a.empresaId === id));
    });
  };

  useEffect(() => {
    setCargando(true);
    empresaService
      .obtenerPorId(id)
      .then(setEmpresa)
      .catch((err) => setError(err.message || "No se pudo cargar la empresa."))
      .finally(() => setCargando(false));

    cargarResumenYAvance().finally(() => setCargandoResumen(false));
    cargarActividad()
      .catch((err) => console.error("Error al cargar Personas/Maquinarias de la empresa:", err))
      .finally(() => setCargandoActividad(false));

    // Para mandante_admin/lector el backend ignora el filtro empresaId (fuerza
    // su Mandante), así que se acota acá a esta Empresa.
    participacionService
      .listar({ empresaId: id })
      .then((data) => setParticipaciones((data || []).filter((p) => p.empresaId === id)))
      .catch((err) => console.error("Error al cargar participaciones:", err));
    proyectoService
      .listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = p; });
        setProyectosMap(map);
      })
      .catch((err) => console.error("Error al cargar proyectos:", err));
    perfilParticipacionService
      .listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = p; });
        setPerfilesMap(map);
      })
      .catch((err) => console.error("Error al cargar perfiles de participación:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const idsMandanteKey = [...new Set((resumen?.participacionesActivas || []).map((p) => p.mandanteId).filter(Boolean))].join(",");
  useEffect(() => {
    if (!idsMandanteKey) return;
    idsMandanteKey.split(",").forEach((mid) => {
      mandanteService
        .obtenerPorId(mid)
        .then((data) => setMandantesDetalle((prev) => ({ ...prev, [mid]: data })))
        .catch(() => setMandantesDetalle((prev) => ({ ...prev, [mid]: null })));
    });
  }, [idsMandanteKey]);

  // Requerimientos de nivel Empresa agrupados por Proyecto/Expediente (una
  // Empresa con Participaciones en varios Proyectos puede tener Perfiles —
  // y Requerimientos — distintos en cada uno).
  const requerimientosPorProyecto = expedientesEmpresa
    .filter((exp) => exp.estado !== "cerrado")
    .map((exp) => {
      const participacion = (resumen?.participacionesActivas || [])
        .find((p) => p.proyectoId === exp.proyectoId);
      const items = (exp.requerimientosAplicables || [])
        .filter((r) => aplicaRequerimientoASujeto(r, { tipoEntidad: "empresa" }))
        .map((r) => {
          const vigente = evaluacionesEmpresa.find(
            (ev) => ev.expedienteId === exp.id && ev.requerimientoId === r.requerimientoId &&
              !ev.personaId && !ev.recursoId,
          );
          return { ...r, resultado: vigente?.resultado || "pendiente" };
        });
      const cumplen = items.filter((r) => r.resultado === "cumple").length;
      return {
        expedienteId: exp.id,
        proyectoId: exp.proyectoId,
        proyectoNombre: participacion?.proyectoNombre || exp.proyectoId,
        perfilNombre: participacion?.perfilNombre || null,
        items,
        pctCumple: items.length > 0 ? Math.round((cumplen / items.length) * 100) : null,
      };
    })
    .filter((grupo) => grupo.items.length > 0);

  // Recursos agrupados por Proyecto (misma vista que el detalle de Proyecto,
  // que los agrupa por Empresa).
  const construirBloquesRecursos = (subTab) => {
    const esPersonas = subTab === "personas";
    const campo = esPersonas ? "personaId" : "recursoId";
    const vigentes = evaluacionesEmpresa.filter((ev) => ev.estado === "vigente");

    return participaciones
      .filter((p) => p.estado === "activa")
      .map((p) => {
        const expediente = expedientesEmpresa.find((e) => e.proyectoId === p.proyectoId && e.estado !== "cerrado");
        const filas = sujetosEmpresa
          .filter((a) => a.participacionId === p.id && a[campo])
          .map((a) => {
            const sujeto = esPersonas
              ? personasEmpresa.find((x) => x.id === a.personaId)
              : recursosEmpresa.find((x) => x.id === a.recursoId);
            return {
              key: a.id,
              nombre: esPersonas
                ? (sujeto ? `${sujeto.nombre} ${sujeto.apellido}` : a.personaId)
                : (sujeto?.nombre || a.recursoId),
              secundario: esPersonas ? (sujeto?.rut ? formatRutDisplay(sujeto.rut) : "") : (sujeto?.patente || ""),
              clasificacion: nombresPerfiles(a.perfilRecursoIds, perfilesPorId) || (sujeto?.tipo ? formatCatalogo(sujeto.tipo) : ""),
              evaluacion: evaluarSujeto({ expediente, vigentes, campo, sujetoId: a[campo], perfilRecursoIds: a.perfilRecursoIds }),
            };
          });
        return {
          key: p.id,
          titulo: proyectosMap[p.proyectoId]?.nombre || "-",
          subtitulo: `${formatFecha(p.fechaInicio)} – ${p.fechaTermino ? formatFecha(p.fechaTermino) : "sin término"}`,
          perfil: perfilesMap[p.perfilParticipacionId]?.nombre || null,
          filas,
        };
      });
  };

  const gruposVisibles = requerimientosPorProyecto.filter(
    (grupo) => !proyectoSeleccionadoId || grupo.proyectoId === proyectoSeleccionadoId,
  );

  const abrirEvaluacion = (expedienteId, requerimientoId) => {
    setEvaluacionAbierta({ expedienteId, requerimientoId });
    setResultadoForm(RESULTADOS_EVALUACION[0]?.value || "");
    setObservacionesForm("");
    setMetodoForm("");
    setErrorEvaluacion(null);
  };

  const cerrarEvaluacion = () => {
    setEvaluacionAbierta(null);
    setErrorEvaluacion(null);
  };

  const handleGuardarEvaluacion = async () => {
    if (!resultadoForm) {
      setErrorEvaluacion("Debe seleccionar un resultado.");
      return;
    }
    if (metodoForm && !observacionesForm.trim()) {
      setErrorEvaluacion("Sin documento adjunto, la justificación (Observaciones) es obligatoria.");
      return;
    }
    setEvaluando(true);
    setErrorEvaluacion(null);
    try {
      await evaluacionService.crear({
        expedienteId: evaluacionAbierta.expedienteId,
        requerimientoId: evaluacionAbierta.requerimientoId,
        resultado: resultadoForm,
        observaciones: observacionesForm.trim() || null,
        ...(metodoForm ? { metodoVerificacion: metodoForm } : {}),
      });
      await Promise.all([cargarActividad(), cargarResumenYAvance()]);
      cerrarEvaluacion();
    } catch (err) {
      console.error("Error al guardar la evaluación:", err);
      setErrorEvaluacion(err.message || "No se pudo guardar la evaluación.");
    } finally {
      setEvaluando(false);
    }
  };

  if (cargando) {
    return <div className="max-w-7xl mx-auto py-16 text-center text-slate-400 text-xs">Cargando empresa...</div>;
  }
  if (!empresa) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <ErrorBanner message={error || "Empresa no encontrada."} />
      </div>
    );
  }

  // --- Derivados (todo sale de `resumen` / `filaReporte`) ---
  const participacionesActivas = resumen?.participacionesActivas || [];
  const avance = filaReporte === undefined ? undefined : filaReporte?.avancePct ?? null;
  const categoria = CATEGORIA_ACREDITACION[filaReporte?.expedienteEstado] || null;

  // Mandantes DISTINTOS entre las Participaciones activas, con cuántos
  // Proyectos activos tiene la Empresa en cada uno.
  const mandantes = [];
  participacionesActivas.forEach((p) => {
    if (!p.mandanteId) return;
    let m = mandantes.find((x) => x.mandanteId === p.mandanteId);
    if (!m) {
      m = { mandanteId: p.mandanteId, nombre: p.mandanteNombre, logoUrl: p.mandanteLogoUrl, proyectoIds: new Set() };
      mandantes.push(m);
    }
    m.proyectoIds.add(p.proyectoId);
  });

  // Desglose del donut: una Participación activa por estado según su propio
  // % de cumplimiento (mismos umbrales que el resto del sistema).
  const conteoEstados = { acreditado: 0, en_proceso: 0, pendiente: 0, sin_evaluar: 0 };
  participacionesActivas.forEach((p) => {
    conteoEstados[estadoPorCumplimiento(p.evaluacion?.avancePct ?? null).clave]++;
  });
  const colorAnillo = claseAnilloCumplimiento;

  const cargando0 = cargandoResumen;

  const tarjetaKpi = (titulo, contenido, subtexto) => (
    <KpiCard titulo={titulo} subtexto={subtexto}>{contenido}</KpiCard>
  );
  const valorKpi = (valor, listo = !cargando0) => <KpiValor valor={valor} listo={listo} />;
  const tarjetaCard = (titulo, hijos, Icono) => (
    <TarjetaPanel titulo={titulo} Icono={Icono}>{hijos}</TarjetaPanel>
  );
  const campoInfo = (etiqueta, valor) => <CampoInfo etiqueta={etiqueta}>{valor}</CampoInfo>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => { if (confirmarSalida()) navigate("/empresas"); }}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              <EmpresaChip nombre={empresa.razonSocial} logoUrl={empresa.logoUrl} />
            </h2>
            <p className="text-xs text-gray-500 font-mono">{formatRutDisplay(empresa.rut)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={empresa.estado} map={MAPA_ACTIVO_INACTIVO} />
          {puedeEscribir && (
            <BotonesEdicion
              modoEdicion={modoEdicion}
              guardando={guardando}
              formId="empresa-edicion-form"
              onEditar={iniciarEdicion}
              onCancelar={cancelar}
            />
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* Franja de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {tarjetaKpi(
          "Acreditación",
          filaReporte === undefined ? valorKpi(null, false) : (
            categoria
              ? <StatusBadge value={categoria} map={ACREDITACION_MAP} />
              : <span className="text-xs text-slate-400 italic">Sin expediente</span>
          ),
          filaReporte ? `${filaReporte.evaluados} evaluados` : null,
        )}
        {tarjetaKpi("Mandantes", valorKpi(mandantes.length), "distintos")}
        {tarjetaKpi("Proyectos", valorKpi(resumen?.proyectosCount ?? "-"), "activos")}
        {tarjetaKpi(
          "Recursos",
          cargando0 ? valorKpi(null, false) : (
            <div className="flex items-end gap-5">
              {[
                { label: "Personas", Icono: Users, valor: resumen?.personasCount ?? "-" },
                { label: "Maquinarias", Icono: Truck, valor: resumen?.recursosCount ?? "-" },
              ].map(({ label, Icono, valor }) => (
                <div key={label}>
                  <div className="flex items-center gap-1.5">
                    <Icono className="w-4 h-4 text-slate-400" />
                    <span className="text-2xl font-black text-carbon-dark tracking-tight">{valor}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          ),
        )}
        {tarjetaKpi(
          "Cumplimiento",
          avance === undefined ? (
            <div className="h-14 w-14 rounded-full bg-slate-100 animate-pulse" />
          ) : (
            <div className="relative w-14 h-14">
              <ProgressRing value={avance || 0} size={56} strokeWidth={6} progressClassName={colorAnillo(avance)} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-carbon-dark">
                {avance === null ? "—" : `${avance}%`}
              </span>
            </div>
          ),
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* ---------------- Resumen ---------------- */}
      {/* Modo edición: el formulario vive en Resumen pero sigue montado al cambiar de
          pestaña (así no se pierden los cambios sin guardar). */}
      {modoEdicion && (
        <div className={tab === "resumen" ? "" : "hidden"}>
          <EmpresaEdicionForm
            idEntidad={empresa.id}
            formId="empresa-edicion-form"
            enDetalle
            onGuardado={alGuardar}
            onDirtyChange={setHayCambiosSinGuardar}
            onGuardandoChange={setGuardando}
          />
        </div>
      )}

      {!modoEdicion && tab === "resumen" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-6 min-w-0">
            {tarjetaCard("Información de la Empresa", (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campoInfo("Razón Social", empresa.razonSocial)}
                {campoInfo("RUT", <span className="font-mono">{formatRutDisplay(empresa.rut)}</span>)}
                {campoInfo("Nombre Fantasía", empresa.nombreFantasia)}
                {campoInfo("Giro", empresa.giro)}
                {campoInfo("Teléfono", empresa.contacto?.telefono)}
              </div>
            ))}

            {tarjetaCard("Participaciones", (
              participaciones.length === 0 ? (
                <p className="text-xs text-slate-400">Esta empresa no tiene participaciones.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-2.5 px-4">Proyecto</th>
                        <th className="py-2.5 px-4">Perfil</th>
                        <th className="py-2.5 px-4">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {participaciones.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 px-4 font-bold text-carbon-dark">
                            {proyectosMap[p.proyectoId] ? (
                              <Link to={`/proyectos/${p.proyectoId}`} className="hover:text-primary transition-colors">
                                {proyectosMap[p.proyectoId].nombre}
                              </Link>
                            ) : "-"}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{perfilesMap[p.perfilParticipacionId]?.nombre || "Sin perfil"}</td>
                          <td className="py-2.5 px-4"><StatusBadge value={p.estado} map={MAPA_ESTADO_PARTICIPACION} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ))}
          </div>

          <div className="space-y-6 min-w-0">
            {tarjetaCard("Cumplimiento", (
              avance === undefined || cargando0 ? (
                <p className="text-xs text-slate-400">Cargando...</p>
              ) : (
                <div className="space-y-4">
                  <div className="relative w-28 h-28 mx-auto">
                    <ProgressRing value={avance || 0} size={112} strokeWidth={10} progressClassName={colorAnillo(avance)} />
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-carbon-dark">
                      {avance === null ? "—" : `${avance}%`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { clave: "acreditado", label: "Acreditadas", punto: "bg-sage-dark" },
                      { clave: "en_proceso", label: "En proceso", punto: "bg-amber-400" },
                      { clave: "pendiente", label: "Pendientes", punto: "bg-red-500" },
                      { clave: "sin_evaluar", label: "Sin evaluar", punto: "bg-slate-400" },
                    ].map((fila) => (
                      <div key={fila.clave} className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                          <span className={`w-2.5 h-2.5 rounded-full ${fila.punto}`} /> {fila.label}
                        </span>
                        <span className="font-black text-carbon-dark">{conteoEstados[fila.clave]}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-slate-400 pt-1">Cuenta las participaciones activas según su propio cumplimiento.</p>
                  </div>
                </div>
              )
            ))}

            {tarjetaCard("Recursos", (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600"><Users className="w-3.5 h-3.5 text-slate-400" /> Personas</span>
                  <span className="font-black text-carbon-dark">{cargando0 ? "…" : resumen?.personasCount ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600"><Truck className="w-3.5 h-3.5 text-slate-400" /> Maquinarias</span>
                  <span className="font-black text-carbon-dark">{cargando0 ? "…" : resumen?.recursosCount ?? "-"}</span>
                </div>
              </div>
            ))}

            {tarjetaCard("Últimos Eventos", (
              <UltimosEventos entidadId={id} cargar={(limit) => empresaService.obtenerEventos(id, { limit })} />
            ))}
          </div>
        </div>
      )}

      {/* ---------------- Mandantes ---------------- */}
      {tab === "mandantes" && gestionaMandantes && (
        <MandantesAsociadosPanel empresaId={id} empresaNombre={empresa.razonSocial} />
      )}
      {tab === "mandantes" && (
        cargando0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">Cargando...</p>
        ) : mandantes.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">Esta empresa no trabaja para ningún Mandante actualmente.</p>
        ) : (
          <div className="space-y-6">
            {mandantes.map((m) => {
              const ficha = mandantesDetalle[m.mandanteId];
              const participacionesDelMandante = participacionesActivas.filter((p) => p.mandanteId === m.mandanteId);
              const nombreMostrado = getMandanteDisplayName(ficha) || m.nombre || "Sin mandante";
              const logo = ficha?.logoUrl || m.logoUrl;
              return (
                <div key={m.mandanteId} className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
                  {/* Cabecera con logo grande */}
                  <div className="p-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-5 min-w-0">
                      <div className="w-20 h-20 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                        {logo ? (
                          <img src={logo} alt={nombreMostrado} className="w-full h-full object-contain p-2" />
                        ) : (
                          <span className="text-2xl font-black text-slate-300">{nombreMostrado.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Mandante</p>
                        <h3 className="text-2xl font-black text-carbon-dark tracking-tight truncate">{nombreMostrado}</h3>
                        {ficha?.razonSocial && ficha.razonSocial !== nombreMostrado && (
                          <p className="text-xs text-slate-500 mt-0.5">{ficha.razonSocial}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {ficha?.estado && <StatusBadge value={ficha.estado} map={MAPA_ACTIVO_INACTIVO} />}
                      <div className="text-right">
                        <p className="text-3xl font-black text-carbon-dark leading-none">{m.proyectoIds.size}</p>
                        <p className="text-[11px] font-semibold text-slate-500 mt-1">
                          proyecto{m.proyectoIds.size === 1 ? "" : "s"} activo{m.proyectoIds.size === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] gap-8">
                    {/* Datos del Mandante */}
                    <div className="space-y-4">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100">Datos del Mandante</p>
                      {ficha === undefined ? (
                        <p className="text-xs text-slate-400">Cargando...</p>
                      ) : ficha === null ? (
                        <p className="text-xs text-slate-400 italic">No se pudo cargar la ficha del Mandante.</p>
                      ) : (
                        <div className="space-y-3">
                          {campoInfo("Razón Social", ficha.razonSocial)}
                          {campoInfo("RUT", ficha.rut ? <span className="font-mono">{formatRutDisplay(ficha.rut)}</span> : null)}
                          {campoInfo("Nombre Fantasía", ficha.nombreFantasia)}
                          {campoInfo("Contacto", ficha.contacto?.nombre)}
                          {campoInfo("Email", ficha.contacto?.email)}
                          {campoInfo("Teléfono", ficha.contacto?.telefono)}
                        </div>
                      )}
                    </div>

                    {/* Participación de esta Empresa con el Mandante, proyecto por proyecto */}
                    <div className="space-y-4 min-w-0">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100">
                        Proyectos de {empresa.razonSocial} con este Mandante
                      </p>
                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="py-2.5 px-4">Proyecto</th>
                              <th className="py-2.5 px-4">Perfil</th>
                              <th className="py-2.5 px-4">Recursos</th>
                              <th className="py-2.5 px-4">Evaluación</th>
                              <th className="py-2.5 px-4"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {participacionesDelMandante.map((p) => {
                              const estado = estadoPorCumplimiento(p.evaluacion?.avancePct ?? null);
                              return (
                                <tr key={p.participacionId}>
                                  <td className="py-3 px-4 font-bold text-carbon-dark">{p.proyectoNombre || "-"}</td>
                                  <td className="py-3 px-4">
                                    {p.perfilNombre ? (
                                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border bg-violet-50 text-violet-700 border-violet-200">
                                        {p.perfilNombre}
                                      </span>
                                    ) : <span className="text-slate-400 italic">Sin perfil</span>}
                                  </td>
                                  <td className="py-3 px-4"><ParticipantesCell personas={p.personasCount} maquinarias={p.recursosCount} /></td>
                                  <td className="py-3 px-4">
                                    <div className="space-y-1">
                                      <BarraCumplimiento pct={p.evaluacion?.avancePct ?? null} />
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${estado.className}`}>{estado.label}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <Link to={`/proyectos/${p.proyectoId}`} className="text-[11px] font-semibold text-primary hover:text-primary-dark whitespace-nowrap">
                                      Ver proyecto
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ---------------- Proyectos ---------------- */}
      {tab === "proyectos" && (
        <div className="space-y-6">
          {modoEdicion && (
            <div className="flex justify-end">
              <ActionButton variant="primary" icon={Plus} onClick={() => setMostrandoNuevaParticipacion(true)}>
                Agregar Proyecto
              </ActionButton>
            </div>
          )}
          {mostrandoNuevaParticipacion && (
            <NuevaParticipacionModal
              empresaId={id}
              onCerrar={() => setMostrandoNuevaParticipacion(false)}
              onCreada={() => { setMostrandoNuevaParticipacion(false); cargarResumenYAvance(); }}
            />
          )}
          {tarjetaCard("Proyectos y Perfil de Acreditación", (
            cargando0 ? (
              <p className="text-xs text-slate-400">Cargando...</p>
            ) : participacionesActivas.length === 0 ? (
              <p className="text-xs text-slate-400">Sin Proyectos activos.</p>
            ) : (
              <>
              <p className="text-[11px] text-slate-400">
                Haz clic en un proyecto para ver abajo sus requerimientos; vuelve a hacer clic para ver todos.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {participacionesActivas.map((p) => {
                  const seleccionado = proyectoSeleccionadoId === p.proyectoId;
                  return (
                    <div
                      key={p.participacionId}
                      role="button"
                      tabIndex={0}
                      aria-pressed={seleccionado}
                      onClick={() => setProyectoSeleccionadoId(seleccionado ? null : p.proyectoId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setProyectoSeleccionadoId(seleccionado ? null : p.proyectoId);
                        }
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                        seleccionado
                          ? "bg-primary-lighter border-primary-light"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-carbon-dark truncate">{p.proyectoNombre || "-"}</p>
                          <p className="text-[11px] font-semibold text-slate-500">{p.perfilNombre || "Sin perfil"}</p>
                        </div>
                        <Link
                          to={`/proyectos/${p.proyectoId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-semibold text-primary hover:text-primary-dark whitespace-nowrap"
                        >
                          Ver proyecto
                        </Link>
                      </div>
                      <div className="mt-0.5">
                        <MandanteChip nombre={p.mandanteNombre || "Sin mandante"} logoUrl={p.mandanteLogoUrl} size="xl" />
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )
          ), null)}

          {tarjetaCard("Requerimientos de Evaluación (nivel Empresa)", (
            cargandoActividad ? (
              <p className="text-xs text-slate-400">Cargando...</p>
            ) : gruposVisibles.length === 0 ? (
              <p className="text-xs text-slate-400">
                {proyectoSeleccionadoId ? "Este proyecto no tiene Requerimientos de nivel Empresa aplicables." : "Sin Requerimientos de nivel Empresa aplicables."}
              </p>
            ) : (
              <div className="space-y-4">
                {gruposVisibles.map((grupo) => (
                  <GrupoRequerimientos
                    key={grupo.expedienteId}
                    titulo={grupo.proyectoNombre}
                    subtitulo={grupo.perfilNombre}
                    pctCumple={grupo.pctCumple}
                    items={grupo.items}
                    renderEstado={(r) => {
                      const abierta =
                        evaluacionAbierta?.expedienteId === grupo.expedienteId &&
                        evaluacionAbierta?.requerimientoId === r.requerimientoId;
                      return (
                        <div className="flex items-center gap-2">
                          <StatusBadge value={r.resultado} map={MAPA_EVALUACION} />
                          {puedeEvaluar && !abierta && (
                            <ActionButton icon={ClipboardCheck} onClick={() => abrirEvaluacion(grupo.expedienteId, r.requerimientoId)}>
                              Evaluar
                            </ActionButton>
                          )}
                        </div>
                      );
                    }}
                    renderDetalle={(r) => {
                      const abierta =
                        evaluacionAbierta?.expedienteId === grupo.expedienteId &&
                        evaluacionAbierta?.requerimientoId === r.requerimientoId;
                      if (!abierta) return null;
                      return (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                          <ErrorBanner message={errorEvaluacion} />
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Resultado</label>
                            <select
                              value={resultadoForm}
                              onChange={(e) => setResultadoForm(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                            >
                              {RESULTADOS_EVALUACION.map((res) => (
                                <option key={res.value} value={res.value}>{res.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Método de verificación</label>
                            <select
                              value={metodoForm}
                              onChange={(e) => setMetodoForm(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                            >
                              <option value="">Documental (con evidencia adjunta)</option>
                              <option value="presencial">Presencial (en terreno) — sin documento</option>
                              <option value="otro">Otro — sin documento</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Observaciones / justificación</label>
                            <textarea
                              value={observacionesForm}
                              onChange={(e) => setObservacionesForm(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs resize-none"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <ActionButton variant="primary" busy={evaluando} busyLabel="Guardando..." onClick={handleGuardarEvaluacion}>
                              Confirmar
                            </ActionButton>
                            <ActionButton disabled={evaluando} onClick={cerrarEvaluacion}>
                              Cancelar
                            </ActionButton>
                          </div>
                        </div>
                      );
                    }}
                  />
                ))}
              </div>
            )
          ), null)}
        </div>
      )}

      {/* ---------------- Recursos ---------------- */}
      {tab === "recursos" && (
        <RecursosBloques
          estado={cargandoActividad ? "cargando" : "listo"}
          construirBloques={construirBloquesRecursos}
          mensajeSinBloques="Esta empresa no participa activamente en ningún proyecto."
        />
      )}

      {/* ---------------- Documentación ---------------- */}
      {tab === "documentacion" && (
        <div className="bg-white p-10 rounded-2xl border border-slate-100 shadow-card text-center space-y-2">
          <FileText className="w-6 h-6 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-400">Aún no hay documentos a nivel Empresa.</p>
        </div>
      )}

      {/* ---------------- Historial ---------------- */}
      {tab === "historial" && (
        <HistorialEventos entidadId={id} cargar={(limit) => empresaService.obtenerEventos(id, { limit })} />
      )}
    </div>
  );
};
