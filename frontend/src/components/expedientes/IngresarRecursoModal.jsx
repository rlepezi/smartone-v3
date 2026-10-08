import React, { useEffect, useState } from "react";
import { X, Search, Plus } from "lucide-react";
import { acreditacionService } from "../../services/acreditacionService";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { ErrorBanner } from "../shared/ErrorBanner";
import { ActionButton } from "../shared/ActionButton";
import { ModalCrearPersona } from "../shared/ModalCrearPersona";
import { ModalCrearRecurso } from "../shared/ModalCrearRecurso";
import { disponibilidadDe, BadgesDisponibilidad } from "../acreditaciones/PanelSeleccionEntidades";

const hoyISO = () => new Date().toISOString().slice(0, 10);

const CHIPS = [
  { key: "todas", label: "Todas" },
  { key: "disponible", label: "Disponibles" },
  { key: "otro", label: "En otro proyecto" },
];

// Agrega una Persona/Maquinaria YA EXISTENTE de la misma Empresa a este Expediente, desde el
// panel "Personas/Maquinarias asignadas" del Detalle. Mismo mecanismo que "Nueva
// Acreditación"/"Reemplazar Acreditación" (acreditacionService.asignarEntidad): si ya está activa
// en otro Proyecto, la traslada (cierra su participación anterior, reutiliza su documentación
// vigente) en vez de fallar por duplicado — nunca crea una entidad nueva, solo reutiliza el
// catálogo de la Empresa. `tipo` acá es "persona"|"recurso" (mismo que usa SelectorRecursoAsignado);
// se traduce a "persona"|"maquinaria" para el backend, igual que ya hace PasoAsignaciones.jsx.
export const IngresarRecursoModal = ({
  tipo, empresaId, mandanteId, proyectoDestinoId, proyectoDestinoNombre, onIngresado, onCerrar,
}) => {
  const esPersona = tipo === "persona";
  const tipoApi = esPersona ? "persona" : "maquinaria";

  const [items, setItems] = useState([]);
  // Perfiles de Recurso activos del Mandante, del tipo del sujeto (elegidos por ID).
  const [perfilesDisponibles, setPerfilesDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [chip, setChip] = useState("todas");
  const [seleccionadoId, setSeleccionadoId] = useState(null);
  const [perfilRecursoIds, setPerfilRecursoIds] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    acreditacionService.listarEntidadesDeEmpresa({ empresaId, tipo: tipoApi })
      .then((data) => setItems(data || []))
      .catch((err) => setError(err.message || "No se pudieron cargar las opciones."))
      .finally(() => setLoading(false));
  }, [empresaId, tipoApi]);

  useEffect(() => {
    if (!mandanteId) return;
    perfilRecursoService.listar({ mandanteId, tipo: esPersona ? "persona" : "recurso", estado: "activo" })
      .then((data) => setPerfilesDisponibles(data || []))
      .catch((err) => console.error("Error al cargar perfiles de recurso:", err));
  }, [esPersona, mandanteId]);

  // Al elegir a alguien se preselecciona el perfil del mismo nombre que su Función (Persona) o su
  // clasificación descriptiva (Maquinaria); si no hay coincidencia, se elige a mano.
  const elegir = (item) => {
    setSeleccionadoId(item.id);
    const texto = ((esPersona ? item.cargoActivo : item.tipo) || "").trim().toLowerCase();
    const p = perfilesDisponibles.find((x) => x.nombre.trim().toLowerCase() === texto);
    setPerfilRecursoIds(p ? [p.id] : []);
  };

  const textoDe = (i) => (esPersona
    ? `${i.nombre} ${i.apellido || ""} ${i.rut || ""} ${i.cargo || ""}`
    : `${i.nombre} ${i.patente || ""} ${i.tipo || ""}`);
  const nombreDe = (i) => (esPersona ? `${i.nombre} ${i.apellido || ""}`.trim() : i.nombre);
  const secundarioDe = (i) => (esPersona ? i.rut : i.patente) || "";

  // Quien ya está activo en ESTE Expediente no tiene sentido ofrecerlo como opción acá (ya
  // aparece en la lista de asignados que abrió este modal).
  const filtrados = items.filter((i) => {
    const disp = disponibilidadDe(i, proyectoDestinoId);
    if (disp === "este") return false;
    if (chip === "disponible" && disp !== "disponible") return false;
    if (chip === "otro" && disp !== "otro") return false;
    const t = busqueda.trim().toLowerCase();
    return !t || textoDe(i).toLowerCase().includes(t);
  });

  const seleccionado = items.find((i) => i.id === seleccionadoId) || null;
  const requiereTraslado = seleccionado && disponibilidadDe(seleccionado, proyectoDestinoId) === "otro";

  // Recién creada: entra al catálogo de esta Empresa sin ninguna Participación activa todavía
  // (disponible) y queda preseleccionada, lista para confirmar su ingreso a este Expediente.
  const handleCreada = (entidad) => {
    const conEstado = { ...entidad, participacionActiva: null };
    setItems((prev) => [...prev, conEstado]);
    elegir(conEstado);
    setModalCrearAbierto(false);
  };

  const confirmar = async () => {
    if (!seleccionado) return;
    if (requiereTraslado && !window.confirm(
      `${nombreDe(seleccionado)} está activa/o en "${seleccionado.participacionActiva?.proyectoNombre || "otro proyecto"}". ` +
      `¿Trasladarla/o a "${proyectoDestinoNombre || "este proyecto"}"? Se cerrará su participación anterior y se reutilizará su documentación vigente.`,
    )) {
      return;
    }
    setEnviando(true);
    setErrorEnvio(null);
    try {
      await acreditacionService.asignarEntidad({
        entidadTipo: tipoApi,
        entidadId: seleccionado.id,
        proyectoDestinoId,
        empresaId,
        perfilRecursoIds,
        fechaInicio: hoyISO(),
      });
      onIngresado?.();
    } catch (err) {
      setErrorEnvio(err.message || "No se pudo ingresar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={enviando ? undefined : onCerrar}>
      <div className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">
            Ingresar {esPersona ? "Persona" : "Maquinaria"}
          </h3>
          <button type="button" onClick={onCerrar} disabled={enviando} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 border-b border-slate-100">
          <ErrorBanner message={error} />
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder={esPersona ? "Buscar por nombre, RUT o cargo..." : "Buscar por nombre, patente o tipo..."}
              className="w-full pl-9 pr-3 py-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {CHIPS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setChip(c.key)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                    chip === c.key ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setModalCrearAbierto(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:text-primary-dark whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              {esPersona ? "Crear Persona nueva" : "Crear Maquinaria nueva"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 min-h-[8rem]">
          {loading ? (
            <p className="text-xs text-slate-400 py-8 text-center">Cargando...</p>
          ) : filtrados.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              {items.length === 0
                ? `Esta Empresa todavía no tiene ${esPersona ? "personas" : "maquinarias"} registradas.`
                : "Ningún resultado con estos filtros."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtrados.map((i) => {
                const activo = i.id === seleccionadoId;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => elegir(i)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        activo ? "border-primary bg-primary-lighter" : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-carbon-dark truncate">{nombreDe(i)}</span>
                        {secundarioDe(i) && <span className="block text-[11px] text-slate-400 font-mono truncate">{secundarioDe(i)}</span>}
                      </span>
                      <BadgesDisponibilidad item={i} proyectoActualId={proyectoDestinoId} seleccionada={activo} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {seleccionado && (
          <div className="px-5 pt-3 border-t border-slate-100">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              {esPersona ? "Perfiles de Recurso (uno o más)" : "Perfil de Recurso"}
            </label>
            {perfilesDisponibles.length === 0 ? (
              <p className="text-[11px] text-slate-400">Sin Perfiles de Recurso configurados para este Mandante.</p>
            ) : esPersona ? (
              <div className="flex flex-wrap gap-1.5">
                {perfilesDisponibles.map((p) => {
                  const activo = perfilRecursoIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => setPerfilRecursoIds((prev) => (activo ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
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
                value={perfilRecursoIds[0] || ""}
                onChange={(e) => setPerfilRecursoIds(e.target.value ? [e.target.value] : [])}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">Seleccione un Perfil de Recurso...</option>
                {perfilesDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="p-5 space-y-2">
          <ErrorBanner message={errorEnvio} />
          <div className="flex items-center justify-end gap-2">
            <ActionButton disabled={enviando} onClick={onCerrar}>Cancelar</ActionButton>
            <ActionButton
              variant="primary"
              busy={enviando}
              busyLabel="Ingresando..."
              disabled={!seleccionado || perfilRecursoIds.length === 0}
              onClick={confirmar}
            >
              {requiereTraslado ? "Trasladar e ingresar" : "Ingresar"}
            </ActionButton>
          </div>
        </div>
      </div>

      {modalCrearAbierto && (
        esPersona ? (
          <ModalCrearPersona
            empresaId={empresaId}
            mandanteId={mandanteId}
            onCreada={handleCreada}
            onCerrar={() => setModalCrearAbierto(false)}
          />
        ) : (
          <ModalCrearRecurso
            empresaId={empresaId}
            mandanteId={mandanteId}
            onCreada={handleCreada}
            onCerrar={() => setModalCrearAbierto(false)}
          />
        )
      )}
    </div>
  );
};
