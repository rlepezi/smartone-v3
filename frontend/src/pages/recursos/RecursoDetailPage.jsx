import React, { useEffect, useRef, useState } from "react";
import { PatenteChip } from "../../components/shared/PatenteChip";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Power, Truck, FileCheck2, ClipboardList, Wrench, Repeat, Building2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { recursoService } from "../../services/recursoService";
import { TerminarRelacionAccion } from "../../components/shared/TerminarRelacionAccion";
import { empresaService } from "../../services/empresaService";
import { mandanteService } from "../../services/mandanteService";
import { proyectoService } from "../../services/proyectoService";
import { participacionService } from "../../services/participacionService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { sujetoService, nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";
import { expedienteService } from "../../services/expedienteService";
import { expedienteRequerimientoService } from "../../services/expedienteRequerimientoService";
import { formatFecha } from "../../utils/fechas";
import { createdAtMillis } from "../../utils/deltaCalculos";
import { evaluarSujeto } from "../../utils/cumplimientoCalculos";
import { formatCatalogo } from "../../utils/formatCatalogo";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { ActionButton } from "../../components/shared/ActionButton";
import { StatusBadge, MAPA_ACTIVO_INACTIVO, MAPA_ESTADO_PARTICIPACION, MAPA_EVALUACION } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { CambiarEmpresaRecursoModal } from "../../components/recursos/CambiarEmpresaRecursoModal";
import { CambiarProyectoModal } from "../../components/shared/CambiarProyectoModal";
import { DetalleEntidadLayout } from "../../components/shared/DetalleEntidadLayout";
import { KpiCard, KpiValor, KpiAnillo, TarjetaPanel, CampoInfo } from "../../components/shared/DetalleUI";
import { HistorialEventos } from "../../components/shared/EventosBitacora";
import { BotonesEdicion } from "../../components/shared/BotonesEdicion";
import { RecursoEdicionForm } from "../../components/recursos/RecursoEdicionForm";
import { useEdicionInPlace } from "../../hooks/useEdicionInPlace";

// Espejo del mismo criterio ya usado en RecursosListPage.jsx: peor caso
// entre las Evaluaciones vigentes de este Recurso decide su categoría.
const ACREDITACION_MAP = {
  acreditado: { label: "Acreditado", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  en_proceso: { label: "En Proceso", className: "bg-amber-50 text-amber-700 border-amber-200" },
  no_acreditado: { label: "No Acreditado", className: "bg-red-50 text-red-700 border-red-200" },
};

// Mismas pestañas que Persona: "Mandantes" y "Proyectos" son tarjetas KPI, no
// pestañas. "Documentación" reúne los Requerimientos de nivel Maquinaria y sus
// Mantenciones (los que requieren vencimiento).
const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "empresas", label: "Empresas" },
  { key: "proyectos", label: "Proyectos" },
  { key: "documentacion", label: "Documentación" },
  { key: "historial", label: "Historial" },
];

// Función de módulo (no un hook) para que el uso de Date.now() no quede
// dentro del cuerpo de render del componente — mismo criterio que
// calcularDeltaPeriodo en utils/deltaCalculos.js.
const proximoVencimientoDe = (evaluaciones) => {
  const ahora = Date.now();
  const futuros = evaluaciones
    .map((ev) => ({ ev, millis: ev.fechaVencimiento ? createdAtMillis({ createdAt: ev.fechaVencimiento }) : null }))
    .filter((v) => v.millis && v.millis >= ahora)
    .sort((a, b) => a.millis - b.millis);
  return futuros[0] || null;
};

// Tabla de Requerimientos de la Maquinaria (sus instancias activas en sus Expedientes) —
// compartida por "Documentación" (todas) y "Mantenciones" (solo requiereVencimiento). Cada fila
// lleva al detalle del Expediente, con los requisitos de esta Maquinaria abiertos, para evaluar
// o ajustar (`onAbrir`).
const AYUDA_FILA = "Ir al expediente para evaluar o ajustar este requerimiento";
const TablaRequerimientos = ({ items, onAbrir }) => (
  <div className="overflow-x-auto -mx-2">
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
          <th className="py-2.5 px-2">Requerimiento</th>
          <th className="py-2.5 px-2">Estado</th>
          <th className="py-2.5 px-2">Vence</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((r) => {
          const estado = r.evaluacionVigenteId ? r.resultado : null;
          return (
            <tr
              key={r.id}
              tabIndex={0}
              role="link"
              title={AYUDA_FILA}
              aria-label={`${r.nombre}: ${AYUDA_FILA}`}
              onClick={() => onAbrir(r)}
              onKeyDown={(e) => { if (e.key === "Enter") onAbrir(r); }}
              className="group cursor-pointer hover:bg-primary-lighter/40 focus:outline-none focus-visible:bg-primary-lighter/40 transition-colors"
            >
              <td className="py-2.5 px-2">
                <p className="font-bold text-carbon-dark">{r.nombre}</p>
                {r.descripcion && <p className="text-[11px] text-slate-400">{r.descripcion}</p>}
                <p className="text-[11px] font-semibold text-primary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  {AYUDA_FILA} →
                </p>
              </td>
              <td className="py-2.5 px-2">
                {estado ? (
                  <StatusBadge value={estado} map={MAPA_EVALUACION} />
                ) : (
                  <span className="text-[11px] text-slate-400 italic">Sin Evaluar</span>
                )}
              </td>
              <td className="py-2.5 px-2 text-slate-500 font-medium">
                {r.fechaVencimiento ? formatFecha(r.fechaVencimiento) : <span className="text-slate-300 italic">-</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const RecursoDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  // Detalle del Expediente del requerimiento, con los requisitos de esta Maquinaria abiertos.
  const abrirEnExpediente = (r) => navigate(`/expedientes/${r.expedienteId}?tab=recurso&sujeto=${id}`);
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [recurso, setRecurso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // `?tab=historial` (desde la Actividad Reciente del Dashboard) abre directo esa pestaña.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === searchParams.get("tab")) ? searchParams.get("tab") : "resumen"));

  const [empresasMap, setEmpresasMap] = useState({});
  const [proyectosMap, setProyectosMap] = useState({});
  const [proyectoMandanteIdMap, setProyectoMandanteIdMap] = useState({});
  const [mandantesCache, setMandantesCache] = useState({});
  const mandantesEnCursoRef = useRef(new Set());
  const [participaciones, setParticipaciones] = useState([]);
  const [perfilesMap, setPerfilesMap] = useState({});
  // Participaciones de la Maquinaria en Proyectos (agrupadas, con su Perfil de Recurso).
  const [sujetos, setSujetos] = useState([]);
  const perfilesPorId = usePerfilesRecurso();
  const [expedientesTodos, setExpedientesTodos] = useState([]);
  const [requerimientosMaquinaria, setRequerimientosMaquinaria] = useState([]);
  const [historialEmpresas, setHistorialEmpresas] = useState([]);
  const [cargandoContexto, setCargandoContexto] = useState(true);

  const [toggleandoEstado, setToggleandoEstado] = useState(false);
  const [cambiarEmpresaAbierto, setCambiarEmpresaAbierto] = useState(false);
  const [cambiarProyectoAbierto, setCambiarProyectoAbierto] = useState(false);

  const cargarRecurso = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await recursoService.obtenerPorId(id);
      setRecurso(data);
    } catch (err) {
      console.error("Error al cargar la maquinaria:", err);
      setError(err.message || "No se pudo cargar la maquinaria.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarRecurso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const {
    modoEdicion, iniciarEdicion, cancelar, alGuardar, confirmarSalida,
    guardando, setGuardando, setHayCambiosSinGuardar,
  } = useEdicionInPlace({ puedeEditar: puedeEscribir, onGuardado: async () => { await cargarRecurso(); } });

  useEffect(() => {
    let cancelado = false;
    const cargarContexto = async () => {
      setCargandoContexto(true);
      try {
        const [
          empresasData, proyectosData, participacionesData, perfilesData,
          sujetosData, expedientesData, instanciasData,
          historialData,
        ] = await Promise.all([
          empresaService.listar(),
          proyectoService.listar({}),
          participacionService.listar({}),
          perfilParticipacionService.listar({}),
          sujetoService.listar({ recursoId: id }),
          expedienteService.listar({}),
          // Instancias de Requerimiento de esta Maquinaria en sus Expedientes (activas).
          expedienteRequerimientoService.listarPorSujeto({ recursoId: id }).catch(() => []),
          recursoService.listarRelaciones(id).catch(() => []),
        ]);
        if (cancelado) return;

        const eMap = {};
        (empresasData || []).forEach((e) => { eMap[e.id] = e.razonSocial; });
        setEmpresasMap(eMap);

        const pMap = {};
        const pMandanteMap = {};
        (proyectosData || []).forEach((p) => {
          pMap[p.id] = `${p.nombre} (${p.codigo})`;
          pMandanteMap[p.id] = p.mandanteId;
        });
        setProyectosMap(pMap);
        setProyectoMandanteIdMap(pMandanteMap);

        setParticipaciones(participacionesData || []);

        const perfMap = {};
        (perfilesData || []).forEach((p) => { perfMap[p.id] = p.nombre; });
        setPerfilesMap(perfMap);

        // Para mandante_admin/lector el backend ignora el filtro recursoId
        // (fuerza su Mandante): se acota acá a este Recurso.
        setSujetos((sujetosData || []).filter((a) => a.recursoId === id));
        setExpedientesTodos(expedientesData || []);
        setRequerimientosMaquinaria(instanciasData || []);
        setHistorialEmpresas(historialData || []);
      } catch (err) {
        console.error("Error al cargar el contexto de la maquinaria:", err);
      } finally {
        if (!cancelado) setCargandoContexto(false);
      }
    };
    cargarContexto();
    return () => { cancelado = true; };
  }, [id]);

  // Mandante de cada Proyecto en el que este Recurso tiene alguna participación —
  // Recurso no tiene un Mandante propio, se muestra el del Proyecto. GET
  // /mandantes/:id es accesible para los 5 roles, así que se resuelve por
  // Proyecto con cache y control de "en curso" (mismo patrón que
  // ProyectosListPage.jsx).
  const idsMandanteDistintosKey = [...new Set(Object.values(proyectoMandanteIdMap).filter(Boolean))].join(",");

  useEffect(() => {
    if (!idsMandanteDistintosKey) return;
    const idsVisibles = [...new Set(idsMandanteDistintosKey.split(","))];
    const idsFaltantes = idsVisibles.filter(
      (mid) => !(mid in mandantesCache) && !mandantesEnCursoRef.current.has(mid),
    );
    if (idsFaltantes.length === 0) return;

    idsFaltantes.forEach((mid) => mandantesEnCursoRef.current.add(mid));
    Promise.all(
      idsFaltantes.map((mid) =>
        mandanteService.obtenerPorId(mid)
          .then((data) => [mid, { nombre: getMandanteDisplayName(data) || mid, logoUrl: data?.logoUrl || null }])
          .catch(() => [mid, { nombre: mid, logoUrl: null }]),
      ),
    ).then((pares) => {
      setMandantesCache((prev) => {
        const next = { ...prev };
        pares.forEach(([mid, info]) => { next[mid] = info; });
        return next;
      });
      idsFaltantes.forEach((mid) => mandantesEnCursoRef.current.delete(mid));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsMandanteDistintosKey]);

  const handleToggleEstado = async () => {
    if (!recurso) return;
    setToggleandoEstado(true);
    try {
      if (recurso.estado === "activo") {
        await recursoService.desactivar(recurso.id);
      } else {
        await recursoService.actualizar(recurso.id, { estado: "activo" });
      }
      await cargarRecurso();
    } catch (err) {
      console.error("Error al cambiar el estado de la maquinaria:", err);
      setError(err.message || "No se pudo cambiar el estado de la maquinaria.");
    } finally {
      setToggleandoEstado(false);
    }
  };

  const handleEmpresaCambiada = async () => {
    setCambiarEmpresaAbierto(false);
    await cargarRecurso();
    const historialData = await recursoService.listarRelaciones(id).catch(() => []);
    setHistorialEmpresas(historialData || []);
  };

  const handleProyectoCambiado = () => {
    setCambiarProyectoAbierto(false);
    cargarRecurso();
    sujetoService.listar({ recursoId: id })
      .then((data) => setSujetos((data || []).filter((a) => a.recursoId === id)))
      .catch((err) => console.error("Error al recargar participaciones:", err));
  };

  if (loading) {
    return <div className="py-16 text-center text-slate-400 text-xs">Cargando maquinaria...</div>;
  }

  if (!recurso) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error || "Maquinaria no encontrada."} />
      </div>
    );
  }

  // Resultados vigentes de esta Maquinaria (copiados en cada instancia activa): base de "Estado
  // de Acreditación" y "Próximo vencimiento".
  const evaluacionesPropias = requerimientosMaquinaria
    .filter((i) => i.evaluacionVigenteId)
    .map((i) => ({ resultado: i.resultado, fechaVencimiento: i.fechaVencimiento }));

  const categoriaDeEvaluaciones = (evaluaciones) => {
    if (evaluaciones.length === 0) return null;
    if (evaluaciones.some((ev) => ev.resultado === "no_cumple")) return "no_acreditado";
    if (evaluaciones.some((ev) => ev.resultado === "pendiente")) return "en_proceso";
    if (evaluaciones.some((ev) => ev.resultado === "cumple")) return "acreditado";
    return null;
  };
  const categoriaAcreditacion = categoriaDeEvaluaciones(evaluacionesPropias);

  const proximoVencimiento = proximoVencimientoDe(evaluacionesPropias);

  const sujetosOrdenados = [...sujetos].sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
  const tieneParticipacionActivaRecurso = sujetos.some((a) => a.estado === "activa");
  const ultimoProyecto = sujetosOrdenados[0] || null;

  const filaDeSujeto = (a) => {
    const participacion = participaciones.find((p) => p.id === a.participacionId);
    const perfilNombre = participacion ? perfilesMap[participacion.perfilParticipacionId] : null;
    const expediente = expedientesTodos.find(
      (e) => e.participacionId === a.participacionId && e.estado !== "cerrado",
    ) || expedientesTodos.find((e) => e.participacionId === a.participacionId);
    const mandanteId = proyectoMandanteIdMap[a.proyectoId];
    const mandante = mandanteId ? mandantesCache[mandanteId] : null;
    return { ...a, perfilNombre, expediente, clasificacion: nombresPerfiles(a.perfilRecursoIds, perfilesPorId), mandanteId, mandanteNombre: mandante?.nombre, mandanteLogoUrl: mandante?.logoUrl };
  };
  const filasSujetos = sujetosOrdenados.map(filaDeSujeto);
  const filasActivas = filasSujetos.filter((f) => f.estado === "activa");

  const requerimientosMantencion = requerimientosMaquinaria.filter((r) => r.requiereVencimiento);

  const relacionActiva = historialEmpresas.find((r) => r.estado === "activa") || null;
  const historialOrdenado = [...historialEmpresas].sort((a, b) => {
    const fa = a.fechaInicio?._seconds ? a.fechaInicio._seconds : new Date(a.fechaInicio || 0).getTime() / 1000;
    const fb = b.fechaInicio?._seconds ? b.fechaInicio._seconds : new Date(b.fechaInicio || 0).getTime() / 1000;
    return fb - fa;
  });

  // --- KPIs ---
  // Acreditación: sobre el Expediente abierto de la participación activa más reciente.
  const expedienteRelevante = filasActivas[0]?.expediente && filasActivas[0].expediente.estado !== "cerrado"
    ? filasActivas[0].expediente : null;
  const evaluacionesRelevantes = expedienteRelevante
    ? evaluacionesPropias.filter((ev) => ev.expedienteId === expedienteRelevante.id) : [];
  const categoriaKpi = categoriaDeEvaluaciones(evaluacionesRelevantes);

  const mandantesDistintos = new Set(filasActivas.map((f) => f.mandanteId).filter(Boolean)).size;

  // Cumplimiento: promedio del % de cada Participación activa (las que aún no
  // tienen nada evaluable no entran al promedio).
  const porcentajes = filasActivas
    .map((f) => evaluarSujeto({
      expediente: f.expediente && f.expediente.estado !== "cerrado" ? f.expediente : null,
      vigentes: evaluacionesPropias, campo: "recursoId", sujetoId: id, perfilRecursoIds: f.perfilRecursoIds,
    }).pctCumple)
    .filter((p) => p !== null);
  const cumplimientoPromedio = porcentajes.length > 0
    ? Math.round(porcentajes.reduce((a, b) => a + b, 0) / porcentajes.length) : null;

  // Empresa actual: la de su relación activa (null si está fuera del alcance del usuario).
  const nombreEmpresa = recurso.empresaActual?.empresaNombre || null;

  const kpis = (
    <>
      <KpiCard titulo="Acreditación" subtexto={expedienteRelevante ? `${evaluacionesRelevantes.length} evaluados` : null}>
        {cargandoContexto ? <KpiValor listo={false} /> : filasActivas.length === 0 ? (
          <span className="text-xs text-slate-400 italic">Sin asignación activa</span>
        ) : categoriaKpi ? (
          <StatusBadge value={categoriaKpi} map={ACREDITACION_MAP} />
        ) : (
          <span className="text-xs text-slate-400 italic">Sin evaluar</span>
        )}
      </KpiCard>
      <KpiCard titulo="Mandantes" subtexto="distintos">
        <KpiValor valor={mandantesDistintos} listo={!cargandoContexto} />
      </KpiCard>
      <KpiCard titulo="Proyectos" subtexto="activos">
        <KpiValor valor={filasActivas.length} listo={!cargandoContexto} />
      </KpiCard>
      <KpiCard titulo="Empresa">
        <p className="text-sm font-black text-carbon-dark leading-snug">{nombreEmpresa}</p>
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
            {cargandoContexto ? "…" : ultimoProyecto && mandantesCache[proyectoMandanteIdMap[ultimoProyecto.proyectoId]] ? (
              <MandanteChip
                nombre={mandantesCache[proyectoMandanteIdMap[ultimoProyecto.proyectoId]].nombre}
                logoUrl={mandantesCache[proyectoMandanteIdMap[ultimoProyecto.proyectoId]].logoUrl}
                size="xl"
              />
            ) : null}
          </CampoInfo>
          <CampoInfo etiqueta="Empresa Propietaria">{nombreEmpresa}</CampoInfo>
          <CampoInfo etiqueta="Último Proyecto">
            {cargandoContexto ? "…" : (ultimoProyecto && proyectosMap[ultimoProyecto.proyectoId]) || null}
          </CampoInfo>
          <CampoInfo etiqueta="Tipo de maquinaria">{formatCatalogo(recurso.tipo)}</CampoInfo>
          <CampoInfo etiqueta="Estado de Acreditación">
            {cargandoContexto ? "…" : categoriaAcreditacion
              ? <StatusBadge value={categoriaAcreditacion} map={ACREDITACION_MAP} />
              : <span className="text-slate-400 italic">Sin Evaluar</span>}
          </CampoInfo>
          <CampoInfo etiqueta="Próximo Vencimiento Documental">
            {cargandoContexto ? "…" : proximoVencimiento
              ? formatFecha(proximoVencimiento.ev.fechaVencimiento)
              : <span className="text-slate-400 italic">Sin vencimientos próximos</span>}
          </CampoInfo>
        </div>
      </TarjetaPanel>

      <TarjetaPanel titulo="Datos de la Maquinaria">
        <div className="space-y-3">
          <CampoInfo etiqueta="Nombre">{recurso.nombre}</CampoInfo>
          <CampoInfo etiqueta={recurso.tipoIdentificacion === "serie" ? "N° de serie / código interno" : recurso.tipoIdentificacion === "patente" ? "Patente" : "Identificación"}>
            {recurso.patente ? <PatenteChip valor={recurso.patente} tipo={recurso.tipoIdentificacion} /> : null}
          </CampoInfo>
          <CampoInfo etiqueta="Marca">{recurso.marca}</CampoInfo>
          <CampoInfo etiqueta="Modelo">{recurso.modelo}</CampoInfo>
          <CampoInfo etiqueta="Año">{recurso.anio}</CampoInfo>
          <CampoInfo etiqueta="Estado"><StatusBadge value={recurso.estado} map={MAPA_ACTIVO_INACTIVO} /></CampoInfo>
        </div>
      </TarjetaPanel>
    </>
  );

  const cargandoTexto = <div className="py-6 text-center text-slate-400 text-xs">Cargando...</div>;
  const encabezadoTabla = "text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100";

  // Empresa propietaria activa: en Resumen, compacta; en la pestaña Empresas, completa.
  const tarjetaEmpresaActiva = (completa) => (
    <TarjetaPanel
      titulo="Empresa Activa"
      Icono={Truck}
      accion={completa && puedeEscribir && modoEdicion ? (
        <div className="flex items-center gap-2">
          {relacionActiva && (
            <TerminarRelacionAccion
              tipo="recurso"
              id={id}
              empresaNombre={relacionActiva.empresaNombre}
              onTerminada={handleEmpresaCambiada}
              onError={setError}
            />
          )}
          <ActionButton onClick={() => setCambiarEmpresaAbierto(true)} icon={Building2}>
            Cambiar Empresa
          </ActionButton>
        </div>
      ) : null}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CampoInfo etiqueta="Empresa Propietaria">
          {recurso.empresaActual ? (
            <Link to={`/empresas/${recurso.empresaActual.empresaId}`} className="text-primary hover:text-primary-dark font-bold">
              {nombreEmpresa}
            </Link>
          ) : null}
        </CampoInfo>
        <CampoInfo etiqueta="Tipo de Relación">{relacionActiva?.tipoRelacion}</CampoInfo>
        <CampoInfo etiqueta="Fecha Inicio">{relacionActiva ? formatFecha(relacionActiva.fechaInicio) : null}</CampoInfo>
        {completa && (
          <CampoInfo etiqueta="Estado">
            {relacionActiva ? <StatusBadge value={relacionActiva.estado} map={MAPA_ESTADO_PARTICIPACION} /> : null}
          </CampoInfo>
        )}
      </div>
    </TarjetaPanel>
  );

  return (
    <>
      <DetalleEntidadLayout
        onVolver={() => { if (confirmarSalida()) navigate("/recursos"); }}
        titulo={recurso.nombre}
        subtitulo={(
          <span className="inline-flex items-center flex-wrap gap-1.5">
            {formatCatalogo(recurso.tipo)}
            {recurso.patente && <>· <PatenteChip valor={recurso.patente} tipo={recurso.tipoIdentificacion} /></>}
            {nombreEmpresa && <>· {nombreEmpresa}</>}
          </span>
        )}
        badge={<StatusBadge value={recurso.estado} map={MAPA_ACTIVO_INACTIVO} />}
        acciones={puedeEscribir && (
          <>
            <BotonesEdicion
              modoEdicion={modoEdicion}
              guardando={guardando}
              formId="recurso-edicion-form"
              onEditar={iniciarEdicion}
              onCancelar={cancelar}
            />
            <RowActionsMenu
              actions={[
                {
                  label: recurso.estado === "activo" ? "Desactivar" : "Activar",
                  icon: Power,
                  disabled: toggleandoEstado,
                  onClick: handleToggleEstado,
                },
              ]}
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
            <RecursoEdicionForm
              idEntidad={id}
              formId="recurso-edicion-form"
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
              {cargandoContexto ? cargandoTexto : filasActivas.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">Sin participaciones activas en Proyectos.</div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={encabezadoTabla}>
                        <th className="py-2.5 px-2">Proyecto</th>
                        <th className="py-2.5 px-2">Mandante</th>
                        <th className="py-2.5 px-2">Clasificación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filasActivas.map((f) => (
                        <tr key={f.id}>
                          <td className="py-2.5 px-2 font-bold text-carbon-dark">{proyectosMap[f.proyectoId] || f.proyectoId}</td>
                          <td className="py-2.5 px-2">
                            {f.mandanteNombre ? <MandanteChip nombre={f.mandanteNombre} logoUrl={f.mandanteLogoUrl} size="lg" /> : <span className="text-slate-300 italic">-</span>}
                          </td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{f.clasificacion || formatCatalogo(recurso.tipo)}</td>
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
                <div className="py-6 text-center text-slate-400 text-xs">Sin relaciones de Empresa registradas.</div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={encabezadoTabla}>
                        <th className="py-2.5 px-2">Empresa</th>
                        <th className="py-2.5 px-2">Tipo de Relación</th>
                        <th className="py-2.5 px-2">Fecha Inicio</th>
                        <th className="py-2.5 px-2">Fecha Fin</th>
                        <th className="py-2.5 px-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historialOrdenado.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-2 font-bold text-carbon-dark">{r.empresaNombre || empresasMap[r.empresaId] || "-"}</td>
                          <td className="py-2.5 px-2 text-slate-600 font-medium">{r.tipoRelacion}</td>
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
          <TarjetaPanel
            titulo="Participación en Proyectos"
            accion={puedeEscribir && modoEdicion ? (
              <div className="flex items-center gap-2">
                <ActionButton onClick={() => setCambiarProyectoAbierto(true)} icon={Repeat}>
                  {tieneParticipacionActivaRecurso ? "Cambiar Proyecto" : "Asignar a Proyecto"}
                </ActionButton>
                <ActionButton as={Link} to={`/acreditaciones/reemplazar?entidadTipo=maquinaria&entidadId=${id}`} icon={Repeat}>
                  Reemplazar Acreditación
                </ActionButton>
              </div>
            ) : null}
          >
            {cargandoContexto ? cargandoTexto : filasSujetos.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs">Sin participaciones en Proyectos registradas.</div>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className={encabezadoTabla}>
                      <th className="py-2.5 px-2">Proyecto</th>
                      <th className="py-2.5 px-2">Mandante</th>
                      <th className="py-2.5 px-2">Empresa (contexto)</th>
                      <th className="py-2.5 px-2">Clasificación aplicada</th>
                      <th className="py-2.5 px-2">Fecha Inicio</th>
                      <th className="py-2.5 px-2">Fecha Fin</th>
                      <th className="py-2.5 px-2">Estado</th>
                      <th className="py-2.5 px-2">Expediente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filasSujetos.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-2 font-bold text-carbon-dark">{proyectosMap[f.proyectoId] || f.proyectoId}</td>
                        <td className="py-2.5 px-2">
                          {f.mandanteNombre ? <MandanteChip nombre={f.mandanteNombre} logoUrl={f.mandanteLogoUrl} size="lg" /> : <span className="text-slate-300 italic">-</span>}
                        </td>
                        <td className="py-2.5 px-2 text-slate-600 font-medium">{empresasMap[f.empresaId] || f.empresaId}</td>
                        <td className="py-2.5 px-2" title="Definido en el Perfil de Participación del Expediente de la Empresa, no editable desde acá">
                          <span className="text-slate-400 italic">{f.perfilNombre || formatCatalogo(recurso.tipo)}</span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-500 font-medium">{formatFecha(f.fechaInicio)}</td>
                        <td className="py-2.5 px-2 text-slate-500 font-medium">
                          {f.fechaTermino ? formatFecha(f.fechaTermino) : <span className="text-slate-300 italic">-</span>}
                        </td>
                        <td className="py-2.5 px-2"><StatusBadge value={f.estado} map={MAPA_ESTADO_PARTICIPACION} /></td>
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
        )}

        {/* ---------------- Documentación ---------------- */}
        {tab === "documentacion" && (
          <>
            <TarjetaPanel titulo="Documentación" Icono={ClipboardList}>
              <p className="text-[11px] text-slate-400">
                Todos los Requerimientos de nivel Maquinaria y su estado de evaluación para esta unidad. El detalle de evidencias se revisa desde el Expediente correspondiente (columna "Expediente" en Proyectos).
              </p>
              {cargandoContexto ? cargandoTexto : requerimientosMaquinaria.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">No hay Requerimientos de nivel Maquinaria en el catálogo.</div>
              ) : (
                <TablaRequerimientos items={requerimientosMaquinaria} onAbrir={abrirEnExpediente} />
              )}
            </TarjetaPanel>

            <TarjetaPanel titulo="Mantenciones" Icono={Wrench}>
              <p className="text-[11px] text-slate-400">
                Subconjunto de Documentación: solo los Requerimientos que requieren vencimiento (revisiones/certificaciones periódicas) — mismos Requerimientos/Evaluaciones de nivel Maquinaria.
              </p>
              {cargandoContexto ? cargandoTexto : requerimientosMantencion.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">No hay Requerimientos con vencimiento periódico en el catálogo.</div>
              ) : (
                <TablaRequerimientos items={requerimientosMantencion} onAbrir={abrirEnExpediente} />
              )}
            </TarjetaPanel>
          </>
        )}

        {/* ---------------- Historial ---------------- */}
        {tab === "historial" && (
          <HistorialEventos entidadId={id} cargar={(limit) => recursoService.obtenerEventos(id, { limit })} />
        )}
      </DetalleEntidadLayout>

      {cambiarEmpresaAbierto && (
        <CambiarEmpresaRecursoModal
          recursoId={id}
          empresaActualNombre={recurso.empresaActual?.empresaNombre || null}
          empresaActualId={recurso.empresaActual?.empresaId || null}
          onCambiado={handleEmpresaCambiada}
          onCerrar={() => setCambiarEmpresaAbierto(false)}
        />
      )}

      {cambiarProyectoAbierto && (
        <CambiarProyectoModal
          entidadTipo="recurso"
          entidadId={id}
          tieneParticipacionActiva={tieneParticipacionActivaRecurso}
          onCambiado={handleProyectoCambiado}
          onCerrar={() => setCambiarProyectoAbierto(false)}
        />
      )}
    </>
  );
};
