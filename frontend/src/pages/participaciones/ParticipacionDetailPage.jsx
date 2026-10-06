import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertCircle, Link2, FileCheck2, Users, Truck, Activity } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { participacionService } from "../../services/participacionService";
import { proyectoService } from "../../services/proyectoService";
import { empresaService } from "../../services/empresaService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { expedienteService } from "../../services/expedienteService";
import { evaluacionService } from "../../services/evaluacionService";
import { asignacionService } from "../../services/asignacionService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { formatFecha } from "../../utils/fechaFormatters";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { calcularConteosEvaluacion, calcularSinEvaluar } from "../../utils/cumplimientoCalculos";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { StatusBadge, MAPA_ESTADO_PARTICIPACION } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { EstadoExpedienteStepper } from "../../components/shared/EstadoExpedienteStepper";
import { EstadoCumplimientoPanel } from "../../components/shared/EstadoCumplimientoPanel";
import { UltimosEventos } from "../../components/shared/EventosBitacora";

export const ParticipacionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Solo una Participación activa admite Expediente, y solo lo crean superadmin y mandante_admin.
  const puedeCrearExpediente = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [participacion, setParticipacion] = useState(null);
  const [proyecto, setProyecto] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [expediente, setExpediente] = useState(null);
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [personas, setPersonas] = useState([]);
  const [recursos, setRecursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cargarDatos = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await participacionService.obtenerPorId(id);
        setParticipacion(data);

        const [proyectoData, empresaData, perfilData, expedientes, asignacionesData, personasData, recursosData] = await Promise.all([
          proyectoService.obtenerPorId(data.proyectoId).catch(() => null),
          empresaService.obtenerPorId(data.empresaId).catch(() => null),
          perfilParticipacionService.obtenerPorId(data.perfilParticipacionId).catch(() => null),
          expedienteService.listar({}).catch(() => []),
          asignacionService.listar({ proyectoId: data.proyectoId, estado: "activa" }).catch(() => []),
          personaService.listar("activo").catch(() => []),
          recursoService.listar("activo").catch(() => []),
        ]);
        setProyecto(proyectoData);
        setEmpresa(empresaData);
        setPerfil(perfilData);
        setPersonas(personasData || []);
        setRecursos(recursosData || []);
        // Asignaciones de ESTA Participación: por participacionId; las antiguas sin él, por Empresa + Proyecto.
        setAsignaciones((asignacionesData || []).filter((a) => (
          a.participacionId ? a.participacionId === id : a.empresaId === data.empresaId
        )));

        // Puede haber Expedientes anteriores (cerrados): se muestra el vigente, o el más reciente.
        const delaParticipacion = (expedientes || []).filter((e) => e.participacionId === id);
        const vigente = delaParticipacion.find((e) => e.estado !== "cerrado") || delaParticipacion[0] || null;
        setExpediente(vigente);
        if (vigente) {
          const evals = await evaluacionService.listarPorExpediente(vigente.id, true).catch(() => []);
          setEvaluaciones((evals || []).filter((e) => e.estado === "vigente"));
        }
      } catch (err) {
        console.error("Error al cargar la participación:", err);
        setError(err.message || "No se pudo cargar la participación.");
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando participación...
      </div>
    );
  }

  if (!participacion) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <ErrorBanner message={error || "Participación no encontrada."} />
      </div>
    );
  }

  // Mismos cálculos que el listado y el detalle del Expediente.
  const { conteos } = calcularConteosEvaluacion(evaluaciones);
  const sinEvaluar = expediente ? calcularSinEvaluar([expediente], evaluaciones) : 0;
  const totalRequisitos = conteos.cumple + conteos.pendiente + conteos.no_cumple + sinEvaluar;

  const personasAsignadas = asignaciones.filter((a) => a.personaId).map((a) => {
    const p = personas.find((x) => x.id === a.personaId);
    return { id: a.id, nombre: p ? `${p.nombre} ${p.apellido || ""}`.trim() : a.personaId, detalle: a.rol ? formatCatalogo(a.rol) : "" };
  });
  const recursosAsignados = asignaciones.filter((a) => a.recursoId).map((a) => {
    const r = recursos.find((x) => x.id === a.recursoId);
    return { id: a.id, nombre: r?.nombre || a.recursoId, detalle: r?.tipo ? formatCatalogo(r.tipo) : "" };
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header de página */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/participaciones")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              {empresa?.razonSocial || participacion.empresaId}
            </h2>
            <p className="text-xs text-gray-500">
              {proyecto ? `${proyecto.nombre} (${proyecto.codigo})` : participacion.proyectoId}
            </p>
          </div>
        </div>
        <StatusBadge value={participacion.estado} map={MAPA_ESTADO_PARTICIPACION} />
      </div>

      <ErrorBanner message={error} />

      {/* Card: Información General */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Información General</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proyecto</p>
            <p className="text-slate-700 font-medium">
              {proyecto ? `${proyecto.nombre} (${proyecto.codigo})` : participacion.proyectoId}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Empresa</p>
            <p className="text-slate-700 font-medium">{empresa?.razonSocial || participacion.empresaId}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Perfil de Participación</p>
            <p className="text-slate-700 font-medium">{perfil?.nombre || participacion.perfilParticipacionId}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha de Inicio</p>
            <p className="text-slate-700 font-medium">{formatFecha(participacion.fechaInicio)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Card: Expediente asociado */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <FileCheck2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Expediente</h3>
          </div>
          {expediente ? (
            <div className="space-y-4">
              <EstadoExpedienteStepper estado={expediente.estado} />
              <EstadoCumplimientoPanel conteos={conteos} sinEvaluar={sinEvaluar} size={110} strokeWidth={12} />
              <p className="text-xs text-slate-500">
                <span className="font-bold text-carbon-dark">{conteos.cumple}</span> de{" "}
                <span className="font-bold text-carbon-dark">{totalRequisitos}</span> requisitos cubiertos
              </p>
              <ActionButton as={Link} to={`/expedientes/${expediente.id}`} icon={FileCheck2}>
                Ver Expediente →
              </ActionButton>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-slate-400" />
                Esta Participación todavía no tiene un Expediente.
              </p>
              {puedeCrearExpediente && participacion.estado === "activa" && (
                <ActionButton
                  variant="primary"
                  icon={FileCheck2}
                  onClick={() => navigate(`/expedientes/nuevo?participacionId=${id}`)}
                >
                  Crear Expediente
                </ActionButton>
              )}
            </div>
          )}
        </div>

        {/* Card: Asignaciones */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Asignaciones</h3>
          </div>
          {[
            { titulo: "Personas", icono: Users, lista: personasAsignadas, vacio: "Sin personas asignadas." },
            { titulo: "Maquinarias", icono: Truck, lista: recursosAsignados, vacio: "Sin maquinarias asignadas." },
          ].map(({ titulo, icono: Icono, lista, vacio }) => (
            <div key={titulo} className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <Icono className="w-3.5 h-3.5" /> {titulo} <span className="text-carbon-dark">({lista.length})</span>
              </p>
              {lista.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">{vacio}</p>
              ) : (
                <ul className="space-y-1">
                  {lista.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="font-semibold text-slate-700 truncate">{e.nombre}</span>
                      {e.detalle && <span className="text-[10px] text-slate-400 whitespace-nowrap">{e.detalle}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Card: Actividad reciente (mecanismo compartido de eventos de Bitácora) */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Actividad reciente</h3>
        </div>
        <UltimosEventos
          cargar={(limit) => participacionService.obtenerEventos(id, { limit })}
          entidadId={id}
          limit={10}
          textoVacio="Sin actividad todavía."
        />
      </div>
    </div>
  );
};
