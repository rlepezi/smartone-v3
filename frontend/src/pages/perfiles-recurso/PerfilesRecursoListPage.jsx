import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useLocation, useNavigate } from "react-router-dom";
import { Tags, Power, Pencil, Users, Truck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { mandanteService } from "../../services/mandanteService";
import { createdAtMillis } from "../../utils/deltaCalculos";
import { PageHeader } from "../../components/shared/PageHeader";
import { ErrorBanner } from "../../components/shared/ErrorBanner";
import { FilterBar } from "../../components/shared/FilterBar";
import { DataTable } from "../../components/shared/DataTable";
import { EntityIconTile } from "../../components/shared/EntityIconTile";
import { StatusBadge, MAPA_ACTIVO_INACTIVO } from "../../components/shared/StatusBadge";
import { RowActionsMenu } from "../../components/shared/RowActionsMenu";
import { Pagination } from "../../components/shared/Pagination";
import { MandanteChip } from "../../components/shared/MandanteChip";

const ROLES_MANDANTE_UNICO = ["mandante_admin", "mandante_lector"];

const TIPO_BADGE = {
  persona: { label: "Persona", className: "bg-sky-50 text-sky-700 border-sky-200", icon: Users },
  recurso: { label: "Maquinaria", className: "bg-violet-50 text-violet-700 border-violet-200", icon: Truck },
};

const TipoBadge = ({ tipo }) => {
  const info = TIPO_BADGE[tipo];
  if (!info) return <span className="text-slate-400 italic">-</span>;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${info.className}`}>
      <Icon className="w-3 h-3" /> {info.label}
    </span>
  );
};

// Pestañas Todos/Personas/Recursos: una sola colección mezcla ambos tipos
// (Rol de Persona y Clasificación de Maquinaria), así que se filtra igual
// que un tab-bar en vez de un dropdown más — más rápido de alternar al
// revisar el catálogo completo de un Mandante.
const TABS_TIPO = [
  { value: "", label: "Todos" },
  { value: "persona", label: "Personas" },
  { value: "recurso", label: "Maquinarias" },
];

export const PerfilesRecursoListPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const puedeEscribir = ["superadmin", "mandante_admin"].includes(profile?.rol);
  const esRolMandanteUnico = ROLES_MANDANTE_UNICO.includes(profile?.rol);

  const [perfiles, setPerfiles] = useState([]);
  const [mandantesCache, setMandantesCache] = useState({});
  const mandantesEnCursoRef = useRef(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabTipo, setTabTipo] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroMandante, setFiltroMandante] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [toggleandoId, setToggleandoId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fila recién creada: el formulario vuelve con location.state.nuevoId. Se resalta unos
  // segundos y el estado de navegación se limpia enseguida, así el resaltado es solo de
  // esta visita (no sobrevive a una recarga y no se guarda en ningún lado).
  const [destacadoId, setDestacadoId] = useState(location.state?.nuevoId || null);
  useEffect(() => {
    if (!destacadoId) return undefined;
    navigate(location.pathname, { replace: true, state: null });
    const temporizador = setTimeout(() => setDestacadoId(null), 3500);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarPerfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      // Superadmin puede acotar por Mandante vía el selector; para
      // mandante_admin/mandante_lector el backend ya fuerza su propio
      // mandanteId — nunca se manda uno distinto desde acá.
      // incluirConteo: cada perfil trae `cantidadRequerimientos` en esta misma respuesta.
      const data = await perfilRecursoService.listar({
        mandanteId: !esRolMandanteUnico && filtroMandante ? filtroMandante : undefined,
        tipo: tabTipo || undefined,
        estado: filtroEstado || undefined,
        incluirConteo: true,
      });
      setPerfiles(data || []);
    } catch (err) {
      console.error("Error al cargar perfiles de recurso:", err);
      setError(err.message || "Error al obtener la lista de perfiles de recurso.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPerfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabTipo, filtroEstado, filtroMandante]);

  // Catálogo de Mandantes: alimenta el selector visible solo para
  // superadmin (el único rol sin alcance forzado por Mandante).
  const [mandantesActivos, setMandantesActivos] = useState([]);
  useEffect(() => {
    if (esRolMandanteUnico) return;
    mandanteService
      .listar()
      .then((data) => {
        setMandantesActivos(data || []);
        const map = {};
        (data || []).forEach((m) => { map[m.id] = { nombre: getMandanteDisplayName(m), logoUrl: m.logoUrl || null }; });
        setMandantesCache((prev) => ({ ...prev, ...map }));
      })
      .catch((err) => console.error("Error al cargar mandantes:", err));
  }, [esRolMandanteUnico]);

  const handleToggleEstado = async (item) => {
    setToggleandoId(item.id);
    try {
      if (item.estado === "activo") {
        await perfilRecursoService.desactivar(item.id);
      } else {
        await perfilRecursoService.actualizar(item.id, { estado: "activo" });
      }
      await cargarPerfiles();
    } catch (err) {
      console.error("Error al cambiar estado del perfil:", err);
      setError(err.message || "No se pudo cambiar el estado del perfil.");
    } finally {
      setToggleandoId(null);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [tabTipo, filtroEstado, filtroMandante, searchTerm]);

  const perfilesFiltrados = perfiles.filter((p) => {
    const term = searchTerm.toLowerCase();
    const mandanteNombre = mandantesCache[p.mandanteId]?.nombre || "";
    return (
      p.nombre?.toLowerCase().includes(term) ||
      p.descripcion?.toLowerCase().includes(term) ||
      mandanteNombre.toLowerCase().includes(term)
    );
  });

  // Más reciente primero (fecha de creación descendente), en las tres pestañas.
  const perfilesOrdenados = [...perfilesFiltrados].sort((a, b) => createdAtMillis(b) - createdAtMillis(a));

  const perfilesPaginados = perfilesOrdenados.slice((page - 1) * pageSize, page * pageSize);

  // Resuelve nombre/logo de los Mandantes que aparecen en el listado
  // (necesario aunque ya se precargó `mandantesActivos` para superadmin,
  // porque mandante_admin/mandante_lector no llaman a ese listado global).
  const idsDistintosKey = [...new Set(perfiles.map((p) => p.mandanteId).filter(Boolean))].join(",");
  useEffect(() => {
    if (!idsDistintosKey) return;
    const idsVisibles = [...new Set(idsDistintosKey.split(","))];
    const idsFaltantes = idsVisibles.filter(
      (id) => !(id in mandantesCache) && !mandantesEnCursoRef.current.has(id),
    );
    if (idsFaltantes.length === 0) return;

    idsFaltantes.forEach((id) => mandantesEnCursoRef.current.add(id));
    Promise.all(
      idsFaltantes.map((id) =>
        mandanteService
          .obtenerPorId(id)
          .then((data) => [id, { nombre: getMandanteDisplayName(data) || id, logoUrl: data?.logoUrl || null }])
          .catch(() => [id, { nombre: id, logoUrl: null }]),
      ),
    ).then((pares) => {
      setMandantesCache((prev) => {
        const next = { ...prev };
        pares.forEach(([id, info]) => { next[id] = info; });
        return next;
      });
      idsFaltantes.forEach((id) => mandantesEnCursoRef.current.delete(id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsDistintosKey]);

  // Superadmin: catálogo completo; roles de un solo Mandante: los presentes en el listado.
  const opcionesMandante = (esRolMandanteUnico
    ? idsDistintosKey.split(",").filter(Boolean).map((id) => ({ value: id, label: mandantesCache[id]?.nombre || id }))
    : mandantesActivos.map((m) => ({ value: m.id, label: getMandanteDisplayName(m) })));

  const columns = [
    { key: "nombre", label: "Nombre" },
    { key: "tipo", label: "Clasificación" },
    { key: "mandante", label: "Mandante" },
    { key: "requerimientos", label: "Requerimientos", align: "right" },
    { key: "estado", label: "Estado" },
    { key: "acciones", label: "Acciones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfiles de Recurso"
        icon={Tags}
        subtitle="Roles de Persona y Clasificaciones de Maquinaria, configurables por Mandante."
        loading={loading}
        onRefresh={cargarPerfiles}
        action={puedeEscribir ? { to: "/perfiles-recurso/nuevo", label: "Nuevo Perfil" } : null}
      />

      <ErrorBanner message={error} />

      {/* Pestañas Todos/Personas/Maquinarias */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS_TIPO.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setTabTipo(tab.value)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              tabTipo === tab.value
                ? "bg-white text-carbon-dark shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre, mandante o descripción..."
        filters={[
          {
            label: "Mandante",
            conBusqueda: true,
            value: filtroMandante,
            onChange: setFiltroMandante,
            options: [
              { value: "", label: "Todos" },
              ...opcionesMandante,
            ],
          },
          {
            label: "Estado",
            value: filtroEstado,
            onChange: setFiltroEstado,
            options: [
              { value: "", label: "Todos los estados" },
              { value: "activo", label: "Activos" },
              { value: "inactivo", label: "Inactivos" },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={perfilesPaginados}
        loading={loading}
        loadingLabel="Cargando perfiles de recurso..."
        emptyLabel="No se encontraron perfiles de recurso registrados."
        renderRow={(item) => (
          <tr
            key={item.id}
            className={`hover:bg-slate-50/60 transition-colors duration-1000 ${destacadoId === item.id ? "bg-primary-lighter" : ""}`}
          >
            <td className="py-4 px-6">
              <div className="flex items-center gap-3">
                <EntityIconTile icon={Tags} />
                <p className="font-bold text-carbon-dark">{item.nombre}</p>
              </div>
            </td>
            <td className="py-4 px-6">
              <TipoBadge tipo={item.tipo} />
            </td>
            {(
              <td className="py-4 px-6 text-slate-600 font-medium">
                {item.mandanteId in mandantesCache ? (
                  <MandanteChip
                    nombre={mandantesCache[item.mandanteId].nombre}
                    logoUrl={mandantesCache[item.mandanteId].logoUrl}
                  />
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 animate-pulse shrink-0" />
                    <span className="h-3.5 w-24 rounded bg-slate-100 animate-pulse" />
                  </span>
                )}
              </td>
            )}
            <td className="py-4 px-6 text-right tabular-nums font-semibold text-slate-700 whitespace-nowrap">
              {item.cantidadRequerimientos ?? 0}
            </td>
            <td className="py-4 px-6">
              <StatusBadge value={item.estado} map={MAPA_ACTIVO_INACTIVO} />
            </td>
            <td className="py-4 px-6">
              {puedeEscribir && (
                <RowActionsMenu
                  actions={[
                    { label: "Editar", icon: Pencil, onClick: () => navigate(`/perfiles-recurso/${item.id}/editar`) },
                    {
                      label: item.estado === "activo" ? "Desactivar" : "Activar",
                      icon: Power,
                      disabled: toggleandoId === item.id,
                      onClick: () => handleToggleEstado(item),
                    },
                  ]}
                />
              )}
            </td>
          </tr>
        )}
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={perfilesOrdenados.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
      />
    </div>
  );
};
