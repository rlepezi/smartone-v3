import React, { useEffect, useState } from "react";
import { AlertCircle, IdCard, ClipboardList, AlertTriangle, Building2, FolderKanban, Check, Info } from "lucide-react";
import { formatRutDisplay } from "../../../utils/rutFormatters";
import { perfilParticipacionService } from "../../../services/perfilParticipacionService";
import { etiquetaTipoEntidad } from "../../../services/requerimientoService";
import { PLANTILLAS_PERFIL_PARTICIPACION } from "../../../utils/plantillasPerfilParticipacion";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { EntityIconTile } from "../../../components/shared/EntityIconTile";

// Mismos campos que PerfilParticipacionFormPage.jsx (modo creación,
// mandanteId fijo del Proyecto elegido en el paso 2) — reutiliza
// perfilParticipacionService.crear tal cual.
const CrearPerfilInline = ({ mandanteId, onCreado, onCancelar }) => {
  const [formData, setFormData] = useState({ nombre: "", descripcion: "", notaAyuda: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const elegirPlantilla = (plantilla) => {
    setFormData(plantilla);
    setErrors({});
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);
    try {
      const creado = await perfilParticipacionService.crear({
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim() || null,
        notaAyuda: formData.notaAyuda.trim() || null,
        mandanteId,
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
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Nombre *</label>
          <input
            type="text" name="nombre" value={formData.nombre} onChange={handleChange}
            placeholder="Ej: Permanente, Temporal, Convenio"
            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              errors.nombre ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.nombre && <p className="text-[11px] text-red-500 mt-1">{errors.nombre}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] text-slate-400">Plantillas:</span>
            {PLANTILLAS_PERFIL_PARTICIPACION.map((plantilla) => (
              <button
                key={plantilla.nombre}
                type="button"
                onClick={() => elegirPlantilla(plantilla)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  formData.nombre === plantilla.nombre
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-primary-dark border-primary-light hover:bg-primary-lighter"
                }`}
              >
                {plantilla.nombre}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Descripción</label>
          <textarea
            name="descripcion" value={formData.descripcion} onChange={handleChange} rows={2}
            placeholder="Descripción opcional..."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Nota de ayuda</label>
          <input
            type="text" name="notaAyuda" value={formData.notaAyuda} onChange={handleChange} maxLength={200}
            placeholder="Ej: Ideal para trabajos por campaña o faena."
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
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
          {loading ? "Creando..." : "Crear y usar este Perfil"}
        </button>
      </div>
    </form>
  );
};

export const PasoPerfil = ({ mandanteId, perfilId, onSeleccionar, empresaSel, proyectoSel, perfilFijo = false }) => {
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const cargar = () => {
    if (!mandanteId) return;
    setLoading(true);
    setError(null);
    perfilParticipacionService.listar({ mandanteId, estado: "activo" })
      .then((data) => setPerfiles(data || []))
      .catch((err) => setError(err.message || "No se pudieron cargar los perfiles de participación."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, [mandanteId]);

  // Requisitos (Requerimientos aplicables) de cada Perfil: el mismo cálculo que congela el
  // Expediente. Mismo dato que muestra el sidebar del wizard (caché compartida del servicio).
  const [requisitos, setRequisitos] = useState({}); // perfilId -> lista | null (error)
  const [expandidoId, setExpandidoId] = useState(null);

  useEffect(() => {
    perfiles.forEach((p) => {
      perfilParticipacionService.listarRequerimientos(p.id)
        .then((lista) => setRequisitos((prev) => ({ ...prev, [p.id]: lista })))
        .catch(() => setRequisitos((prev) => ({ ...prev, [p.id]: null })));
    });
  }, [perfiles]);

  const handleCreado = (perfil) => {
    setMostrarCrear(false);
    cargar();
    onSeleccionar(perfil);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">{perfilFijo ? "Perfil de Participación" : "Selecciona el Perfil de Participación"}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {perfilFijo
            ? "Se completará la Participación pendiente existente, que ya tiene este Perfil asignado: no se puede cambiar."
            : "Elige cualquiera de los Perfiles del Mandante: define qué Requerimientos aplicarán al Expediente que se generará."}
        </p>
      </div>

      {(empresaSel || proyectoSel) && (
        <div className="flex items-center gap-3 flex-wrap">
          {empresaSel && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              {empresaSel.logoUrl ? (
                <img src={empresaSel.logoUrl} alt="" className="w-8 h-8 rounded-full object-contain border border-white flex-shrink-0" />
              ) : (
                <EntityIconTile icon={Building2} />
              )}
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Empresa Seleccionada</p>
                <p className="text-xs font-bold text-carbon-dark mt-1">
                  {empresaSel.razonSocial}
                  {empresaSel.rut && <span className="text-slate-400 font-mono font-normal"> · {formatRutDisplay(empresaSel.rut)}</span>}
                </p>
              </div>
            </div>
          )}
          {proyectoSel && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <EntityIconTile icon={FolderKanban} />
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Proyecto</p>
                <p className="text-xs font-bold text-carbon-dark mt-1">
                  {proyectoSel.nombre} <span className="text-slate-400 font-mono font-normal">({proyectoSel.codigo})</span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <ErrorBanner message={error} />

      {mostrarCrear && (
        <CrearPerfilInline mandanteId={mandanteId} onCreado={handleCreado} onCancelar={() => setMostrarCrear(false)} />
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando perfiles...</p>
      ) : perfiles.length === 0 && !mostrarCrear ? (
        <div className="py-8 text-center space-y-3">
          <IdCard className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-400">Este Mandante no tiene Perfiles de Participación activos todavía.</p>
          <button
            type="button"
            onClick={() => setMostrarCrear(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-md shadow-primary/20 transition-all"
          >
            Crear Perfil de Participación
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {perfiles.filter((p) => !perfilFijo || p.id === perfilId).map((p) => {
            const lista = requisitos[p.id];
            const cargandoLista = !(p.id in requisitos);
            const seleccionado = perfilId === p.id;
            const expandido = expandidoId === p.id;
            const sinRequerimientos = Array.isArray(lista) && lista.length === 0;
            return (
              <div
                key={p.id}
                className={`rounded-xl border-2 transition-all ${
                  seleccionado ? "border-primary bg-primary-lighter" : "border-gray-100 hover:border-gray-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  disabled={perfilFijo}
                  onClick={() => onSeleccionar(p)}
                  className={`w-full text-left p-4 ${perfilFijo ? "cursor-default" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <EntityIconTile icon={IdCard} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-carbon-dark">{p.nombre}</p>
                        {seleccionado && (
                          <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      {p.descripcion && <p className="text-[11px] text-slate-500 mt-0.5">{p.descripcion}</p>}
                      <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 whitespace-nowrap">
                        <ClipboardList className="w-3 h-3" />
                        {cargandoLista ? "…" : `${Array.isArray(lista) ? lista.length : 0} requisitos`}
                      </span>
                      {sinRequerimientos && (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Sin Requerimientos configurados — el Expediente se creará vacío.
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                <div className="px-4 pb-3">
                  <button
                    type="button"
                    onClick={() => setExpandidoId(expandido ? null : p.id)}
                    className="text-[11px] font-bold text-primary hover:text-primary-dark"
                  >
                    {expandido ? "Ocultar requisitos" : "Ver requisitos →"}
                  </button>
                  {p.notaAyuda && (
                    <p className="flex items-start gap-1.5 text-[11px] text-slate-500 mt-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-px" />
                      <span>{p.notaAyuda}</span>
                    </p>
                  )}
                  {expandido && (
                    <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {cargandoLista ? (
                        <li className="text-[11px] text-slate-400">Cargando...</li>
                      ) : !Array.isArray(lista) ? (
                        <li className="text-[11px] text-red-500">No se pudieron cargar los requisitos.</li>
                      ) : lista.length === 0 ? (
                        <li className="text-[11px] text-slate-400 italic">Este Perfil no tiene requisitos.</li>
                      ) : (
                        lista.map((r) => (
                          <li key={r.requerimientoId} className="flex items-center justify-between gap-2 text-[11px] text-slate-600 bg-white/70 border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="font-medium">{r.nombreCorto || r.nombre}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                              {etiquetaTipoEntidad(r.tipoEntidad)}
                              {r.perfilRecursoIds?.length > 0 ? ` · ${r.perfilRecursoIds.length} ${r.perfilRecursoIds.length === 1 ? "perfil" : "perfiles"}` : ""}
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!perfilFijo && !mostrarCrear && perfiles.length > 0 && (
        <button
          type="button"
          onClick={() => setMostrarCrear(true)}
          className="text-xs font-bold text-primary hover:text-primary-dark"
        >
          + Crear otro Perfil de Participación
        </button>
      )}
    </div>
  );
};
