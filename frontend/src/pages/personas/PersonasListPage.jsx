import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate } from "react-router-dom";
import {
  Users, Power, Pencil, Eye, FolderKanban,
  CheckCircle2, Clock, XCircle, Building2,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { personaService } from "../../services/personaService";
import { empresaService } from "../../services/empresaService";
import { participacionService } from "../../services/participacionService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { expedienteService } from "../../services/expedienteService";
import { evaluacionService } from "../../services/evaluacionService";
import { sujetoService, nombresPerfiles } from "../../services/participacionSujetoService";
import { usePerfilesRecurso } from "../../hooks/usePerfilesRecurso";
import { proyectoService } from "../../services/proyectoService";
import { mandanteService } from "../../services/mandanteService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { calcularDeltaPeriodo } from "../../utils/deltaCalculos";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { EvaluacionCelda } from "../../components/shared/EvaluacionCelda";
import { CambiarEmpresaModal } from "../../components/personas/CambiarEmpresaModal";
import { CambiarProyectoModal } from "../../components/shared/CambiarProyectoModal";
import { evaluarSujeto } from "../../utils/cumplimientoCalculos";
import { CLASE_LINEA } from "../../utils/lineasAlineadas";
import { Pagination } from "../../components/shared/Pagination";
import { MandanteChip } from "../../components/shared/MandanteChip";

export const PersonasListPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);

  const [personas, setPersonas] = useState([]);
  const [empresasMap, setEmpresasMap] = useState({});
  // Mandantes asociados a cada Empresa (empresaMandantes activos): para mostrar el Mandante de una
  // Persona que todavía no está asignada a ningún Proyecto.
  const [mandantesDeEmpresa, setMandantesDeEmpresa] = useState({});
  const [perfilesMap, setPerfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtroAcreditacion, setFiltroAcreditacion] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroMandante, setFiltroMandante] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [toggleandoId, setToggleandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [personaCambiandoEmpresa, setPersonaCambiandoEmpresa] = useState(null);
  const [personaCambiandoProyecto, setPersonaCambiandoProyecto] = useState(null);

  // Una fila por Persona, pero Mandante/Proyecto/Perfil/Rol/Acreditación/
  // Evaluación se desglosan por participación activa (una línea por Proyecto, con sus perfiles).
  const [sujetosActivos, setSujetosActivos] = useState([]);
  const perfilesPorId = usePerfilesRecurso();
  const [cargandoSujetos, setCargandoSujetos] = useState(true);
  const [proyectosMap, setProyectosMap] = useState({});
  const [mandantesCache, setMandantesCache] = useState({});
  const mandantesEnCursoRef = useRef(new Set());

  // Datos para los KPI y columnas nuevas — ninguno se pedía antes en esta
  // pantalla. Participaciones/Expedientes/Evaluaciones ya se usan en
  // otras pantallas (Dashboard/Proyectos/Empresas); acá se cruzan por
  // personaId/proyectoId+empresaId en el cliente, sin endpoint nuevo.
  const [personasTodas, setPersonasTodas] = useState([]);
  const [cargandoPersonasTodas, setCargandoPersonasTodas] = useState(true);
  const [participacionesActivas, setParticipacionesActivas] = useState([]);
  const [expedientesTodos, setExpedientesTodos] = useState([]);
  const [evaluacionesTodas, setEvaluacionesTodas] = useState([]);
  const [cargandoEvaluaciones, setCargandoEvaluaciones] = useState(true);

  // Participaciones activas, Expedientes, Evaluaciones vigentes y personas asignadas
  // activas: base de las líneas por Participación y de los filtros.
  const cargarRelacionados = () => {
    participacionService.listar({ estado: "activa" })
      .then((data) => setParticipacionesActivas(data || []))
      .catch((err) => console.error("Error al cargar participaciones:", err));

    expedienteService.listar({})
      .then((data) => setExpedientesTodos(data || []))
      .catch((err) => console.error("Error al cargar expedientes:", err));

    evaluacionService.listarVigentes()
      .then((data) => setEvaluacionesTodas(data || []))
      .catch((err) => console.error("Error al cargar evaluaciones:", err))
      .finally(() => setCargandoEvaluaciones(false));

    sujetoService.listar({ estado: "activa" })
      .then((data) => setSujetosActivos(data || []))
      .catch((err) => console.error("Error al cargar participaciones de personas:", err))
      .finally(() => setCargandoSujetos(false));
  };

  const recargarTrasCambio = () => {
    cargarPersonas();
    cargarRelacionados();
  };

  const cargarPersonas = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await personaService.listar();
      setPersonas(data || []);
    } catch (err) {
      console.error("Error al cargar personas:", err);
      setError(err.message || "Error al obtener la lista de personas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPersonas();
  }, []);

  useEffect(() => {
    empresaService
      .listar()
      .then((data) => {
        const map = {};
        const mandantes = {};
        (data || []).forEach((e) => {
          map[e.id] = e.razonSocial;
          mandantes[e.id] = e.mandanteIds || [];
        });
        setEmpresasMap(map);
        setMandantesDeEmpresa(mandantes);
      })
      .catch((err) => console.error("Error al cargar empresas:", err));

    perfilParticipacionService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = p.nombre; });
        setPerfilesMap(map);
      })
      .catch((err) => console.error("Error al cargar perfiles de participación:", err));

    personaService.listar()
      .then((data) => setPersonasTodas(data || []))
      .catch((err) => console.error("Error al cargar personas:", err))
      .finally(() => setCargandoPersonasTodas(false));

    cargarRelacionados();

    proyectoService.listar({})
      .then((data) => {
        const map = {};
        (data || []).forEach((p) => { map[p.id] = p; });
        setProyectosMap(map);
      })
      .catch((err) => console.error("Error al cargar proyectos:", err));
  }, []);

  // Mandantes de los Proyectos y de las Empresas (nombre + logo), uno por id distinto.
  const idsMandanteKey = [...new Set([
    ...Object.values(proyectosMap).map((p) => p.mandanteId),
    ...Object.values(mandantesDeEmpresa).flat(),
  ].filter(Boolean))].join(",");
  useEffect(() => {
    if (!idsMandanteKey) return;
    const faltantes = idsMandanteKey.split(",").filter(
      (mid) => !(mid in mandantesCache) && !mandantesEnCursoRef.current.has(mid),
    );
    if (faltantes.length === 0) return;
    faltantes.forEach((mid) => mandantesEnCursoRef.current.add(mid));
    Promise.all(
      faltantes.map((mid) =>
        mandanteService
          .obtenerPorId(mid)
          .then((data) => [mid, { nombre: getMandanteDisplayName(data) || mid, logoUrl: data?.logoUrl || null }])
          .catch(() => [mid, { nombre: mid, logoUrl: null }]),
      ),
    ).then((pares) => {
      setMandantesCache((prev) => {
        const next = { ...prev };
        pares.forEach(([mid, info]) => { next[mid] = info; });
        return next;
      });
      faltantes.forEach((mid) => mandantesEnCursoRef.current.delete(mid));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsMandanteKey]);

  const handleToggleEstado = async (item) => {
    setToggleandoId(item.id);
    try {
      if (item.estado === "activo") {
        await personaService.desactivar(item.id);
      } else {
        await personaService.actualizar(item.id, { estado: "activo" });
      }
      await cargarPersonas();
    } catch (err) {
      console.error("Error al cambiar estado de la persona:", err);
      setError(err.message || "No se pudo cambiar el estado de la persona.");
    } finally {
      setToggleandoId(null);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [filtroAcreditacion, filtroProyecto, filtroMandante, filtroEmpresa, searchTerm]);

  // Evaluaciones propias de esta Persona (nivel Persona, personaId
  // coincide) — base de la categoría de acreditación.
  const evaluacionesDe = (personaId) => evaluacionesTodas.filter((ev) => ev.personaId === personaId);

  // Peor caso primero: un solo "no_cumple" ya la marca "No Acreditada".
  const categoriaAcreditacionDe = (personaId) => {
    const propias = evaluacionesDe(personaId);
    if (propias.length === 0) return null;
    if (propias.some((ev) => ev.resultado === "no_cumple")) return "no_acreditada";
    if (propias.some((ev) => ev.resultado === "pendiente")) return "pendiente";
    if (propias.some((ev) => ev.resultado === "cumple")) return "acreditada";
    return null;
  };

  // Una línea por participación activa de la Persona, con SU Mandante, Perfil,
  // Rol y Evaluación (Expediente de su Empresa en ese Proyecto) — nunca
  // agregados entre Proyectos.
  const participacionesDe = (persona) =>
    sujetosActivos
      .filter((a) => a.personaId === persona.id)
      .map((a) => {
        const proyecto = proyectosMap[a.proyectoId];
        const participacion = participacionesActivas.find((p) => p.id === a.participacionId);
        const expediente = expedientesTodos.find(
          (e) => e.participacionId === a.participacionId && e.estado !== "cerrado",
        );
        return {
          key: a.id,
          proyectoId: a.proyectoId,
          proyectoNombre: proyecto?.nombre || "-",
          mandanteId: proyecto?.mandanteId || null,
          mandante: proyecto?.mandanteId ? mandantesCache[proyecto.mandanteId] : null,
          rol: nombresPerfiles(a.perfilRecursoIds, perfilesPorId),
          perfilNombre: participacion ? perfilesMap[participacion.perfilParticipacionId] || null : null,
          evaluacion: evaluarSujeto({
            expediente, vigentes: evaluacionesTodas, campo: "personaId", sujetoId: persona.id,
            perfilRecursoIds: a.perfilRecursoIds,
          }),
        };
      });

  // Proyecto / Mandante / Acreditación se evalúan sobre la MISMA Participación
  // (una Persona aparece si alguna de sus líneas cumple todos los filtros).
  const calzaParticipaciones = (persona) => {
    if (!filtroProyecto && !filtroMandante && !filtroAcreditacion) return true;
    const partes = participacionesDe(persona);
    if (partes.length === 0) {
      // Sin asignación: su Mandante es el de su Empresa actual (empresaMandantes).
      const delMandante = !filtroMandante ||
        (mandantesDeEmpresa[persona.empresaActual?.empresaId] || []).includes(filtroMandante);
      return !filtroProyecto && delMandante && (!filtroAcreditacion || filtroAcreditacion === "sin_evaluar");
    }
    return partes.some((pt) =>
      (!filtroProyecto || pt.proyectoId === filtroProyecto) &&
      (!filtroMandante || pt.mandanteId === filtroMandante) &&
      (!filtroAcreditacion || pt.evaluacion.categoria === filtroAcreditacion),
    );
  };

  const personasFiltradas = personas.filter((p) => {
    const term = searchTerm.toLowerCase();
    const matchTerm =
      p.nombre?.toLowerCase().includes(term) ||
      p.apellido?.toLowerCase().includes(term) ||
      p.rut?.toLowerCase().includes(term) ||
      (p.empresaActual?.empresaNombre || "").toLowerCase().includes(term);
    const matchEmpresa = !filtroEmpresa || p.empresaActual?.empresaId === filtroEmpresa;
    return matchTerm && matchEmpresa && calzaParticipaciones(p);
  });

  const personasPaginadas = personasFiltradas.slice((page - 1) * pageSize, page * pageSize);

  // KPIs — sobre el alcance completo del actor (personasTodas, sin el
  // filtro de Estado de la tabla), igual que en Dashboard/Proyectos/Empresas.
  const personasActivasCount = personasTodas.filter((p) => p.estado === "activo").length;
  const deltaPersonasActivas = calcularDeltaPeriodo(personasTodas, 7);
  const categoriasCount = { acreditada: 0, pendiente: 0, no_acreditada: 0 };
  personasTodas.forEach((p) => {
    const cat = categoriaAcreditacionDe(p.id);
    if (cat) categoriasCount[cat]++;
  });
  const totalConEvaluacion = categoriasCount.acreditada + categoriasCount.pendiente + categoriasCount.no_acreditada;
  const pctDelTotal = (n) => (totalConEvaluacion > 0 ? Math.round((n / totalConEvaluacion) * 100) : 0);

  const resumenListo = !cargandoEvaluaciones && !cargandoPersonasTodas;

  const kpiCards = [
    {
      key: "activas", title: "Personas Activas", icon: Users,
      color: "text-primary-dark", bg: "bg-primary-lighter",
      loading: cargandoPersonasTodas, value: personasActivasCount,
      subtexto: !cargandoPersonasTodas && deltaPersonasActivas !== null
        ? `${deltaPersonasActivas >= 0 ? "+" : ""}${deltaPersonasActivas} esta semana` : null,
      subtextoClass: deltaPersonasActivas >= 0 ? "text-sage-dark" : "text-red-600",
    },
    {
      key: "acreditadas", title: "Acreditadas", icon: CheckCircle2,
      color: "text-sage-dark", bg: "bg-sage-lighter",
      loading: !resumenListo, value: categoriasCount.acreditada,
      subtexto: resumenListo ? `${pctDelTotal(categoriasCount.acreditada)}% del total` : null,
      subtextoClass: "text-sage-dark",
    },
    {
      key: "pendientes", title: "Pendientes", icon: Clock,
      color: "text-amber-600", bg: "bg-amber-100",
      loading: !resumenListo, value: categoriasCount.pendiente,
      subtexto: resumenListo ? `${pctDelTotal(categoriasCount.pendiente)}% del total` : null,
      subtextoClass: "text-amber-600",
    },
    {
      key: "noAcreditadas", title: "No Acreditadas", icon: XCircle,
      color: "text-red-600", bg: "bg-red-100",
      loading: !resumenListo, value: categoriasCount.no_acreditada,
      subtexto: resumenListo ? `${pctDelTotal(categoriasCount.no_acreditada)}% del total` : null,
      subtextoClass: "text-red-600",
    },
  ];

  const columns = [
    { key: "nombre", label: "Persona" },
    { key: "rut", label: "RUT" },
    { key: "mandante", label: "Mandante" },
    { key: "empresa", label: "Empresa" },
    { key: "cargo", label: "Función" },
    { key: "proyecto", label: "Proyecto" },
    { key: "estado", label: "Estado" },
    { key: "requerimientos", label: "Evaluación" },
    { key: "acciones", label: "Acciones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personas"
        icon={Users}
        subtitle="Administra las personas que participan en los proyectos de las empresas contratistas."
        loading={loading}
        onRefresh={cargarPersonas}
        action={puedeEscribir ? { to: "/personas/nuevo", label: "Nueva Persona" } : null}
      />

      <ErrorBanner message={error} />

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card">
              <div className={`w-11 h-11 rounded-xl ${item.bg} ${item.color} flex items-center justify-center font-bold mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              {item.loading ? (
                <div className="h-8 w-14 rounded-lg bg-slate-100 animate-pulse" />
              ) : (
                <h3 className="text-2xl font-black text-carbon-dark tracking-tight">{item.value}</h3>
              )}
              <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.title}</p>
              {item.subtexto && (
                <p className={`text-[11px] font-bold mt-1.5 ${item.subtextoClass}`}>{item.subtexto}</p>
              )}
            </div>
          );
        })}
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre, RUT o empresa..."
        filters={[
          {
            label: "Mandante",
            value: filtroMandante,
            onChange: setFiltroMandante,
            options: [
              { value: "", label: "Todos los mandantes" },
              ...Object.entries(mandantesCache).map(([mid, info]) => ({ value: mid, label: info.nombre })),
            ],
          },
          {
            label: "Proyecto",
            value: filtroProyecto,
            onChange: setFiltroProyecto,
            options: [
              { value: "", label: "Todos los proyectos" },
              ...Object.values(proyectosMap).map((p) => ({ value: p.id, label: p.nombre })),
            ],
          },
          {
            label: "Empresa",
            value: filtroEmpresa,
            onChange: setFiltroEmpresa,
            options: [
              { value: "", label: "Todas las empresas" },
              ...Object.entries(empresasMap).map(([eid, nombre]) => ({ value: eid, label: nombre })),
            ],
          },
          {
            label: "Estado de Acreditación",
            value: filtroAcreditacion,
            onChange: setFiltroAcreditacion,
            options: [
              { value: "", label: "Todos" },
              { value: "acreditada", label: "Acreditada" },
              { value: "pendiente", label: "Pendiente" },
              { value: "no_acreditada", label: "No Acreditada" },
              { value: "sin_evaluar", label: "Sin Evaluar" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={personasPaginadas}
        loading={loading}
        loadingLabel="Cargando personas..."
        emptyLabel="No se encontraron personas registradas."
        renderRow={(item) => {
          const partes = participacionesDe(item);
          const cargandoDesglose = cargandoSujetos;
          const vacio = (texto, cursiva = false) => (
            <span className={`text-[11px] ${cursiva ? "text-slate-400 italic" : "text-slate-400"}`}>{texto}</span>
          );
          // Una línea alineada por Participación en cada columna desglosada.
          const lineas = (renderParte, textoVacio = "-") =>
            cargandoDesglose ? vacio("…")
              : partes.length === 0 ? vacio(textoVacio, true)
                : partes.map((pt) => <div key={pt.key} className={CLASE_LINEA}>{renderParte(pt)}</div>);
          return (
            <tr
              key={item.id}
              onClick={() => navigate(`/personas/${item.id}`)}
              className="hover:bg-slate-50/60 transition-colors cursor-pointer"
            >
              <td className="py-4 px-6">
                <div className="flex items-center gap-3">
                  <EntityIconTile icon={Users} />
                  <p className="font-bold text-carbon-dark">{item.nombre} {item.apellido}</p>
                </div>
              </td>
              <td className="py-4 px-6 font-mono font-semibold text-slate-700 whitespace-nowrap">
                {formatRutDisplay(item.rut)}
              </td>
              <td className="py-2 px-6 text-slate-600 font-medium">
                {!cargandoDesglose && partes.length === 0 && (mandantesDeEmpresa[item.empresaActual?.empresaId] || []).length > 0 ? (
                  // Sin asignación activa: los Mandantes de su Empresa actual.
                  mandantesDeEmpresa[item.empresaActual.empresaId].map((mid) => (
                    <div key={mid} className={CLASE_LINEA}>
                      <MandanteChip nombre={mandantesCache[mid]?.nombre || "…"} logoUrl={mandantesCache[mid]?.logoUrl} />
                    </div>
                  ))
                ) : lineas((pt) => (
                  <MandanteChip
                    nombre={pt.mandante?.nombre || (pt.mandanteId ? "…" : "Sin mandante")}
                    logoUrl={pt.mandante?.logoUrl}
                  />
                ))}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {item.empresaActual?.empresaNombre || <span className="text-slate-400 italic">-</span>}
              </td>
              <td className="py-4 px-6 text-slate-600 font-medium">
                {item.empresaActual?.cargo || <span className="text-slate-400 italic">-</span>}
              </td>
              <td className="py-2 px-6">
                {lineas((pt) => <p className="text-xs font-bold text-carbon-dark">{pt.proyectoNombre}</p>, "Sin asignación activa")}
              </td>
              <td className="py-4 px-6">
                <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
              </td>
              <td className="py-2 px-6">
                {cargandoEvaluaciones ? vacio("…") : lineas((pt) => <EvaluacionCelda evaluacion={pt.evaluacion} />)}
              </td>
              <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                <RowActionsMenu
                  actions={[
                    { label: "Ver", icon: Eye, onClick: () => navigate(`/personas/${item.id}`) },
                    puedeEscribir && { label: "Editar", icon: Pencil, onClick: () => navigate(`/personas/${item.id}?editar=1`) },
                    puedeEscribir && { label: "Cambiar Empresa", icon: Building2, onClick: () => setPersonaCambiandoEmpresa(item) },
                    puedeEscribir && {
                      label: partes.length > 0 ? "Cambiar Proyecto" : "Asignar a Proyecto",
                      icon: FolderKanban,
                      onClick: () => setPersonaCambiandoProyecto(item),
                    },
                    puedeEscribir && {
                      label: item.estado === "activo" ? "Desactivar" : "Activar",
                      icon: Power,
                      disabled: toggleandoId === item.id,
                      onClick: () => handleToggleEstado(item),
                    },
                  ].filter(Boolean)}
                />
              </td>
            </tr>
          );
        }}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={personasFiltradas.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />


      {personaCambiandoEmpresa && (
        <CambiarEmpresaModal
          personaId={personaCambiandoEmpresa.id}
          empresaActualNombre={personaCambiandoEmpresa.empresaActual?.empresaNombre || ""}
          empresaActualId={personaCambiandoEmpresa.empresaActual?.empresaId || null}
          onCambiado={() => { setPersonaCambiandoEmpresa(null); recargarTrasCambio(); }}
          onCerrar={() => setPersonaCambiandoEmpresa(null)}
        />
      )}
      {personaCambiandoProyecto && (
        <CambiarProyectoModal
          entidadTipo="persona"
          entidadId={personaCambiandoProyecto.id}
          tieneParticipacionActiva={participacionesDe(personaCambiandoProyecto).length > 0}
          onCambiado={() => { setPersonaCambiandoProyecto(null); recargarTrasCambio(); }}
          onCerrar={() => setPersonaCambiandoProyecto(null)}
        />
      )}
    </div>
  );
};
