import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  FolderKanban,
  Building2,
  Users,
  Truck,
  UserPlus,
  Plus,
  CheckCircle2,
  UserMinus,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { proyectoService, ESTADOS_PROYECTO } from "../../services/proyectoService";
import { mandanteService } from "../../services/mandanteService";
import { participacionService } from "../../services/participacionService";
import { empresaService } from "../../services/empresaService";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import {
  sujetoService, participacionPersonaService, participacionRecursoService,
} from "../../services/participacionSujetoService";
import { reporteService } from "../../services/reporteService";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { formatFecha } from "../../utils/fechas";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { StatusBadge } from "../../components/shared/StatusBadge";
import { ActionButton } from "../../components/shared/ActionButton";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { ModalCrearPersona } from "../../components/shared/ModalCrearPersona";
import { ModalCrearRecurso } from "../../components/shared/ModalCrearRecurso";
import { Tabs } from "../../components/shared/Tabs";
import { ProgressRing } from "../../components/shared/ProgressRing";
import { EmpresasParticipantesTable } from "../../components/proyectos/EmpresasParticipantesTable";
import { RecursosProyecto } from "../../components/proyectos/RecursosProyecto";
import { UltimosEventos, HistorialEventos } from "../../components/shared/EventosBitacora";
import { RequerimientosProyecto } from "../../components/proyectos/RequerimientosProyecto";
import { DocumentosProyecto } from "../../components/proyectos/DocumentosProyecto";
import { ProyectoEdicionForm } from "../../components/proyectos/ProyectoEdicionForm";
import { NuevaParticipacionModal } from "../../components/shared/NuevaParticipacionModal";
import { BotonesEdicion } from "../../components/shared/BotonesEdicion";
import { useEdicionInPlace } from "../../hooks/useEdicionInPlace";
import { estadoPorCumplimiento, claseAnilloCumplimiento } from "../../utils/cumplimientoClases";
import { KpiCard, KpiValor, TarjetaPanel, CampoInfo } from "../../components/shared/DetalleUI";
import { DateInput } from "../../components/ui/DateInput";

const ESTADO_PROYECTO_MAP = ESTADOS_PROYECTO.reduce((acc, e) => {
  acc[e.value] = { label: e.label, className: "bg-slate-100 text-slate-600 border-slate-200" };
  return acc;
}, {});

const FORM_EDICION_ID = "proyecto-edicion-form";

const ESTADOS_PROYECTO_NO_ELEGIBLES = ["finalizado", "archivado"];

const FORM_INICIAL = {
  empresaId: "",
  tipo: "persona",
  personaId: "",
  recursoId: "",
  perfilRecursoIds: [],
  fechaInicio: "",
  fechaTermino: "",
};

export const ProyectoDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [proyecto, setProyecto] = useState(null);
  const [mandanteNombre, setMandanteNombre] = useState("");
  const [mandanteLogoUrl, setMandanteLogoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [participaciones, setParticipaciones] = useState([]);
  // Personas y Maquinarias activas del Proyecto, agrupadas por sujeto (con sus perfiles).
  const [sujetos, setSujetos] = useState([]);
  const [empresasMap, setEmpresasMap] = useState({});
  const [personasActivas, setPersonasActivas] = useState([]);
  const [recursosActivos, setRecursosActivos] = useState([]);
  // Perfiles de Recurso activos del Mandante (persona y maquinaria), elegidos por ID.
  const [perfilesMandante, setPerfilesMandante] = useState([]);

  const [formAbierto, setFormAbierto] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [errorForm, setErrorForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [modalPersonaAbierto, setModalPersonaAbierto] = useState(false);
  const [modalRecursoAbierto, setModalRecursoAbierto] = useState(false);

  // Empresas Participantes (endpoint de reportes) y % general del Proyecto:
  // una sola fuente para la tabla, los KPIs y el sidebar, así nunca
  // muestran números distintos. undefined = cargando, null = falló.
  const [searchParams] = useSearchParams();
  const TABS_VALIDAS = ["resumen", "empresas", "recursos", "requerimientos", "documentacion", "historial"];
  const [tab, setTab] = useState(() => (TABS_VALIDAS.includes(searchParams.get("tab")) ? searchParams.get("tab") : "resumen"));
  const [accionandoId, setAccionandoId] = useState(null);
  const [mostrandoNuevaParticipacion, setMostrandoNuevaParticipacion] = useState(false);
  const [participantes, setParticipantes] = useState(undefined);
  const [avanceGeneral, setAvanceGeneral] = useState(undefined);

  const cargarCumplimiento = (proyectoId) => {
    reporteService
      .obtenerParticipantesPorProyecto(proyectoId)
      .then((data) => setParticipantes(data || []))
      .catch(() => setParticipantes(null));
    reporteService
      .obtenerResumen({ proyectoId })
      .then((data) => setAvanceGeneral(data?.requerimientos?.avancePct ?? null))
      .catch(() => setAvanceGeneral(null));
  };

  const cargarRelaciones = async (proyectoId) => {
    const [participacionesData, sujetosData] = await Promise.all([
      participacionService.listar({ proyectoId }),
      sujetoService.listar({ proyectoId, estado: "activa" }),
    ]);
    setParticipaciones((participacionesData || []).filter((p) => p.proyectoId === proyectoId));
    setSujetos((sujetosData || []).filter((a) => a.proyectoId === proyectoId));
    cargarCumplimiento(proyectoId);
  };

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await proyectoService.obtenerPorId(id);
      setProyecto(data);

      const [mandante] = await Promise.all([
        mandanteService.obtenerPorId(data.mandanteId).catch(() => null),
        cargarRelaciones(data.id),
      ]);
      setMandanteNombre(getMandanteDisplayName(mandante) || data.mandanteId);
      setMandanteLogoUrl(mandante?.logoUrl || null);
    } catch (err) {
      console.error("Error al cargar el proyecto:", err);
      setError(err.message || "No se pudo cargar el proyecto.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Edición in-place (patrón compartido con Empresa, Persona y Maquinaria).
  const {
    modoEdicion, iniciarEdicion, cancelar, alGuardar, confirmarSalida,
    guardando: guardandoEdicion, setGuardando: setGuardandoEdicion, setHayCambiosSinGuardar,
  } = useEdicionInPlace({ puedeEditar: puedeEscribir, onGuardado: cargarDatos });

  useEffect(() => {
    empresaService.listar().then((data) => {
      const map = {};
      (data || []).forEach((e) => { map[e.id] = e; });
      setEmpresasMap(map);
    }).catch((err) => console.error("Error al cargar empresas:", err));

    personaService.listar("activo").then(setPersonasActivas).catch(() => setPersonasActivas([]));
    recursoService.listar("activo").then(setRecursosActivos).catch(() => setRecursosActivos([]));
  }, []);

  useEffect(() => {
    if (!proyecto?.mandanteId) return;
    perfilRecursoService
      .listar({ mandanteId: proyecto.mandanteId, estado: "activo" })
      .then((data) => setPerfilesMandante(data || []))
      .catch((err) => console.error("Error al cargar perfiles de recurso:", err));
  }, [proyecto?.mandanteId]);

  const participacionesActivas = participaciones.filter((p) => p.estado === "activa");

  const empresasElegibles = participacionesActivas
    .map((p) => empresasMap[p.empresaId])
    .filter(Boolean);

  const abrirFormulario = () => {
    setFormData(FORM_INICIAL);
    setErrorForm(null);
    setFormAbierto(true);
  };

  const cerrarFormulario = () => {
    setFormAbierto(false);
    setFormData(FORM_INICIAL);
    setErrorForm(null);
  };

  // Acciones de gestión que se aplican al instante (mismos endpoints que el resto
  // del sistema); las transiciones a "finalizada" son terminales, por eso confirman.
  const handleFinalizarParticipacion = async (empresaId) => {
    const participacion = participaciones.find((p) => p.empresaId === empresaId && p.estado === "activa");
    if (!participacion) return;
    if (!window.confirm("¿Finalizar la Participación de esta Empresa en el Proyecto? Es una transición terminal, no podrá revertirse.")) return;
    setAccionandoId(empresaId);
    try {
      await participacionService.transicionar(participacion.id, "finalizada");
      await cargarRelaciones(proyecto.id);
    } catch (err) {
      setError(err.message || "No se pudo finalizar la Participación.");
    } finally {
      setAccionandoId(null);
    }
  };

  const handleQuitarSujeto = async (sujetoKey) => {
    const sujeto = sujetos.find((a) => a.id === sujetoKey);
    if (!sujeto) return;
    if (!window.confirm("¿Quitar del Proyecto? Se finaliza su participación (con todos sus perfiles); es una transición terminal, no podrá revertirse.")) return;
    setAccionandoId(sujetoKey);
    try {
      await sujetoService.finalizar(sujeto);
      await cargarRelaciones(proyecto.id);
    } catch (err) {
      setError(err.message || "No se pudo quitar del Proyecto.");
    } finally {
      setAccionandoId(null);
    }
  };

  const handleEmpresaChange = (e) => {
    // Al cambiar la Empresa se resetea cualquier Persona/Recurso ya
    // elegido: evita que quede seleccionada una persona/recurso de la
    // empresa anterior.
    setFormData((prev) => ({
      ...prev,
      empresaId: e.target.value,
      personaId: "",
      recursoId: "",
    }));
  };

  const handleTipoChange = (tipo) => {
    setFormData((prev) => ({ ...prev, tipo, personaId: "", recursoId: "", perfilRecursoIds: [] }));
  };

  // Alta al vuelo desde el propio formulario de "Nueva Asignación": crea
  // la Persona/Maquinaria en la Empresa ya elegida (vía modal, mismo
  // patrón que PasoAsignaciones.jsx) y la deja preseleccionada, sin salir
  // del formulario ni perder lo ya llenado (fechas, perfiles, etc.).
  const handlePersonaCreada = (persona) => {
    setModalPersonaAbierto(false);
    setPersonasActivas((prev) => [...prev, persona]);
    setFormData((prev) => ({ ...prev, tipo: "persona", personaId: persona.id }));
  };

  const handleRecursoCreado = (recurso) => {
    setModalRecursoAbierto(false);
    setRecursosActivos((prev) => [...prev, recurso]);
    setFormData((prev) => ({ ...prev, tipo: "recurso", recursoId: recurso.id, perfilRecursoIds: perfilSugerido(recurso) }));
  };

  const opcionesPersona = personasActivas.filter((p) => p.empresaActual?.empresaId === formData.empresaId);
  const opcionesRecurso = recursosActivos.filter((r) => r.empresaActual?.empresaId === formData.empresaId);
  const perfilesDelTipo = perfilesMandante.filter((p) => p.tipo === formData.tipo);
  // La clasificación descriptiva del Recurso (tipo) solo PRESELECCIONA el perfil del mismo nombre.
  function perfilSugerido(recurso) {
    const p = perfilesMandante.find((x) => x.tipo === "recurso" && x.nombre === recurso?.tipo);
    return p ? [p.id] : [];
  }
  const alternarPerfilPersona = (id) => setFormData((prev) => ({
    ...prev,
    perfilRecursoIds: prev.perfilRecursoIds.includes(id)
      ? prev.perfilRecursoIds.filter((x) => x !== id) : [...prev.perfilRecursoIds, id],
  }));

  const handleGuardarAsignacion = async () => {
    setErrorForm(null);

    if (!formData.empresaId) {
      setErrorForm("Debe seleccionar una Empresa.");
      return;
    }
    if (formData.tipo === "persona" && !formData.personaId) {
      setErrorForm("Debe seleccionar una Persona.");
      return;
    }
    if (formData.tipo === "recurso" && !formData.recursoId) {
      setErrorForm("Debe seleccionar una Maquinaria.");
      return;
    }
    if (formData.perfilRecursoIds.length === 0) {
      setErrorForm("Debe seleccionar el Perfil de Recurso.");
      return;
    }
    if (!formData.fechaInicio) {
      setErrorForm("La fecha de inicio es obligatoria.");
      return;
    }
    if (formData.fechaTermino && formData.fechaTermino < formData.fechaInicio) {
      setErrorForm("La fecha de término no puede ser anterior a la de inicio.");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        proyectoId: proyecto.id,
        empresaId: formData.empresaId,
        perfilRecursoIds: formData.perfilRecursoIds,
        fechaInicio: formData.fechaInicio,
        fechaTermino: formData.fechaTermino || null,
      };
      if (formData.tipo === "persona") {
        await participacionPersonaService.crear({ ...payload, personaId: formData.personaId });
      } else {
        await participacionRecursoService.crear({ ...payload, recursoId: formData.recursoId });
      }
      await cargarRelaciones(proyecto.id);
      cerrarFormulario();
    } catch (err) {
      console.error("Error al asignar:", err);
      setErrorForm(err.message || "No se pudo crear la asignación.");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando proyecto...
      </div>
    );
  }

  if (!proyecto) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <ErrorBanner message={error || "Proyecto no encontrado."} />
      </div>
    );
  }

  const proyectoElegibleParaAsignar = !ESTADOS_PROYECTO_NO_ELEGIBLES.includes(proyecto.estado);

  // --- Cumplimiento / participantes: TODO sale de `participantes` (la misma
  // respuesta que pinta la tabla de Empresas Participantes), para que KPIs,
  // sidebar y tabla nunca puedan mostrar números distintos. ---
  const listaParticipantes = Array.isArray(participantes) ? participantes : [];
  const participantesListos = Array.isArray(participantes);
  const sumar = (campo, clave) => listaParticipantes.reduce((acc, e) => acc + e[campo][clave], 0);
  const personasAcreditadas = sumar("personas", "acreditadas");
  const personasTotal = sumar("personas", "total");
  const maquinariasAcreditadas = sumar("maquinarias", "acreditadas");
  const maquinariasTotal = sumar("maquinarias", "total");
  const conteoEstados = { acreditado: 0, en_proceso: 0, pendiente: 0, sin_evaluar: 0 };
  listaParticipantes.forEach((e) => { conteoEstados[estadoPorCumplimiento(e.cumplimientoPct).clave]++; });
  const colorAnillo = claseAnilloCumplimiento;
  const irAEmpresa = (empresaId) => navigate(`/empresas/${empresaId}`);

  const tarjetaKpi = (titulo, contenido, subtexto) => (
    <KpiCard titulo={titulo} subtexto={subtexto}>{contenido}</KpiCard>
  );
  const valorKpi = (valor) => <KpiValor valor={valor} listo={participantesListos} />;

  const barraRecurso = (etiqueta, Icono, acreditadas, total) => (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
          <Icono className="w-3.5 h-3.5 text-slate-400" /> {etiqueta}
        </span>
        <span className="font-black text-carbon-dark">{acreditadas}/{total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-sage-dark"
          style={{ width: `${total > 0 ? Math.round((acreditadas / total) * 100) : 0}%` }}
        />
      </div>
    </div>
  );

  const tarjetaSidebar = (titulo, hijos) => <TarjetaPanel titulo={titulo}>{hijos}</TarjetaPanel>;

  const campoInfo = (etiqueta, valor) => <CampoInfo etiqueta={etiqueta}>{valor}</CampoInfo>;

  // Gestión de Personas/Maquinarias asignadas ("+ Nueva Asignación"), dentro de la pestaña Recursos.
  const gestionAsignaciones = (
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Recursos Asignados</h3>
          </div>
          {puedeEscribir && proyectoElegibleParaAsignar && !formAbierto && (
            <ActionButton variant="primary" icon={UserPlus} onClick={abrirFormulario}>
              Nueva Asignación
            </ActionButton>
          )}
        </div>

        {formAbierto && (
          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 space-y-3">
            <ErrorBanner message={errorForm} />

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Empresa *</label>
              <select
                value={formData.empresaId}
                onChange={handleEmpresaChange}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="">Seleccione una Empresa...</option>
                {empresasElegibles.map((e) => (
                  <option key={e.id} value={e.id}>{e.razonSocial}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTipoChange("persona")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  formData.tipo === "persona"
                    ? "bg-primary-lighter text-primary border-primary/20"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                Persona
              </button>
              <button
                type="button"
                onClick={() => handleTipoChange("recurso")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  formData.tipo === "recurso"
                    ? "bg-primary-lighter text-primary border-primary/20"
                    : "bg-white text-slate-500 border-slate-200"
                }`}
              >
                Maquinaria
              </button>
            </div>

            {formData.tipo === "persona" ? (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Persona *</label>
                <div className="flex items-center gap-2">
                  <select
                    value={formData.personaId}
                    onChange={(e) => setFormData((prev) => ({ ...prev, personaId: e.target.value }))}
                    disabled={!formData.empresaId}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {!formData.empresaId ? (
                      <option value="">Seleccione primero una Empresa</option>
                    ) : (
                      <>
                        <option value="">Seleccione una Persona...</option>
                        {opcionesPersona.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <ActionButton
                    icon={Plus}
                    disabled={!formData.empresaId}
                    onClick={() => setModalPersonaAbierto(true)}
                  >
                    Crear
                  </ActionButton>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Maquinaria *</label>
                <div className="flex items-center gap-2">
                  <select
                    value={formData.recursoId}
                    onChange={(e) => {
                      const recurso = opcionesRecurso.find((r) => r.id === e.target.value);
                      setFormData((prev) => ({ ...prev, recursoId: e.target.value, perfilRecursoIds: perfilSugerido(recurso) }));
                    }}
                    disabled={!formData.empresaId}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {!formData.empresaId ? (
                      <option value="">Seleccione primero una Empresa</option>
                    ) : (
                      <>
                        <option value="">Seleccione una Maquinaria...</option>
                        {opcionesRecurso.map((r) => (
                          <option key={r.id} value={r.id}>{r.nombre}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <ActionButton
                    icon={Plus}
                    disabled={!formData.empresaId}
                    onClick={() => setModalRecursoAbierto(true)}
                  >
                    Crear
                  </ActionButton>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {formData.tipo === "persona" ? "Perfiles de Recurso * (uno o más)" : "Perfil de Recurso *"}
              </label>
              {formData.tipo === "persona" ? (
                <div className="flex flex-wrap gap-2">
                  {perfilesDelTipo.map((p) => {
                    const activo = formData.perfilRecursoIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => alternarPerfilPersona(p.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                          activo ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {p.nombre}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select
                  value={formData.perfilRecursoIds[0] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, perfilRecursoIds: e.target.value ? [e.target.value] : [] }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                >
                  <option value="">Seleccione un Perfil de Recurso...</option>
                  {perfilesDelTipo.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha de Inicio *</label>
                <DateInput
                  value={formData.fechaInicio}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fechaInicio: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Fecha de Término</label>
                <DateInput
                  value={formData.fechaTermino}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fechaTermino: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <ActionButton variant="primary" busy={guardando} busyLabel="Guardando..." onClick={handleGuardarAsignacion}>
                Confirmar
              </ActionButton>
              <ActionButton disabled={guardando} onClick={cerrarFormulario}>
                Cancelar
              </ActionButton>
            </div>
          </div>
        )}

        {modalPersonaAbierto && (
          <ModalCrearPersona
            mandanteId={proyecto.mandanteId}
            empresaId={formData.empresaId}
            onCreada={handlePersonaCreada}
            onCerrar={() => setModalPersonaAbierto(false)}
          />
        )}
        {modalRecursoAbierto && (
          <ModalCrearRecurso
            mandanteId={proyecto.mandanteId}
            empresaId={formData.empresaId}
            onCreada={handleRecursoCreado}
            onCerrar={() => setModalRecursoAbierto(false)}
          />
        )}
      </div>
  );

  const TABS = [
    { key: "resumen", label: "Resumen" },
    { key: "empresas", label: "Empresas Participantes" },
    { key: "recursos", label: "Recursos" },
    { key: "requerimientos", label: "Requerimientos" },
    { key: "documentacion", label: "Documentación" },
    { key: "historial", label: "Historial" },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header de página */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { if (confirmarSalida()) navigate("/proyectos"); }}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">{proyecto.nombre}</h2>
            <p className="text-xs text-gray-500 font-mono">{proyecto.codigo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={proyecto.estado} map={ESTADO_PROYECTO_MAP} />
          {puedeEscribir && proyecto.estado !== "archivado" && (
            <BotonesEdicion
              modoEdicion={modoEdicion}
              guardando={guardandoEdicion}
              formId={FORM_EDICION_ID}
              onEditar={iniciarEdicion}
              onCancelar={cancelar}
            />
          )}
        </div>
      </div>

      <ErrorBanner message={error} />

      {/* Franja de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {tarjetaKpi("Empresas Participantes", valorKpi(listaParticipantes.length), "activas en el proyecto")}
        {tarjetaKpi(
          "Personas",
          valorKpi(<>{personasAcreditadas} <span className="text-sm font-bold text-slate-400">de {personasTotal}</span></>),
          "acreditadas / asignadas",
        )}
        {tarjetaKpi(
          "Maquinarias",
          valorKpi(<>{maquinariasAcreditadas} <span className="text-sm font-bold text-slate-400">de {maquinariasTotal}</span></>),
          "acreditadas / asignadas",
        )}
        {tarjetaKpi(
          "Cumplimiento General",
          avanceGeneral === undefined ? (
            <div className="h-14 w-14 rounded-full bg-slate-100 animate-pulse" />
          ) : (
            <div className="relative w-14 h-14">
              <ProgressRing value={avanceGeneral || 0} size={56} strokeWidth={6} progressClassName={colorAnillo(avanceGeneral)} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-carbon-dark">
                {avanceGeneral === null ? "—" : `${avanceGeneral}%`}
              </span>
            </div>
          ),
        )}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {/* Modo edición: el formulario vive en Resumen pero se mantiene montado al cambiar
          de pestaña (así no se pierden los cambios sin guardar). */}
      {modoEdicion && (
        <div className={tab === "resumen" ? "" : "hidden"}>
          <ProyectoEdicionForm
            idProyecto={proyecto.id}
            formId={FORM_EDICION_ID}
            enDetalle
            onGuardado={alGuardar}
            onDirtyChange={setHayCambiosSinGuardar}
            onGuardandoChange={setGuardandoEdicion}
            onEliminado={() => navigate("/proyectos")}
          />
        </div>
      )}

      {!modoEdicion && tab === "resumen" && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          <div className="min-w-0 space-y-6">
            {/* Card: Información del Proyecto */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <FolderKanban className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Información del Proyecto</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campoInfo("Mandante", <MandanteChip nombre={mandanteNombre} logoUrl={mandanteLogoUrl} size="xl" />)}
                {campoInfo("Código", <span className="font-mono">{proyecto.codigo}</span>)}
                {campoInfo("Fecha de Inicio", formatFecha(proyecto.fechaInicio))}
                {campoInfo("Fecha de Término", formatFecha(proyecto.fechaTermino))}
                {proyecto.ubicacion && campoInfo("Ubicación / Región", proyecto.ubicacion)}
                {proyecto.tipoProyecto && campoInfo("Tipo de proyecto", proyecto.tipoProyecto)}
                {proyecto.descripcion && (
                  <div className="md:col-span-2">{campoInfo("Descripción", proyecto.descripcion)}</div>
                )}
              </div>
            </div>

            {/* Card: Empresas Participantes (mismo componente y endpoint que el listado de Proyectos) */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
                <Building2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Empresas Participantes</h3>
              </div>
              <EmpresasParticipantesTable datos={participantes} onIrEmpresa={irAEmpresa} conFiltros />
            </div>

          </div>

          {/* Sidebar derecho */}
          <aside className="space-y-6 min-w-0">
            
            {tarjetaSidebar("Cumplimiento del Proyecto", (
              avanceGeneral === undefined || !participantesListos ? (
                <p className="text-xs text-slate-400">Cargando...</p>
              ) : (
                <div className="space-y-4">
                  <div className="relative w-28 h-28 mx-auto">
                    <ProgressRing value={avanceGeneral || 0} size={112} strokeWidth={10} progressClassName={colorAnillo(avanceGeneral)} />
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-black text-carbon-dark">
                      {avanceGeneral === null ? "—" : `${avanceGeneral}%`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { clave: "acreditado", label: "Acreditadas", punto: "bg-sage-dark" },
                      { clave: "en_proceso", label: "En proceso", punto: "bg-amber-400" },
                      { clave: "pendiente", label: "Pendientes", punto: "bg-red-500" },
                      ...(conteoEstados.sin_evaluar > 0 ? [{ clave: "sin_evaluar", label: "Sin evaluar", punto: "bg-slate-400" }] : []),
                    ].map((fila) => (
                      <div key={fila.clave} className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                          <span className={`w-2.5 h-2.5 rounded-full ${fila.punto}`} /> {fila.label}
                        </span>
                        <span className="font-black text-carbon-dark">{conteoEstados[fila.clave]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}

            {tarjetaSidebar("Recursos Asignados", (
              !participantesListos ? (
                <p className="text-xs text-slate-400">Cargando...</p>
              ) : (
                <div className="space-y-4">
                  {barraRecurso("Personas", Users, personasAcreditadas, personasTotal)}
                  {barraRecurso("Maquinarias", Truck, maquinariasAcreditadas, maquinariasTotal)}
                </div>
              )
            ))}

            {tarjetaSidebar("Últimos Eventos", <UltimosEventos entidadId={proyecto.id} cargar={(limit) => proyectoService.obtenerEventos(proyecto.id, { limit })} />)}
          </aside>
        </div>
      )}

      {tab === "empresas" && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          {modoEdicion && (
            <div className="flex justify-end">
              <ActionButton variant="primary" icon={Plus} onClick={() => setMostrandoNuevaParticipacion(true)}>
                Agregar Empresa
              </ActionButton>
            </div>
          )}
          {mostrandoNuevaParticipacion && (
            <NuevaParticipacionModal
              proyectoId={proyecto.id}
              onCerrar={() => setMostrandoNuevaParticipacion(false)}
              onCreada={() => { setMostrandoNuevaParticipacion(false); cargarDatos(); }}
            />
          )}
          <EmpresasParticipantesTable
            datos={participantes}
            onIrEmpresa={irAEmpresa}
            conFiltros
            accionFila={modoEdicion ? (fila) => (
              <ActionButton
                icon={CheckCircle2}
                busy={accionandoId === fila.empresaId}
                busyLabel="..."
                onClick={() => handleFinalizarParticipacion(fila.empresaId)}
              >
                Finalizar Participación
              </ActionButton>
            ) : undefined}
          />
        </div>
      )}

      {tab === "recursos" && (
        <RecursosProyecto
          proyectoId={proyecto.id}
          participantes={listaParticipantes}
          participaciones={participaciones}
          sujetos={sujetos}
          personas={personasActivas}
          recursos={recursosActivos}
          cabecera={modoEdicion ? gestionAsignaciones : null}
          accionFila={modoEdicion ? (fila) => (
            <ActionButton
              icon={UserMinus}
              busy={accionandoId === fila.key}
              busyLabel="..."
              onClick={() => handleQuitarSujeto(fila.key)}
            >
              Quitar
            </ActionButton>
          ) : undefined}
        />
      )}

      {tab === "requerimientos" && (
        <RequerimientosProyecto
          proyectoId={proyecto.id}
          participantes={listaParticipantes}
          sujetos={sujetos}
          personas={personasActivas}
          recursos={recursosActivos}
          modoEdicion={modoEdicion}
          onCambio={() => cargarCumplimiento(proyecto.id)}
        />
      )}
      {tab === "documentacion" && (
        <DocumentosProyecto
          proyectoId={proyecto.id}
          participantes={listaParticipantes}
          modoEdicion={modoEdicion}
          sujetos={sujetos}
          personas={personasActivas}
          recursos={recursosActivos}
          onCambio={() => cargarCumplimiento(proyecto.id)}
        />
      )}
      {tab === "historial" && (
        <HistorialEventos entidadId={proyecto.id} cargar={(limit) => proyectoService.obtenerEventos(proyecto.id, { limit })} />
      )}
    </div>
  );
};
