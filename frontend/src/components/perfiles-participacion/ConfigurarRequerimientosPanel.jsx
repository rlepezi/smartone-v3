import { useEffect, useState } from "react";
import { AlertCircle, CheckSquare, Square, ChevronUp, ChevronDown, Search, Pencil } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { perfilRequerimientoService } from "../../services/perfilRequerimientoService";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { requerimientoService, TIPOS_ENTIDAD } from "../../services/requerimientoService";
import { AplicaAPills } from "../requerimientos/AplicaAPills";

// Contenido de "Configurar Requerimientos" del Perfil de Participación, extraído de
// ConfigurarRequerimientosPage.jsx para reutilizarlo también en un modal (ConfigurarRequerimientosModal,
// abierto desde el detalle de Expediente) sin duplicar la lógica de carga/toggle/reorden. Solo el
// contenido (pestañas + listas) — el encabezado de página/modal lo arma cada consumidor, por eso
// avisa el nombre del Perfil ya cargado vía `onPerfilCargado` en vez de mostrarlo acá mismo.
// Solo muestra y vincula Requerimientos del Mandante del Perfil (así los entrega la matriz). Cada
// cambio usa la edición atómica del Requerimiento (requerimientoService.actualizar con su
// aplicabilidad): el backend ajusta los vínculos y lo refleja en los Expedientes NO cerrados.
// La aplicabilidad es del Requerimiento: Perfiles de Participación × Perfiles de Recurso. Por eso
// "Aplica a" (AplicaAPills, el mismo componente del modal de Requerimiento) vale para todos los
// Perfiles de Participación del Requerimiento, y un Requerimiento no puede quedar sin ninguno.
// `expedienteIdContexto`: si el modal se abrió desde el detalle de un Expediente puntual, ese
// Expediente ya quedó actualizado por el backend igual que los demás — acá solo se usa para saber
// que hay una pantalla de Expediente detrás que conviene refrescar (`onExpedienteActualizado`).
// `nivelInicial`: pestaña con la que abre el panel (ej. "persona" si se abrió desde la pestaña
// Personas del Expediente) — sin esta prop abre en la primera ("empresa"), como siempre.
export const ConfigurarRequerimientosPanel = ({
  perfilParticipacionId, onPerfilCargado, expedienteIdContexto = null,
  onExpedienteActualizado, nivelInicial = null,
}) => {
  const { profile } = useAuth();
  const soloLectura = ["mandante_lector", "evaluador"].includes(profile?.rol);

  const [matriz, setMatriz] = useState([]);
  const [perfilesRecurso, setPerfilesRecurso] = useState([]);
  const [activeTab, setActiveTab] = useState(nivelInicial || TIPOS_ENTIDAD[0]?.value);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guardandoId, setGuardandoId] = useState(null);
  const [moviendoId, setMoviendoId] = useState(null);
  const [searchDisponibles, setSearchDisponibles] = useState("");
  // Edición de "Aplica a" en curso: { requerimientoId, valor } (al vincular o al editar uno vinculado).
  const [edicion, setEdicion] = useState(null);

  const cargarMatriz = async () => {
    const matrizData = await perfilRequerimientoService.obtenerMatriz(perfilParticipacionId);
    setMatriz(matrizData || []);
  };

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      const [perfilData, matrizData] = await Promise.all([
        perfilParticipacionService.obtenerPorId(perfilParticipacionId),
        perfilRequerimientoService.obtenerMatriz(perfilParticipacionId),
      ]);
      onPerfilCargado?.(perfilData);
      setMatriz(matrizData || []);
      const recursos = perfilData?.mandanteId
        ? await perfilRecursoService.listar({ mandanteId: perfilData.mandanteId }).catch(() => [])
        : [];
      setPerfilesRecurso(recursos || []);
    } catch (err) {
      console.error("Error al cargar la configuración de requerimientos:", err);
      setError(err.message || "No se pudo cargar la configuración de requerimientos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilParticipacionId]);

  // Perfiles de Recurso que se ofrecen en "Aplica a": activos del tipo, más los ya elegidos aunque
  // hayan quedado inactivos (para no ocultarlos).
  const perfilesRecursoDelTipo = (tipo, valor) => perfilesRecurso
    .filter((p) => p.tipo === tipo && (p.estado === "activo" || (valor || []).includes(p.id)))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  const nombrePerfilRecurso = (id) => perfilesRecurso.find((p) => p.id === id)?.nombre || id;

  // Fija el estado deseado de un Requerimiento en este Perfil (vinculado o no, y a qué Perfiles de
  // Recurso aplica) en un solo llamado.
  const guardar = async (requerimiento, activo, perfilRecursoIds = null) => {
    if (soloLectura) return;
    setError(null);
    // Perfiles de Participación del Requerimiento, con o sin este Perfil.
    const otros = (requerimiento.perfilParticipacionIds || []).filter((id) => id !== perfilParticipacionId);
    if (!activo && otros.length === 0) {
      setError(
        `"${requerimiento.nombreCorto || requerimiento.nombre}" solo aplica a este Perfil y un requerimiento no puede quedar sin perfiles. ` +
        "Si ya no se usa, desactívelo desde el catálogo de Requerimientos.",
      );
      return;
    }
    setGuardandoId(requerimiento.id);
    try {
      await requerimientoService.actualizar(requerimiento.id, {
        aplicabilidad: {
          perfilParticipacionIds: activo ? [...otros, perfilParticipacionId] : otros,
          perfilRecursoIds: requerimiento.tipoEntidad === "empresa" ? null
            : (activo ? perfilRecursoIds : requerimiento.perfilRecursoIds ?? null),
        },
      });
      await cargarMatriz();
      setEdicion(null);
      // El backend ya propagó este cambio a todos los Expedientes NO cerrados del Perfil,
      // incluido este si se abrió desde uno — solo falta refrescar la pantalla de atrás.
      if (expedienteIdContexto) {
        onExpedienteActualizado?.();
      }
    } catch (err) {
      console.error("Error al actualizar el vínculo:", err);
      setError(err.message || "No se pudo actualizar el requerimiento.");
    } finally {
      setGuardandoId(null);
    }
  };

  // Vincular: Empresa se vincula de inmediato; Persona/Maquinaria abre "Aplica a" ("Todos" por defecto).
  const iniciarVinculo = (requerimiento) => {
    if (soloLectura) return;
    if (requerimiento.tipoEntidad === "empresa") {
      guardar(requerimiento, true, null);
    } else {
      setEdicion({ requerimientoId: requerimiento.id, valor: null });
    }
  };

  const itemsNivel = matriz.filter((r) => r.tipoEntidad === activeTab);
  const marcados = itemsNivel
    .filter((r) => r.vinculado)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const disponiblesDelNivel = itemsNivel.filter((r) => !r.vinculado);
  const noMarcados = disponiblesDelNivel
    .filter((r) => {
      const term = searchDisponibles.toLowerCase();
      return (
        r.nombre?.toLowerCase().includes(term) ||
        r.nombreCorto?.toLowerCase().includes(term) ||
        r.descripcion?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => (a.nombreCorto || a.nombre || "").localeCompare(b.nombreCorto || b.nombre || "", "es"));

  const handleMover = async (requerimiento, indexActual, direccion) => {
    if (soloLectura) return;
    const indexDestino = indexActual + direccion;
    if (indexDestino < 0 || indexDestino >= marcados.length) return;

    setError(null);
    setMoviendoId(requerimiento.id);
    const matrizAnterior = matriz;

    const reordenados = [...marcados];
    const [movido] = reordenados.splice(indexActual, 1);
    reordenados.splice(indexDestino, 0, movido);

    const ordenPorRequerimientoId = {};
    reordenados.forEach((r, idx) => { ordenPorRequerimientoId[r.id] = idx + 1; });

    setMatriz((prev) => prev.map((r) =>
      r.id in ordenPorRequerimientoId ? { ...r, orden: ordenPorRequerimientoId[r.id] } : r,
    ));

    try {
      await perfilRequerimientoService.reordenar(
        reordenados.map((r) => ({
          perfilRequerimientoId: r.perfilRequerimientoId,
          ordenNuevo: ordenPorRequerimientoId[r.id],
        })),
      );
    } catch (err) {
      console.error("Error al reordenar:", err);
      setError(err.message || "No se pudo reordenar los requerimientos.");
      setMatriz(matrizAnterior);
    } finally {
      setMoviendoId(null);
    }
  };

  // Editor de "Aplica a" en línea, con confirmación (no escribe en cada click).
  const renderEditorAplicaA = (req, textoGuardar) => (
    <div className="mt-2 p-3 rounded-xl border border-violet-100 bg-violet-50/40 space-y-2">
      <p className="text-[11px] font-semibold text-gray-700">Aplica a</p>
      <AplicaAPills
        compacto
        perfiles={perfilesRecursoDelTipo(req.tipoEntidad, edicion.valor)}
        valor={edicion.valor}
        onChange={(valor) => setEdicion((prev) => ({ ...prev, valor }))}
        disabled={guardandoId === req.id}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEdicion(null)}
          className="px-3 py-1 text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={guardandoId === req.id}
          onClick={() => guardar(req, true, edicion.valor)}
          className="px-3 py-1 text-[11px] font-semibold text-white bg-primary rounded-lg hover:bg-primary-dark disabled:opacity-50"
        >
          {guardandoId === req.id ? "Guardando..." : textoGuardar}
        </button>
      </div>
    </div>
  );

  const renderBadgeAplicaA = (req) => (
    <span
      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
        req.perfilRecursoIds ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-slate-100 text-slate-500 border-slate-200"
      }`}
    >
      {req.perfilRecursoIds ? req.perfilRecursoIds.map(nombrePerfilRecurso).join(", ") : "Todos"}
    </span>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-card text-center text-slate-400 text-xs">
          Cargando requerimientos...
        </div>
      ) : matriz.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-card text-center text-slate-400 text-xs">
          No hay Requerimientos activos en el catálogo.
        </div>
      ) : (
        <>
          {/* Pestañas por nivel */}
          <div className="flex gap-1 border-b border-gray-100">
            {TIPOS_ENTIDAD.map((nivel) => {
              const cantidadMarcados = matriz.filter(
                (r) => r.tipoEntidad === nivel.value && r.vinculado,
              ).length;
              const isActive = activeTab === nivel.value;
              return (
                <button
                  key={nivel.value}
                  type="button"
                  onClick={() => { setActiveTab(nivel.value); setEdicion(null); }}
                  className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                    isActive ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {nivel.label}
                  <span className="ml-1.5 text-[11px] font-semibold text-gray-400">({cantidadMarcados})</span>
                </button>
              );
            })}
          </div>

          {/* Configurados (numerados, reordenables) */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Requerimientos configurados
            </h3>
            {marcados.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">
                Ningún requerimiento configurado en este nivel todavía.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {marcados.map((req, idx) => (
                  <div key={req.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-carbon-dark truncate">{req.nombreCorto || req.nombre}</p>
                        <p className="text-[11px] text-slate-400 truncate">{req.nombre}</p>
                      </div>
                      {activeTab !== "empresa" && renderBadgeAplicaA(req)}
                      {activeTab !== "empresa" && !soloLectura && (
                        <button
                          type="button"
                          onClick={() => setEdicion({ requerimientoId: req.id, valor: req.perfilRecursoIds })}
                          className="p-1 text-gray-400 hover:text-primary transition-colors shrink-0"
                          title="Editar a qué Perfiles de Recurso aplica"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!soloLectura && (
                        <div className="flex flex-col shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0 || moviendoId === req.id}
                            onClick={() => handleMover(req, idx, -1)}
                            className="p-0.5 text-gray-400 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Mover arriba"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === marcados.length - 1 || moviendoId === req.id}
                            onClick={() => handleMover(req, idx, 1)}
                            className="p-0.5 text-gray-400 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Mover abajo"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => guardar(req, false)}
                        disabled={soloLectura || guardandoId === req.id}
                        className="shrink-0 disabled:cursor-not-allowed"
                        title="Quitar del Perfil"
                      >
                        <CheckSquare className={`w-5 h-5 ${soloLectura ? "text-slate-300" : "text-primary"}`} />
                      </button>
                    </div>
                    {edicion?.requerimientoId === req.id && renderEditorAplicaA(req, "Guardar")}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Disponibles para agregar */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Disponibles para agregar
            </h3>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchDisponibles}
                onChange={(e) => setSearchDisponibles(e.target.value)}
                placeholder="Buscar por nombre o descripción..."
                className="w-full pl-10 pr-3.5 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            {noMarcados.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">
                {disponiblesDelNivel.length === 0
                  ? "Todos los requerimientos de este nivel ya están configurados."
                  : "Sin resultados."}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {noMarcados.map((req) => (
                  <div key={req.id} className="py-3">
                    <button
                      type="button"
                      onClick={() => iniciarVinculo(req)}
                      disabled={soloLectura || guardandoId === req.id}
                      className="w-full flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-carbon-dark group-disabled:text-slate-500">{req.nombreCorto || req.nombre}</p>
                        <p className="text-[11px] text-slate-400">{req.nombre}</p>
                      </div>
                      <Square className="w-5 h-5 shrink-0 text-slate-300" />
                    </button>
                    {edicion?.requerimientoId === req.id && renderEditorAplicaA(req, "Vincular")}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
