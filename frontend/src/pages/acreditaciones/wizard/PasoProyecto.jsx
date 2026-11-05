import React, { useEffect, useState } from "react";
import { Search, Plus, AlertCircle, Calendar, FolderOpen } from "lucide-react";
import { proyectoService } from "../../../services/proyectoService";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { formatFecha } from "../../../utils/fechas";
import { DateInput } from "../../../components/ui/DateInput";
import { aMayusculas } from "../../../utils/texto";

// Mismo criterio de exclusión que ParticipacionFormPage.jsx: un Proyecto
// finalizado/archivado no admite nuevas Participaciones.
const ESTADOS_PROYECTO_NO_ELEGIBLES = ["finalizado", "archivado", "suspendido"];

// Mismos campos obligatorios que ProyectoFormPage.jsx (modo creación, mandanteId fijo del
// contexto del wizard) — reutiliza proyectoService.crear tal cual. El código lo asigna el backend.
const CrearProyectoInline = ({ mandanteId, onCreado, onCancelar }) => {
  const [formData, setFormData] = useState({ nombre: "", fechaInicio: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === "nombre" ? aMayusculas(value) : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    if (!formData.fechaInicio) newErrors.fechaInicio = "La fecha de inicio es obligatoria.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);
    try {
      const creado = await proyectoService.crear({
        nombre: formData.nombre.trim(),
        mandanteId,
        fechaInicio: formData.fechaInicio,
      });
      onCreado(creado);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-primary/20 bg-primary-lighter/40 space-y-3">
      {serverError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Nombre *</label>
          <input
            type="text" name="nombre" value={formData.nombre} onChange={handleChange}
            placeholder="Ej: Mantención Planta Norte"
            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              errors.nombre ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.nombre && <p className="text-[11px] text-red-500 mt-1">{errors.nombre}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Fecha de Inicio *</label>
          <DateInput
            name="fechaInicio" value={formData.fechaInicio} onChange={handleChange}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              errors.fechaInicio ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.fechaInicio && <p className="text-[11px] text-red-500 mt-1">{errors.fechaInicio}</p>}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900">
          Cancelar
        </button>
        <button
          type="submit" disabled={loading}
          className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-sm transition-all disabled:opacity-50"
        >
          {loading ? "Creando..." : "Crear y usar este Proyecto"}
        </button>
      </div>
    </form>
  );
};

// `mandanteId`: el Mandante elegido en el Paso 1 (o el fijo del actor) — única fuente; acá ya no
// se elige ni se deduce. La Empresa se elige después: su situación en el Proyecto (nueva, pendiente
// o ya participa) se muestra en el paso Empresa. `children`: la carpeta del proyecto, bajo la lista.
export const PasoProyecto = ({ mandanteId, proyectoId, onSeleccionar, children = null }) => {
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [mostrarCrear, setMostrarCrear] = useState(false);

  const cargar = () => {
    if (!mandanteId) return;
    setLoading(true);
    setError(null);
    proyectoService.listar({ mandanteId })
      .then((data) => setProyectos((data || []).filter((p) => !ESTADOS_PROYECTO_NO_ELEGIBLES.includes(p.estado))))
      .catch((err) => setError(err.message || "No se pudieron cargar los proyectos."))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [mandanteId]);

  const filtrados = proyectos.filter((p) => {
    const term = search.toLowerCase();
    return p.nombre?.toLowerCase().includes(term) || p.codigo?.toLowerCase().includes(term);
  });

  const handleCreado = (proyecto) => {
    setMostrarCrear(false);
    cargar();
    onSeleccionar(proyecto);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Selecciona el Proyecto</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Solo se muestran Proyectos vigentes del Mandante (no finalizados, archivados ni suspendidos).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <ActionButton variant="primary" icon={Plus} onClick={() => setMostrarCrear((v) => !v)}>
          {mostrarCrear ? "Cancelar" : "Crear nuevo Proyecto"}
        </ActionButton>
      </div>

      <ErrorBanner message={error} />

      {mostrarCrear && (
        <CrearProyectoInline mandanteId={mandanteId} onCreado={handleCreado} onCancelar={() => setMostrarCrear(false)} />
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando proyectos...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No hay Proyectos elegibles para este Mandante.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtrados.map((p) => {
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSeleccionar(p)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  proyectoId === p.id ? "border-primary bg-primary-lighter" : "border-gray-100 hover:border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-carbon-dark">{p.nombre}</p>
                  {p.repositorioDocumental && (
                    <span title="Tiene carpeta del proyecto" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap bg-primary-lighter text-primary border-primary/20">
                      <FolderOpen className="w-3 h-3" /> Carpeta
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-mono">{p.codigo}</p>
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  {formatFecha(p.fechaInicio)} – {p.fechaTermino ? formatFecha(p.fechaTermino) : "sin término"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {children}

    </div>
  );
};
