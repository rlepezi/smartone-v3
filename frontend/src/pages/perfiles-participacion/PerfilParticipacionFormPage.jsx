import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate, useParams } from "react-router-dom";
import { IdCard, ArrowLeft, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { mandanteService } from "../../services/mandanteService";
import { MandanteChip } from "../../components/shared/MandanteChip";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

export const PerfilParticipacionFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  const actorMandanteId = profile?.mandanteId || null;
  const esMandanteAdmin = profile?.rol === "mandante_admin";
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);
  const volverA = esEdicion ? `/perfiles-participacion/${id}` : "/perfiles-participacion";

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    notaAyuda: "",
    mandanteId: esMandanteAdmin ? actorMandanteId || "" : "",
  });

  const [mandanteNombre, setMandanteNombre] = useState("");
  const [mandanteLogoUrl, setMandanteLogoUrl] = useState(null);
  const [actorMandanteNombre, setActorMandanteNombre] = useState("");
  const [actorMandanteLogoUrl, setActorMandanteLogoUrl] = useState(null);
  const [mandantesActivos, setMandantesActivos] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    if (!esMandanteAdmin && !esEdicion) {
      mandanteService
        .listar("activo")
        .then((data) => setMandantesActivos(data || []))
        .catch((err) => console.error("Error al cargar mandantes:", err));
    }
  }, [esMandanteAdmin, esEdicion]);

  useEffect(() => {
    if (!esMandanteAdmin || esEdicion || !actorMandanteId) return;
    mandanteService
      .obtenerPorId(actorMandanteId)
      .then((data) => {
        setActorMandanteNombre(getMandanteDisplayName(data) || actorMandanteId);
        setActorMandanteLogoUrl(data?.logoUrl || null);
      })
      .catch(() => setActorMandanteNombre(actorMandanteId));
  }, [esMandanteAdmin, esEdicion, actorMandanteId]);

  useEffect(() => {
    if (!esEdicion) return;
    perfilParticipacionService
      .obtenerPorId(id)
      .then(async (data) => {
        setFormData({
          nombre: data.nombre || "",
          descripcion: data.descripcion || "",
          notaAyuda: data.notaAyuda || "",
          mandanteId: data.mandanteId || "",
        });
        try {
          const mandante = await mandanteService.obtenerPorId(data.mandanteId);
          setMandanteNombre(getMandanteDisplayName(mandante) || data.mandanteId);
          setMandanteLogoUrl(mandante?.logoUrl || null);
        } catch {
          setMandanteNombre(data.mandanteId);
        }
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar el perfil."))
      .finally(() => setCargandoRegistro(false));
  }, [id, esEdicion]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    if (!esEdicion && !esMandanteAdmin && !formData.mandanteId) {
      newErrors.mandanteId = "Debe seleccionar un Mandante.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);

    const payload = {
      nombre: formData.nombre.trim(),
      descripcion: formData.descripcion.trim() || null,
      notaAyuda: formData.notaAyuda.trim() || null,
      mandanteId: esMandanteAdmin ? actorMandanteId : formData.mandanteId,
    };

    try {
      if (esEdicion) {
        delete payload.mandanteId;
        await perfilParticipacionService.actualizar(id, payload);
      } else {
        await perfilParticipacionService.crear(payload);
      }
      navigate(volverA);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (cargandoRegistro) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando perfil de participación...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header de página */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(volverA)}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              {esEdicion ? "Editar Perfil de Participación" : "Nuevo Perfil de Participación"}
            </h2>
            <p className="text-xs text-gray-500">
              {esEdicion
                ? puedeEscribir
                  ? "Modifique los datos del perfil."
                  : "Detalle del perfil (solo lectura)."
                : "Defina un nuevo tipo de participación para un Mandante."}
            </p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <IdCard className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos del Perfil</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandante *</label>
              {esEdicion ? (
                <>
                  <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed flex items-center">
                    <MandanteChip nombre={mandanteNombre} logoUrl={mandanteLogoUrl} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">El Mandante no puede modificarse después de creado.</p>
                </>
              ) : esMandanteAdmin ? (
                <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed flex items-center">
                  <MandanteChip nombre={actorMandanteNombre || ""} logoUrl={actorMandanteLogoUrl} />
                </div>
              ) : (
                <>
                  <select
                    name="mandanteId"
                    value={formData.mandanteId}
                    onChange={handleChange}
                    autoFocus
                    className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                      errors.mandanteId ? "border-red-400 bg-red-50/30" : "border-gray-200"
                    }`}
                  >
                    <option value="">Seleccione un Mandante...</option>
                    {mandantesActivos.map((m) => (
                      <option key={m.id} value={m.id}>{getMandanteDisplayName(m)}</option>
                    ))}
                  </select>
                  {errors.mandanteId && <p className="text-xs text-red-500 mt-1">{errors.mandanteId}</p>}
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre *</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Permanente, Temporal, Convenio"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción</label>
              <textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                disabled={!puedeEscribir}
                rows={3}
                placeholder="Descripción opcional del perfil de participación..."
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nota de ayuda</label>
              <input
                type="text"
                name="notaAyuda"
                value={formData.notaAyuda}
                onChange={handleChange}
                disabled={!puedeEscribir}
                maxLength={200}
                placeholder="Ej: Ideal para trabajos por campaña, faena o período específico."
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">Opcional. Se muestra como guía al elegir este Perfil en Nueva Acreditación.</p>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(volverA)}
            className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm"
          >
            {puedeEscribir ? "Cancelar" : "Volver"}
          </button>
          {puedeEscribir && (
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar Perfil"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
