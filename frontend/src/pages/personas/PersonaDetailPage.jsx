import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Power, Briefcase, Building2, FileCheck2, Repeat, ClipboardCheck, FolderKanban, FileText, ShieldOff,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { personaService } from "../../services/personaService";
import { AnonimizarPersonaModal } from "../../components/personas/AnonimizarPersonaModal";
import { DocumentosIdentidadPurga } from "../../components/personas/DocumentosIdentidadPurga";
import { relacionLaboralService } from "../../services/relacionLaboralService";
import { empresaService } from "../../services/empresaService";
import { proyectoService } from "../../services/proyectoService";
import { participacionService } from "../../services/participacionService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { sujetoService, nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { expedienteService } from "../../services/expedienteService";
import { evaluacionService, RESULTADOS_EVALUACION } from "../../services/evaluacionService";
import { formatFecha } from "../../utils/fechaFormatters";
import { evaluarSujeto } from "../../utils/evaluacionSujeto";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { StatusBadge, MAPA_ACTIVO_INACTIVO, MAPA_ESTADO_PARTICIPACION, MAPA_EVALUACION } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { CambiarEmpresaModal } from "../../components/personas/CambiarEmpresaModal";
import { CambiarProyectoModal } from "../../components/shared/CambiarProyectoModal";
import { DetalleEntidadLayout } from "../../components/shared/DetalleEntidadLayout";
import { KpiCard, KpiValor, KpiAnillo, TarjetaPanel, CampoInfo } from "../../components/shared/DetalleUI";
import { HistorialEventos } from "../../components/shared/EventosBitacora";
import { BotonesEdicion } from "../../components/shared/BotonesEdicion";
import { PersonaEdicionForm } from "../../components/personas/PersonaEdicionForm";
import { useEdicionInPlace } from "../../hooks/useEdicionInPlace";
import { GrupoRequerimientos } from "../../components/shared/RequerimientosLista";
import { aplicaRequerimientoASujeto } from "../../utils/aplicabilidadRequerimiento";

const ROLES_EVALUACION = ["superadmin", "evaluador"];

// Mismo criterio de categorización (peor caso primero) que PersonasListPage.jsx.
const ACREDITACION_PERSONA_MAP = {
  acreditada: { label: "Acreditada", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  pendiente: { label: "Pendiente", className: "bg-amber-50 text-amber-700 border-amber-200" },
  no_acreditada: { label: "No Acreditada", className: "bg-red-50 text-red-700 border-red-200" },
};

const categoriaDeEvaluaciones = (evaluaciones) => {
  if (evaluaciones.length === 0) return null;
  if (evaluaciones.some((ev) => ev.resultado === "no_cumple")) return "no_acreditada";
  if (evaluaciones.some((ev) => ev.resultado === "pendiente")) return "pendiente";
  if (evaluaciones.some((ev) => ev.resultado === "cumple")) return "acreditada";
  return null;
};

// "Mandantes" y "Proyectos" son tarjetas KPI acá, no pestañas: esas
// agregaciones tienen sentido para Empresa/Proyecto, no para un individuo.
const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "empresas", label: "Empresas" },
  { key: "proyectos", label: "Proyectos" },
  { key: "documentacion", label: "Documentación" },
  { key: "historial", label: "Historial" },
];

const segundosDe = (fecha) => (fecha?._seconds ? fecha._seconds : new Date(fecha || 0).getTime() / 1000);

export const PersonaDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);
  const puedeEvaluar = ROLES_EVALUACION.includes(profile?.rol);
  const esSuperadmin = profile?.rol === "superadmin";
  const [anonimizando, setAnonimizando] = useState(false);

  const [tab, setTab] = useState("resumen");
  const [persona, setPersona] = useState(null);
  // Una Persona anonimizada conserva su registro, pero ya no se opera sobre una identidad que no existe.
  const anonimizada = persona?.anonimizada === true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [empresasMap, setEmpresasMap] = useState({});
  const [proyectosMap, setProyectosMap] = useState({});
  const [participaciones, setParticipaciones] = useState([]);
  const [perfilesMap, setPerfilesMap] = useState({});
  // Participaciones de la Persona en Proyectos (agrupadas por Participación y estado, con sus perfiles).
  const [sujetos, setSujetos] = useState([]);
  const perfilesPorId = usePerfilesRecurso();
  const [expedientesTodos, setExpedientesTodos] = useState([]);
  const [evaluacionesTodas, setEvaluacionesTodas] = useState([]);
  const [historialEmpresas, setHistorialEmpresas] = useState([]);
  const [mandantesPorProyecto, setMandantesPorProyecto] = useState({});
  const [cargandoContexto, setCargandoContexto] = useState(true);

  const [toggleandoEstado, setToggleandoEstado] = useState(false);

  // Evaluación inline de un Requerimiento de nivel Persona, sin salir de
  // esta pantalla — mismo formulario y mismo endpoint
  // (evaluacionService.crear) que ExpedienteDetailPage.jsx y el detalle de Empresa.
  const [evaluacionAbierta, setEvaluacionAbierta] = useState(null); // {expedienteId, requerimientoId}
  const [resultadoForm, setResultadoForm] = useState(RESULTADOS_EVALUACION[0]?.value || "");
  const [observacionesForm, setObservacionesForm] = useState("");
  // Método de verificación: "" = documental (hay evidencia adjunta; el backend lo comprueba);
  // "presencial"/"otro" = sin documento, con justificación obligatoria en Observaciones.
  const [metodoForm, setMetodoForm] = useState("");
  const [evaluando, setEvaluando] = useState(false);
  const [errorEvaluacion, setErrorEvaluacion] = useState(null);

  const [cambiarEmpresaAbierto, setCambiarEmpresaAbierto] = useState(false);
  const [cambiarProyectoAbierto, setCambiarProyectoAbierto] = useState(false);

  const cargarPersona = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await personaService.obtenerPorId(id);
      setPersona(data);
    } catch (err) {
      console.error("Error al cargar la persona:", err);
      setError(err.message || "No se pudo cargar la persona.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPersona();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const {
    modoEdicion, iniciarEdicion, cancelar, alGuardar, confirmarSalida,
    guardando, setGuardando, setHayCambiosSinGuardar,
  } = useEdicionInPlace({ puedeEditar: puedeEscribir && !anonimizada, onGuardado: async () => { await cargarPersona(); await cargarContexto(); } });

  const cargarContexto = async () => {
    const [
      empresasData, proyectosData, participacionesData, perfilesData,
      sujetosData, expedientesData, evaluacionesData, historialData,
      resumenData,
    ] = await Promise.all([
      empresaService.listar(),
      proyectoService.listar({}),
      participacionService.listar({}),
      perfilParticipacionService.listar({}),
      sujetoService.listar({ personaId: id }),
      expedienteService.listar({}),
      evaluacionService.listarVigentes(),
      relacionLaboralService.listarPorPersona(id),
      // Mandante por Proyecto — se resuelve desde acá (no desde
      // mandanteService.listar()) porque GET /mandantes está restringido
      // a superadmin/admin_comercial; personaService.obtenerResumen ya lo
      // resuelve server-side para cualquier rol de lectura.
      personaService.obtenerResumen(id).catch(() => null),
    ]);

    const eMap = {};
    (empresasData || []).forEach((e) => { eMap[e.id] = e.razonSocial; });
    setEmpresasMap(eMap);

    const pMap = {};
    (proyectosData || []).forEach((p) => { pMap[p.id] = `${p.nombre} (${p.codigo})`; });
    setProyectosMap(pMap);

    setParticipaciones(participacionesData || []);

    const perfMap = {};
    (perfilesData || []).forEach((p) => { perfMap[p.id] = p.nombre; });
    setPerfilesMap(perfMap);

    setSujetos((sujetosData || []).filter((a) => a.personaId === id));
    setExpedientesTodos(expedientesData || []);
    setEvaluacionesTodas((evaluacionesData || []).filter((ev) => ev.personaId === id));
    setHistorialEmpresas(historialData || []);

    const mandanteMap = {};
    (resumenData?.participacionesActivas || []).forEach((a) => {
      mandanteMap[a.proyectoId] = { mandanteId: a.mandanteId, nombre: a.mandanteNombre, logoUrl: a.mandanteLogoUrl };
    });
    setMandantesPorProyecto(mandanteMap);
  };

  useEffect(() => {
    let cancelado = false;
    setCargandoContexto(true);
    cargarContexto()
      .catch((err) => console.error("Error al cargar el contexto de la persona:", err))
      .finally(() => { if (!cancelado) setCargandoContexto(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleToggleEstado = async () => {
    if (!persona) return;
    setToggleandoEstado(true);
    try {
      if (persona.estado === "activo") {
        await personaService.desactivar(persona.id);
      } else {
        await personaService.actualizar(persona.id, { estado: "activo" });
      }
      await cargarPersona();
    } catch (err) {
      console.error("Error al cambiar el estado de la persona:", err);
      setError(err.message || "No se pudo cambiar el estado de la persona.");
    } finally {
      setToggleandoEstado(false);
    }
  };

  const handleEmpresaCambiada = async () => {
    setCambiarEmpresaAbierto(false);
    await cargarPersona();
    await cargarContexto();
  };

  const handleProyectoCambiado = async () => {
    setCambiarProyectoAbierto(false);
    await cargarPersona();
    await cargarContexto();
  };

  if (loading) {
    return <div className="py-16 text-center text-slate-400 text-xs">Cargando persona...</div>;
  }

  if (!persona) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error || "Persona no encontrada."} />
      </div>
    );
  }

  const relacionActiva = historialEmpresas.find((r) => r.estado === "activa") || null;
  const historialOrdenado = [...historialEmpresas].sort((a, b) => segundosDe(b.fechaInicio) - segundosDe(a.fechaInicio));

  // "Proyectos Actuales": participaciones ACTIVAS de esta Persona. El Perfil de
  // Participación se hereda de la Participación (Empresa + Proyecto); sus Perfiles de
  // Recurso son los de sus documentos activos (rol = nombres, nunca guardados).
  const sujetosActivos = sujetos.filter((a) => a.estado === "activa");
  const filaDeSujeto = (a) => {
    const participacion = participaciones.find((p) => p.id === a.participacionId);
    const perfilNombre = participacion ? perfilesMap[participacion.perfilParticipacionId] : null;
    const expediente = expedientesTodos.find(
      (e) => e.participacionId === a.participacionId && e.estado !== "cerrado",
    ) || expedientesTodos.find((e) => e.participacionId === a.participacionId);
    const mandante = mandantesPorProyecto[a.proyectoId] || null;
    return {
      ...a, perfilNombre, expediente, rol: nombresPerfiles(a.perfilRecursoIds, perfilesPorId),
      mandanteId: mandante?.mandanteId, mandanteNombre: mandante?.nombre, mandanteLogoUrl: mandante?.logoUrl,
    };
  };
  const filasProyectos = sujetosActivos.map(filaDeSujeto);

  // "Historial de Participaciones": todas (cualquier estado).
  const historialParticipacionesOrdenado = [...sujetos]
    .map(filaDeSujeto)
    .sort((a, b) => segundosDe(b.fechaInicio) - segundosDe(a.fechaInicio));

  // Requerimientos que aplican a esta Persona (regla única, con el conjunto de sus
  // Perfiles de Recurso), agrupados por Proyecto (uno por cada participación
  // activa con Expediente abierto).
  const requerimientosPorProyecto = filasProyectos
    .filter((f) => f.expediente && f.expediente.estado !== "cerrado")
    .map((f) => {
      const items = (f.expediente.requerimientosAplicables || [])
        .filter((r) => aplicaRequerimientoASujeto(r, f))
        .map((r) => {
          const vigente = evaluacionesTodas.find(
            (ev) => ev.expedienteId === f.expediente.id && ev.requerimientoId === r.requerimientoId,
          );
          return { ...r, resultado: vigente?.resultado || "pendiente" };
        });
      const cumplen = items.filter((r) => r.resultado === "cumple").length;
      return {
        expedienteId: f.expediente.id,
        proyectoId: f.proyectoId,
        proyectoNombre: proyectosMap[f.proyectoId] || f.proyectoId,
        perfilNombre: f.perfilNombre,
        items,
        pctCumple: items.length > 0 ? Math.round((cumplen / items.length) * 100) : null,
      };
    })
    .filter((grupo) => grupo.items.length > 0);

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
        personaId: id,
        resultado: resultadoForm,
        observaciones: observacionesForm.trim() || null,
        ...(metodoForm ? { metodoVerificacion: metodoForm } : {}),
      });
      await cargarContexto();
      cerrarEvaluacion();
    } catch (err) {
      console.error("Error al guardar la evaluación:", err);
      setErrorEvaluacion(err.message || "No se pudo guardar la evaluación.");
    } finally {
      setEvaluando(false);
    }
  };

  // "Resumen Actual" (sidebar): último Proyecto = la participación activa más
  // reciente por fechaInicio; Perfil/Rol heredados de esa misma fila.
  const filaMasReciente = [...filasProyectos].sort((a, b) => segundosDe(b.fechaInicio) - segundosDe(a.fechaInicio))[0] || null;

  // --- KPIs ---
  // Acreditación: sobre el Expediente abierto de la participación más reciente.
  const expedienteRelevante = filaMasReciente?.expediente && filaMasReciente.expediente.estado !== "cerrado"
    ? filaMasReciente.expediente : null;
  const evaluacionesRelevantes = expedienteRelevante
    ? evaluacionesTodas.filter((ev) => ev.expedienteId === expedienteRelevante.id) : [];
  const categoriaKpi = categoriaDeEvaluaciones(evaluacionesRelevantes);

  // Mandantes DISTINTOS entre sus Participaciones activas.
  const mandantesDistintos = new Set(filasProyectos.map((f) => f.mandanteId).filter(Boolean)).size;

  // Cumplimiento: promedio del % de cada Participación activa (las que aún
  // no tienen nada evaluable no entran al promedio).
  const porcentajes = filasProyectos
    .map((f) => evaluarSujeto({
      expediente: f.expediente && f.expediente.estado !== "cerrado" ? f.expediente : null,
      vigentes: evaluacionesTodas, campo: "personaId", sujetoId: id, perfilRecursoIds: f.perfilRecursoIds,
    }).pctCumple)
    .filter((p) => p !== null);
  const cumplimientoPromedio = porcentajes.length > 0
    ? Math.round(porcentajes.reduce((a, b) => a + b, 0) / porcentajes.length) : null;

  const kpis = (
    <>
      <KpiCard titulo="Acreditación" subtexto={expedienteRelevante ? `${evaluacionesRelevantes.length} evaluados` : null}>
        {cargandoContexto ? <KpiValor listo={false} /> : !filaMasReciente ? (
          <span className="text-xs text-slate-400 italic">Sin asignación activa</span>
        ) : categoriaKpi ? (
          <StatusBadge value={categoriaKpi} map={ACREDITACION_PERSONA_MAP} />
        ) : (
          <span className="text-xs text-slate-400 italic">Sin evaluar</span>
        )}
      </KpiCard>
      <KpiCard titulo="Mandantes" subtexto="distintos">
        <KpiValor valor={mandantesDistintos} listo={!cargandoContexto} />
      </KpiCard>
      <KpiCard titulo="Proyectos" subtexto="activos">
        <KpiValor valor={sujetosActivos.length} listo={!cargandoContexto} />
      </KpiCard>
      <KpiCard titulo="Empresa">
        {cargandoContexto ? <KpiValor listo={false} /> : (
          <p className="text-sm font-black text-carbon-dark leading-snug">
            {relacionActiva ? (empresasMap[relacionActiva.empresaId] || relacionActiva.empresaId) : <span className="text-slate-400 italic font-medium">Sin Empresa activa</span>}
          </p>
        )}
      </KpiCard>
      <KpiCard titulo="Cumplimiento" subtexto={porcentajes.length > 1 ? "promedio de sus participaciones" : null}>
        <KpiAnillo pct={cargandoContexto ? undefined : cumplimientoPromedio} />
      </KpiCard>
    </>
  );

  const sidebar = (
    <>
      <TarjetaPanel titulo="Resumen Actual">
        <div className="space-y-3">
          <CampoInfo etiqueta="Mandante">
            {cargandoContexto ? "…" : filaMasReciente?.mandanteNombre
              ? <MandanteChip nombre={filaMasReciente.mandanteNombre} logoUrl={filaMasReciente.mandanteLogoUrl} size="xl" />
              : null}
          </CampoInfo>
          <CampoInfo etiqueta="Empresa Activa">
            {cargandoContexto ? "…" : (persona.empresaActivaId && empresasMap[persona.empresaActivaId]) || null}
          </CampoInfo>
          <CampoInfo etiqueta="Último Proyecto">
            {cargandoContexto ? "…" : (filaMasReciente && proyectosMap[filaMasReciente.proyectoId]) || null}
          </CampoInfo>
          <CampoInfo etiqueta="Perfil Principal (heredado de la Empresa/Expediente)">
            {cargandoContexto ? "…" : (filaMasReciente && filaMasReciente.perfilNombre) || null}
          </CampoInfo>
          <CampoInfo etiqueta="Función Actual">
            {cargandoContexto ? "…" : (filaMasReciente && formatCatalogo(filaMasReciente.rol)) || null}
          </CampoInfo>
        </div>
      </TarjetaPanel>

      <TarjetaPanel titulo="Datos Personales">
        <div className="space-y-3">
          <CampoInfo etiqueta="Nombre Completo">{persona.nombre} {persona.apellido}</CampoInfo>
          <CampoInfo etiqueta="RUT">{anonimizada ? "Anonimizado" : persona.rut}</CampoInfo>
          <CampoInfo etiqueta="Estado"><StatusBadge value={persona.estado} map={MAPA_ACTIVO_INACTIVO} /></CampoInfo>
        </div>
      </TarjetaPanel>
      {anonimizada && esSuperadmin && <DocumentosIdentidadPurga personaId={id} />}
    </>
  );

  const cargandoTexto = <div className="py-6 text-center text-slate-400 text-xs">Cargando...</div>;

  // Empresa Activa: en Resumen, compacta; en la pestaña Empresas, completa.
  const tarjetaEmpresaActiva = (completa) => (
    <TarjetaPanel
      titulo="Empresa Activa"
      Icono={Briefcase}
      accion={completa && puedeEscribir && modoEdicion ? (
        <ActionButton onClick={() => setCambiarEmpresaAbierto(true)} icon={Building2}>
          Cambiar Empresa
        </ActionButton>
      ) : null}
    >
      {cargandoContexto ? cargandoTexto : !relacionActiva ? (
        <div className="py-6 text-center text-slate-400 text-xs">
          Esta Persona no tiene una relación laboral activa todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CampoInfo etiqueta="Empresa">{empresasMap[relacionActiva.empresaId] || relacionActiva.empresaId}</CampoInfo>
          <CampoInfo etiqueta="Función">{relacionActiva.cargo}</CampoInfo>
          {completa && <CampoInfo etiqueta="Tipo de Contrato">{relacionActiva.tipoContrato}</CampoInfo>}
          {completa && <CampoInfo etiqueta="Jornada">{relacionActiva.jornada}</CampoInfo>}
          <CampoInfo etiqueta="Fecha Inicio">{formatFecha(relacionActiva.fechaInicio)}</CampoInfo>
          <CampoInfo etiqueta="Estado"><StatusBadge value={relacionActiva.estado} map={MAPA_ESTADO_PARTICIPACION} /></CampoInfo>
        </div>
      )}
    </TarjetaPanel>
  );

  const encabezadoTabla = "text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100";

  return (
    <>
      <DetalleEntidadLayout
        onVolver={() => { if (confirmarSalida()) navigate("/personas"); }}
        titulo={`${persona.nombre} ${persona.apellido}`}
        subtitulo={`${anonimizada ? "RUT anonimizado" : `RUT ${persona.rut}`} · Registrada el ${formatFecha(persona.createdAt)}`}
        badge={(
          <>
            {anonimizada && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-slate-100 text-slate-600 border-slate-300">
                <ShieldOff className="w-3 h-3" /> Datos anonimizados
              </span>
            )}
            <StatusBadge value={persona.estado} map={MAPA_ACTIVO_INACTIVO} />
          </>
        )}
        acciones={(puedeEscribir || esSuperadmin) && (
          <>
            {puedeEscribir && !anonimizada && (
              <BotonesEdicion
                modoEdicion={modoEdicion}
                guardando={guardando}
                formId="persona-edicion-form"
                onEditar={iniciarEdicion}
                onCancelar={cancelar}
              />
            )}
            <RowActionsMenu
              actions={[
                puedeEscribir && !anonimizada && {
                  label: persona.estado === "activo" ? "Desactivar persona" : "Activar persona",
                  icon: Power,
                  disabled: toggleandoEstado,
                  onClick: handleToggleEstado,
                },
                // Acción excepcional: solo superadmin, dentro del menú y no como botón principal.
                esSuperadmin && !anonimizada && {
                  label: "Anonimizar datos personales",
                  icon: ShieldOff,
                  onClick: () => setAnonimizando(true),
                },
              ].filter(Boolean)}
            />
          </>
        )}
        error={error}
        kpis={kpis}
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        sidebar={sidebar}
      >
        {/* ---------------- Resumen ---------------- */}
        {modoEdicion && (
          <div className={tab === "resumen" ? "" : "hidden"}>
            <PersonaEdicionForm
              idEntidad={id}
              formId="persona-edicion-form"
              enDetalle
              onGuardado={alGuardar}
              onDirtyChange={setHayCambiosSinGuardar}
              onGuardandoChange={setGuardando}
            />
          </div>
        )}

        {!modoEdicion && tab === "resumen" && (
          <>
            {tarjetaEmpresaActiva(false)}

            <TarjetaPanel titulo="Proyectos Actuales">
              {cargandoContexto ? cargandoTexto : filasProyectos.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">Sin participaciones activas en Proyectos.</div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={encabezadoTabla}>
                        <th className="py-2.5 px-2">Proyecto</th>
                        <th className="py-2.5 px-2">Mandante</th>
                        <th className="py-2.5 px-2">Rol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasProyectos.map((f) => (
                        <tr key={f.id}>
                          <td className="py-2.5 px-2 font-bold text-carbon-dark">{proyectosMap[f.proyectoId] || f.proyectoId}</td>
                          <td className="py-2.5 px-2">
                            {f.mandanteNombre ? <MandanteChip nombre={f.mandanteNombre} logoUrl={f.mandanteLogoUrl} size="lg" /> : <span className="text-slate-300 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{formatCatalogo(f.rol)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TarjetaPanel>
          </>
        )}

        {/* ---------------- Empresas ---------------- */}
        {tab === "empresas" && (
          <>
            {tarjetaEmpresaActiva(true)}

            <TarjetaPanel titulo="Historial de Empresas">
              {cargandoContexto ? cargandoTexto : historialOrdenado.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">Sin relaciones laborales registradas.</div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={encabezadoTabla}>
                        <th className="py-2.5 px-2">Empresa</th>
                        <th className="py-2.5 px-2">Tipo de Relación</th>
                        <th className="py-2.5 px-2">Función</th>
                        <th className="py-2.5 px-2">Fecha Inicio</th>
                        <th className="py-2.5 px-2">Fecha Fin</th>
                        <th className="py-2.5 px-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historialOrdenado.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-2 font-bold text-carbon-dark">{empresasMap[r.empresaId] || r.empresaId}</td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">
                            {r.tipoRelacion || <span className="text-slate-400 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{r.cargo}</td>
                          <td className="py-2.5 px-2 text-slate-500 font-medium">{formatFecha(r.fechaInicio)}</td>
                          <td className="py-2.5 px-2 text-slate-500 font-medium">
                            {r.fechaTermino ? formatFecha(r.fechaTermino) : <span className="text-slate-400 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2"><StatusBadge value={r.estado} map={MAPA_ESTADO_PARTICIPACION} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TarjetaPanel>
          </>
        )}

        {/* ---------------- Proyectos ---------------- */}
        {tab === "proyectos" && (
          <>
            <TarjetaPanel
              titulo="Proyectos Actuales"
              accion={puedeEscribir && modoEdicion ? (
                <div className="flex items-center gap-2">
                  <ActionButton onClick={() => setCambiarProyectoAbierto(true)} icon={FolderKanban}>
                    {sujetosActivos.length > 0 ? "Cambiar Proyecto" : "Asignar a Proyecto"}
                  </ActionButton>
                  <ActionButton as={Link} to={`/acreditaciones/reemplazar?entidadTipo=persona&entidadId=${id}`} icon={Repeat}>
                    Reemplazar Acreditación
                  </ActionButton>
                </div>
              ) : null}
            >
              {cargandoContexto ? cargandoTexto : filasProyectos.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">Sin participaciones activas en Proyectos.</div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={encabezadoTabla}>
                        <th className="py-2.5 px-2">Proyecto</th>
                        <th className="py-2.5 px-2">Mandante</th>
                        <th className="py-2.5 px-2">Empresa (contexto)</th>
                        <th className="py-2.5 px-2">Rol(es)</th>
                        <th className="py-2.5 px-2">Perfil</th>
                        <th className="py-2.5 px-2">Expediente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasProyectos.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-2 font-bold text-carbon-dark">{proyectosMap[f.proyectoId] || f.proyectoId}</td>
                          <td className="py-2.5 px-2">
                            {f.mandanteNombre ? <MandanteChip nombre={f.mandanteNombre} logoUrl={f.mandanteLogoUrl} size="lg" /> : <span className="text-slate-300 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{empresasMap[f.empresaId] || f.empresaId}</td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{formatCatalogo(f.rol)}</td>
                          <td className="py-2.5 px-2" title="Definido en el Expediente de la Empresa, no editable desde acá">
                            {f.perfilNombre ? <span className="text-slate-400 italic">{f.perfilNombre}</span> : <span className="text-slate-300 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2">
                            {f.expediente ? (
                              <Link to={`/expedientes/${f.expediente.id}`} className="inline-flex items-center gap-1 text-primary hover:text-primary-dark font-bold">
                                <FileCheck2 className="w-3.5 h-3.5" /> Ver
                              </Link>
                            ) : <span className="text-slate-300 italic">-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TarjetaPanel>

            <TarjetaPanel titulo="Historial de Participaciones">
              {cargandoContexto ? cargandoTexto : historialParticipacionesOrdenado.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">Sin participaciones en Proyectos registradas.</div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={encabezadoTabla}>
                        <th className="py-2.5 px-2">Proyecto</th>
                        <th className="py-2.5 px-2">Perfil</th>
                        <th className="py-2.5 px-2">Rol</th>
                        <th className="py-2.5 px-2">Fecha Inicio</th>
                        <th className="py-2.5 px-2">Fecha Fin</th>
                        <th className="py-2.5 px-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historialParticipacionesOrdenado.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-2 font-bold text-carbon-dark">{proyectosMap[f.proyectoId] || f.proyectoId}</td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{f.perfilNombre || <span className="text-slate-300 italic">-</span>}</td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{formatCatalogo(f.rol)}</td>
                          <td className="py-2.5 px-2 text-slate-500 font-medium">{formatFecha(f.fechaInicio)}</td>
                          <td className="py-2.5 px-2 text-slate-500 font-medium">
                            {f.fechaTermino ? formatFecha(f.fechaTermino) : <span className="text-slate-400 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2"><StatusBadge value={f.estado} map={MAPA_ESTADO_PARTICIPACION} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TarjetaPanel>

            <TarjetaPanel titulo="Requerimientos de Evaluación">
              {cargandoContexto ? cargandoTexto : requerimientosPorProyecto.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">Sin Requerimientos de nivel Persona aplicables.</div>
              ) : (
                <div className="space-y-4">
                  {requerimientosPorProyecto.map((grupo) => {
                    const abierta = (r) =>
                      evaluacionAbierta?.expedienteId === grupo.expedienteId &&
                      evaluacionAbierta?.requerimientoId === r.requerimientoId;
                    return (
                      <GrupoRequerimientos
                        key={grupo.expedienteId}
                        titulo={grupo.proyectoNombre}
                        subtitulo={grupo.perfilNombre}
                        pctCumple={grupo.pctCumple}
                        items={grupo.items}
                        renderEstado={(r) => (
                          <div className="flex items-center gap-2">
                            <StatusBadge value={r.resultado} map={MAPA_EVALUACION} />
                            {puedeEvaluar && !abierta(r) && (
                              <ActionButton icon={ClipboardCheck} onClick={() => abrirEvaluacion(grupo.expedienteId, r.requerimientoId)}>
                                Evaluar
                              </ActionButton>
                            )}
                          </div>
                        )}
                        renderDetalle={(r) => abierta(r) && (
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
                        )}
                      />
                    );
                  })}
                </div>
              )}
            </TarjetaPanel>
          </>
        )}

        {/* ---------------- Documentación ---------------- */}
        {tab === "documentacion" && (
          <div className="bg-white p-10 rounded-2xl border border-slate-100 shadow-card text-center space-y-2">
            <FileText className="w-6 h-6 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-400">Aún no hay documentos a nivel Persona.</p>
          </div>
        )}

        {/* ---------------- Historial ---------------- */}
        {tab === "historial" && (
          <HistorialEventos entidadId={id} cargar={(limit) => personaService.obtenerEventos(id, { limit })} />
        )}
      </DetalleEntidadLayout>

      {cambiarEmpresaAbierto && (
        <CambiarEmpresaModal
          personaId={id}
          empresaActualNombre={relacionActiva ? empresasMap[relacionActiva.empresaId] : null}
          onCambiado={handleEmpresaCambiada}
          onCerrar={() => setCambiarEmpresaAbierto(false)}
        />
      )}

      {cambiarProyectoAbierto && (
        <CambiarProyectoModal
          entidadTipo="persona"
          entidadId={id}
          tieneParticipacionActiva={sujetosActivos.length > 0}
          onCambiado={handleProyectoCambiado}
          onCerrar={() => setCambiarProyectoAbierto(false)}
        />
      )}
      {anonimizando && (
        <AnonimizarPersonaModal
          personaId={id}
          onCerrar={() => setAnonimizando(false)}
          onAnonimizada={async () => { setAnonimizando(false); await cargarPersona(); await cargarContexto(); }}
        />
      )}
    </>
  );
};
