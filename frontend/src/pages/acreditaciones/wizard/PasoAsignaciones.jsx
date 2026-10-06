import React, { useEffect, useState } from "react";
import { Search, Users, Truck, Plus, Info } from "lucide-react";
import { acreditacionService } from "../../../services/acreditacionService";
import { perfilRecursoService } from "../../../services/perfilRecursoService";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ModalCrearPersona } from "../../../components/shared/ModalCrearPersona";
import { ModalCrearRecurso } from "../../../components/shared/ModalCrearRecurso";
import {
  PanelSeleccionEntidades, BadgesDisponibilidad, disponibilidadDe,
} from "../../../components/acreditaciones/PanelSeleccionEntidades";

const MAX_FILAS_CORTAS = 5;

// Paso opcional: arma en memoria la lista de Personas/Recursos a asignar — no crea ninguna
// Asignación ni traslado todavía. Eso ocurre recién al confirmar en el paso de Confirmación,
// vía acreditacionService.asignarEntidad (mismo mecanismo de "Cambiar Proyecto"/"Reemplazar
// Acreditación": si ya están activos en otro Proyecto, los mueve en vez de fallar).
export const PasoAsignaciones = ({ mandanteId, empresaId, proyectoSel, seleccion, onCambiarSeleccion }) => {
  const [personas, setPersonas] = useState([]);
  const [recursos, setRecursos] = useState([]);
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchPersonas, setSearchPersonas] = useState("");
  const [searchRecursos, setSearchRecursos] = useState("");
  const [modalPersonaAbierto, setModalPersonaAbierto] = useState(false);
  const [modalRecursoAbierto, setModalRecursoAbierto] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(null); // "persona" | "recurso" | null

  const proyectoActualId = proyectoSel?.id;

  const cargar = () => {
    if (!empresaId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      acreditacionService.listarEntidadesDeEmpresa({ empresaId, tipo: "persona" }),
      acreditacionService.listarEntidadesDeEmpresa({ empresaId, tipo: "maquinaria" }),
    ])
      .then(([personasData, recursosData]) => {
        setPersonas(personasData || []);
        setRecursos(recursosData || []);
      })
      .catch((err) => setError(err.message || "No se pudieron cargar Personas y Maquinarias."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [empresaId]);

  useEffect(() => {
    if (!mandanteId) return;
    perfilRecursoService
      .listar({ mandanteId, tipo: "persona", estado: "activo" })
      .then((data) => setRolesDisponibles(data || []))
      .catch((err) => console.error("Error al cargar roles disponibles:", err));
  }, [mandanteId]);

  const estaSeleccionado = (tipo, id) => seleccion.some((s) => s.tipo === tipo && s.id === id);
  const buscarSeleccion = (tipo, id) => seleccion.find((s) => s.tipo === tipo && s.id === id);

  // El rol por defecto debe ser la Función propia de la Persona
  // (cargoActivo, la que se ve al crearla o editarla) — nunca el primer
  // ítem del catálogo del Mandante, que es arbitrario y no tiene relación
  // con la Persona seleccionada (bug: mostraba siempre el mismo rol para
  // todas, ej. "prevencionista" en vez de la Función real de cada una).
  const armarItem = (tipo, item) => ({
    tipo,
    id: item.id,
    nombre: tipo === "persona" ? `${item.nombre} ${item.apellido || ""}`.trim() : item.nombre,
    rol: tipo === "persona" ? (item.cargoActivo || rolesDisponibles[0]?.nombre || "") : null,
    participacionActiva: item.participacionActiva || null,
  });

  // Un solo clic, también para quien está en otro proyecto: queda "Requiere traslado" y el
  // traslado real ocurre recién al confirmar el wizard.
  const toggle = (tipo, item) => {
    if (disponibilidadDe(item, proyectoActualId) === "este") return;
    if (estaSeleccionado(tipo, item.id)) {
      onCambiarSeleccion(seleccion.filter((s) => !(s.tipo === tipo && s.id === item.id)));
    } else {
      onCambiarSeleccion([...seleccion, armarItem(tipo, item)]);
    }
  };

  const cambiarRol = (id, rol) => {
    onCambiarSeleccion(seleccion.map((s) => (s.tipo === "persona" && s.id === id ? { ...s, rol } : s)));
  };

  // El panel "Ver todas" entrega los ids finales de ese tipo; se conservan las entradas ya
  // existentes (con su rol elegido) y se agregan/quitan solo las diferencias.
  const aplicarSeleccionPanel = (tipo, ids) => {
    const catalogo = tipo === "persona" ? personas : recursos;
    const idsSet = new Set(ids);
    const otros = seleccion.filter((s) => s.tipo !== tipo);
    const mantenidos = seleccion.filter((s) => s.tipo === tipo && idsSet.has(s.id));
    const nuevos = catalogo
      .filter((i) => idsSet.has(i.id) && !mantenidos.some((m) => m.id === i.id))
      .map((i) => armarItem(tipo, i));
    onCambiarSeleccion([...otros, ...mantenidos, ...nuevos]);
    setPanelAbierto(null);
  };

  const handlePersonaCreada = (persona) => {
    setModalPersonaAbierto(false);
    const conEstado = { ...persona, participacionActiva: null };
    setPersonas((prev) => [...prev, conEstado]);
    toggle("persona", conEstado);
  };

  const handleRecursoCreado = (recurso) => {
    setModalRecursoAbierto(false);
    const conEstado = { ...recurso, participacionActiva: null };
    setRecursos((prev) => [...prev, conEstado]);
    toggle("recurso", conEstado);
  };

  // Lista corta: seleccionados primero, luego el resto; el buscador filtra sobre todo el catálogo.
  const listaCorta = (items, tipo, termino, textoDe) => {
    const t = termino.trim().toLowerCase();
    const filtrados = items.filter((i) => !t || textoDe(i).toLowerCase().includes(t));
    const ordenados = [
      ...filtrados.filter((i) => estaSeleccionado(tipo, i.id)),
      ...filtrados.filter((i) => !estaSeleccionado(tipo, i.id)),
    ];
    return ordenados.slice(0, MAX_FILAS_CORTAS);
  };

  const textoPersona = (p) => `${p.nombre} ${p.apellido || ""} ${p.rut || ""} ${p.cargo || ""}`;
  const textoRecurso = (r) => `${r.nombre} ${r.patente || ""} ${r.tipo || ""}`;

  const renderColumna = ({ tipo, titulo, icon: Icon, items, termino, setTermino, textoDe, nombreDe, onCrear, etiquetaCrear, vacio }) => {
    const cortas = listaCorta(items, tipo, termino, textoDe);
    const cantSel = seleccion.filter((s) => s.tipo === tipo).length;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{titulo}</h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
              {cantSel} {cantSel === 1 ? "seleccionada" : "seleccionadas"}
            </span>
          </div>
          <button type="button" onClick={() => setPanelAbierto(tipo)} className="text-[11px] font-bold text-primary hover:text-primary-dark">
            Ver todas ({items.length}) →
          </button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={termino} onChange={(e) => setTermino(e.target.value)}
            placeholder={`Buscar ${titulo === "Personas" ? "Persona" : "Maquinaria"}...`}
            className="w-full pl-9 pr-3 py-2 bg-gray-50/50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        {items.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-4 text-center">{vacio}</p>
        ) : cortas.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-4 text-center">Sin resultados.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {cortas.map((i) => {
              const sel = buscarSeleccion(tipo, i.id);
              const deshabilitada = disponibilidadDe(i, proyectoActualId) === "este";
              return (
                <div key={i.id} className={`py-2.5 ${deshabilitada ? "opacity-60" : ""}`}>
                  <label className={`flex items-center gap-2.5 flex-wrap ${deshabilitada ? "cursor-not-allowed" : "cursor-pointer"}`}>
                    <input
                      type="checkbox" checked={Boolean(sel)} disabled={deshabilitada} onChange={() => toggle(tipo, i)}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                    />
                    <span className="text-xs font-semibold text-carbon-dark">{nombreDe(i)}</span>
                    <BadgesDisponibilidad item={i} proyectoActualId={proyectoActualId} seleccionada={Boolean(sel)} />
                  </label>
                  {sel && tipo === "persona" && (
                    <select
                      value={sel.rol}
                      onChange={(e) => cambiarRol(i.id, e.target.value)}
                      className="mt-1.5 ml-6 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {rolesDisponibles.map((r) => (
                        <option key={r.id} value={r.nombre}>{r.nombre}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <ActionButton variant="primary" icon={Plus} onClick={onCrear}>
          {etiquetaCrear}
        </ActionButton>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Personas y Maquinarias</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Selecciona las personas y maquinarias que participarán en {proyectoSel?.nombre || "el proyecto"}. Puedes
          continuar sin asignar recursos y agregarlos posteriormente desde el proyecto.
        </p>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-2">
          <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-px" />
          Si una persona o maquinaria ya está activa en otro proyecto, podrás trasladarla a este proyecto antes de confirmar.
        </p>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando Personas y Maquinarias de la Empresa...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderColumna({
            tipo: "persona", titulo: "Personas", icon: Users, items: personas,
            termino: searchPersonas, setTermino: setSearchPersonas, textoDe: textoPersona,
            nombreDe: (p) => `${p.nombre} ${p.apellido || ""}`.trim(),
            onCrear: () => setModalPersonaAbierto(true), etiquetaCrear: "Crear Persona",
            vacio: "Todavía no hay Personas activas para esta Empresa — puedes crear una nueva.",
          })}
          {renderColumna({
            tipo: "recurso", titulo: "Maquinarias", icon: Truck, items: recursos,
            termino: searchRecursos, setTermino: setSearchRecursos, textoDe: textoRecurso,
            nombreDe: (r) => r.nombre,
            onCrear: () => setModalRecursoAbierto(true), etiquetaCrear: "Crear Maquinaria",
            vacio: "Todavía no hay Maquinarias activas para esta Empresa — puedes crear una nueva.",
          })}
        </div>
      )}

      {panelAbierto && (
        <PanelSeleccionEntidades
          tipo={panelAbierto}
          items={panelAbierto === "persona" ? personas : recursos}
          seleccionIds={seleccion.filter((s) => s.tipo === panelAbierto).map((s) => s.id)}
          proyectoActualId={proyectoActualId}
          onAplicar={(ids) => aplicarSeleccionPanel(panelAbierto, ids)}
          onCerrar={() => setPanelAbierto(null)}
        />
      )}

      {modalPersonaAbierto && (
        <ModalCrearPersona
          empresaId={empresaId}
          mandanteId={mandanteId}
          onCreada={handlePersonaCreada}
          onCerrar={() => setModalPersonaAbierto(false)}
        />
      )}
      {modalRecursoAbierto && (
        <ModalCrearRecurso
          empresaId={empresaId}
          mandanteId={mandanteId}
          onCreada={handleRecursoCreado}
          onCerrar={() => setModalRecursoAbierto(false)}
        />
      )}
    </div>
  );
};
