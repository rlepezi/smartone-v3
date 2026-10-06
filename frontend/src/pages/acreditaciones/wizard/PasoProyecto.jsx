import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, AlertCircle, Wand2, Calendar, Building2, IdCard } from "lucide-react";
import { proyectoService } from "../../../services/proyectoService";
import { reporteService } from "../../../services/reporteService";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { estadoTarjetaProyecto, MENSAJE_NO_APLICA } from "./estadoTarjetaProyecto";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { EmpresaChip } from "../../../components/shared/EmpresaChip";
import { EntityIconTile } from "../../../components/shared/EntityIconTile";
import { formatFecha } from "../../../utils/fechaFormatters";

// Mismo criterio de exclusión que ParticipacionFormPage.jsx: un Proyecto
// finalizado/archivado no admite nuevas Participaciones.
const ESTADOS_PROYECTO_NO_ELEGIBLES = ["finalizado", "archivado", "suspendido"];

// Mismos campos que ProyectoFormPage.jsx (modo creación, mandanteId fijo
// del contexto del wizard) — reutiliza proyectoService.crear tal cual.
const CrearProyectoInline = ({ mandanteId, onCreado, onCancelar }) => {
  const [formData, setFormData] = useState({ nombre: "", codigo: "", fechaInicio: "" });
  const [codigoSugerido, setCodigoSugerido] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    if (!mandanteId) return;
    proyectoService
      .obtenerSiguienteCodigo(mandanteId)
      .then((data) => setCodigoSugerido(data?.codigoSugerido || null))
      .catch(() => setCodigoSugerido(null));
  }, [mandanteId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    if (!formData.codigo.trim()) newErrors.codigo = "El código es obligatorio.";
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
        codigo: formData.codigo.trim(),
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
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Código *</label>
          <input
            type="text" name="codigo" value={formData.codigo} onChange={handleChange}
            placeholder="Ej: PRJ-2026-001"
            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              errors.codigo ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.codigo && <p className="text-[11px] text-red-500 mt-1">{errors.codigo}</p>}
          {codigoSugerido && (
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, codigo: codigoSugerido }))}
              className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary-lighter text-primary text-[11px] font-semibold hover:bg-primary/20 transition-colors"
            >
              <Wand2 className="w-3 h-3" />
              Sugerencia: {codigoSugerido}
            </button>
          )}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Fecha de Inicio *</label>
          <input
            type="date" name="fechaInicio" value={formData.fechaInicio} onChange={handleChange}
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

// Relación actual de la Empresa con cada Proyecto (`participacionEmpresa`, calculada en el
// backend): sin relación vigente = "Nueva"; pendiente = se completa la existente; activa (o
// suspendida) = no aplica desde este wizard, se gestiona en el Detalle de la Empresa/Proyecto.
const ESTADO_TARJETA = {
  nueva: { label: "Nueva", className: "bg-sage-lighter text-sage-darker border-sage-light" },
  pendiente: { label: "Pendiente", className: "bg-amber-50 text-amber-700 border-amber-200" },
  no_aplica: { label: "No aplica", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

const MAX_CHIPS_EMPRESAS = 4;

// `mandanteId`: el Mandante elegido en el Paso 1 (o el fijo del actor) — única fuente; acá ya no
// se elige ni se deduce.
export const PasoProyecto = ({
  mandanteId, proyectoId, onSeleccionar, empresaId, empresaSel, onCambiarEmpresa, avisoPerfil,
}) => {
  const navigate = useNavigate();

  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [mostrarCrear, setMostrarCrear] = useState(false);

  // Empresas participantes del Proyecto ya seleccionado: mismo endpoint que la pestaña
  // "Empresas Participantes" del Detalle del Proyecto.
  const [empresasParticipantes, setEmpresasParticipantes] = useState([]);
  const [cargandoParticipantes, setCargandoParticipantes] = useState(false);

  useEffect(() => {
    if (!proyectoId) {
      setEmpresasParticipantes([]);
      return;
    }
    setCargandoParticipantes(true);
    reporteService.obtenerParticipantesPorProyecto(proyectoId)
      .then((data) => setEmpresasParticipantes(data || []))
      .catch(() => setEmpresasParticipantes([]))
      .finally(() => setCargandoParticipantes(false));
  }, [proyectoId]);

  const cargar = () => {
    if (!mandanteId) return;
    setLoading(true);
    setError(null);
    proyectoService.listar({ mandanteId, empresaId })
      .then((data) => setProyectos((data || []).filter((p) => !ESTADOS_PROYECTO_NO_ELEGIBLES.includes(p.estado))))
      .catch((err) => setError(err.message || "No se pudieron cargar los proyectos."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [mandanteId, empresaId]);

  const filtrados = proyectos.filter((p) => {
    const term = search.toLowerCase();
    return p.nombre?.toLowerCase().includes(term) || p.codigo?.toLowerCase().includes(term);
  });

  const handleCreado = (proyecto) => {
    setMostrarCrear(false);
    cargar();
    onSeleccionar(proyecto);
  };

  const proyectoSeleccionado = proyectos.find((p) => p.id === proyectoId) || null;
  const esPendiente = proyectoSeleccionado && estadoTarjetaProyecto(proyectoSeleccionado) === "pendiente";
  const chipsVisibles = empresasParticipantes.slice(0, MAX_CHIPS_EMPRESAS);
  const chipsOcultos = empresasParticipantes.length - chipsVisibles.length;

  return (
    <div className="space-y-4">
      {empresaSel && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-primary/30 bg-primary-lighter/40">
          {empresaSel.logoUrl ? (
            <img src={empresaSel.logoUrl} alt="" className="w-11 h-11 rounded-full object-contain border border-white flex-shrink-0 bg-white" />
          ) : (
            <EntityIconTile icon={Building2} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold text-primary-dark uppercase tracking-wider leading-none">Empresa seleccionada</p>
            <p className="text-sm font-bold text-carbon-dark mt-1 truncate">{empresaSel.razonSocial}</p>
            {empresaSel.rut && <p className="text-[11px] text-slate-500 font-mono">{formatRutDisplay(empresaSel.rut)}</p>}
          </div>
          {onCambiarEmpresa && (
            <button type="button" onClick={onCambiarEmpresa} className="text-xs font-bold text-primary hover:text-primary-dark whitespace-nowrap">
              Cambiar empresa
            </button>
          )}
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-gray-900">Selecciona el Proyecto</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Solo se muestran Proyectos vigentes (no finalizados, archivados ni suspendidos). Cada tarjeta indica la
          situación de esta Empresa en el Proyecto.
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
            const clave = estadoTarjetaProyecto(p);
            const info = ESTADO_TARJETA[clave];
            const deshabilitada = clave === "no_aplica";
            return (
              <button
                key={p.id}
                type="button"
                disabled={deshabilitada}
                title={deshabilitada ? MENSAJE_NO_APLICA : undefined}
                onClick={() => { if (!deshabilitada) onSeleccionar(p); }}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  deshabilitada
                    ? "border-gray-100 bg-slate-50 opacity-60 cursor-not-allowed"
                    : proyectoId === p.id ? "border-primary bg-primary-lighter" : "border-gray-100 hover:border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-carbon-dark">{p.nombre}</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${info.className}`}>
                    {info.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">{p.codigo}</p>
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  {formatFecha(p.fechaInicio)} – {p.fechaTermino ? formatFecha(p.fechaTermino) : "sin término"}
                </p>
                {deshabilitada && (
                  <p className="text-[11px] text-amber-700 mt-1.5">{MENSAJE_NO_APLICA}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {esPendiente && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Ya existe una participación pendiente para esta empresa en este proyecto — se completará en vez de crear una nueva.</span>
        </div>
      )}

      {avisoPerfil && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary-lighter/60 border border-primary/20 text-primary-dark text-xs">
          <IdCard className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Este proyecto tiene un único Perfil disponible: <strong>{avisoPerfil}</strong>, ya preseleccionado. Podrás revisar los requisitos en el siguiente paso.
          </span>
        </div>
      )}

      {proyectoId && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Empresas participantes en este Proyecto
            </p>
            <button
              type="button"
              onClick={() => navigate(`/proyectos/${proyectoId}?tab=empresas`)}
              className="text-[11px] font-bold text-primary hover:text-primary-dark"
            >
              Ver todas las empresas participantes →
            </button>
          </div>
          {cargandoParticipantes ? (
            <p className="text-xs text-slate-400">Cargando...</p>
          ) : empresasParticipantes.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Todavía no hay Empresas con Participación activa en este Proyecto.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {chipsVisibles.map((e) => {
                const esLaSeleccionada = e.empresaId === empresaId;
                return (
                  <span
                    key={e.empresaId}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs font-semibold ${
                      esLaSeleccionada ? "bg-primary-lighter border-primary/30 text-primary-dark" : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    <EmpresaChip nombre={e.empresaNombre} logoUrl={e.empresaLogoUrl} conIniciales />
                    {esLaSeleccionada && (
                      <span className="text-[10px] font-bold uppercase tracking-wider">Seleccionada</span>
                    )}
                  </span>
                );
              })}
              {chipsOcultos > 0 && (
                <span className="px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
                  +{chipsOcultos} {chipsOcultos === 1 ? "empresa" : "empresas"}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
