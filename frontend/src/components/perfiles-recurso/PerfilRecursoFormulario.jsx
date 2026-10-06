import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Tags, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { mandanteService } from "../../services/mandanteService";
import { MandanteChip } from "../../components/shared/MandanteChip";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

// Etiquetas visibles de la Clasificación. Solo presentación: el valor guardado sigue
// siendo tipo: "persona" | "recurso".
const ETIQUETA_TIPO = { persona: "Persona", recurso: "Maquinaria" };

// Sugerencias rápidas de nombre según la Clasificación elegida.
const SUGERENCIAS_NOMBRE = {
  persona: ["Operador", "Trabajador", "Prevencionista"],
  recurso: ["Camioneta", "Camión"],
};

// Formulario de Perfil de Recurso (crear / editar). Único componente: lo usan la pantalla de
// Perfiles de Recurso (PerfilRecursoFormPage) y el modal del wizard de Nueva Acreditación
// (NuevoPerfilRecursoModal). `inicial` ({ nombre, tipo, mandanteId }) solo precarga al crear:
// es un punto de partida y todos los campos siguen editables. `nombre` identifica la función de
// la Persona (trabajador, prevencionista, operador) o la clasificación de la Maquinaria.
export const PerfilRecursoFormulario = ({ id = null, inicial = {}, onGuardado, onCancelar }) => {
  const { profile } = useAuth();
  const actorMandanteId = profile?.mandanteId || null;
  const esMandanteAdmin = profile?.rol === "mandante_admin";
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);

  const [formData, setFormData] = useState(() => ({
    nombre: id ? "" : inicial.nombre || "",
    tipo: !id && ["persona", "recurso"].includes(inicial.tipo) ? inicial.tipo : "persona",
    descripcion: "",
    estado: "activo",
    mandanteId: esMandanteAdmin ? actorMandanteId || "" : (!id && inicial.mandanteId) || "",
  }));

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
    perfilRecursoService
      .obtenerPorId(id)
      .then(async (data) => {
        setFormData({
          nombre: data.nombre || "",
          tipo: data.tipo || "persona",
          descripcion: data.descripcion || "",
          estado: data.estado || "activo",
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
      tipo: formData.tipo,
      descripcion: formData.descripcion.trim() || null,
      estado: formData.estado,
      mandanteId: esMandanteAdmin ? actorMandanteId : formData.mandanteId,
    };

    try {
      if (esEdicion) {
        // tipo y mandanteId son inmutables después de creado — no se
        // reenvían en la edición para no depender de que el backend los
        // ignore silenciosamente (ambos quedan fuera de allowedFields en
        // perfilRecursoService.actualizarPerfil de todas formas).
        delete payload.tipo;
        delete payload.mandanteId;
        await perfilRecursoService.actualizar(id, payload);
        onGuardado({ id, creado: false });
      } else {
        const creado = await perfilRecursoService.crear(payload);
        onGuardado({ id: creado?.id || null, creado: true, nombre: payload.nombre });
      }
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (cargandoRegistro) {
    return (
      <div className="py-16 text-center text-slate-400 text-xs">
        Cargando perfil de recurso...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Tags className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos del Perfil</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandante *</label>
              {esEdicion ? (
                <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed flex items-center">
                  <MandanteChip nombre={mandanteNombre} logoUrl={mandanteLogoUrl} />
                </div>
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
              {esEdicion && (
                <p className="text-[11px] text-slate-400 mt-1">El Mandante no puede modificarse después de creado.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Clasificación *</label>
              {esEdicion ? (
                <>
                  <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed">
                    {ETIQUETA_TIPO[formData.tipo] || formData.tipo}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    No puede modificarse después de creado (para no romper referencias existentes en Asignaciones/Recursos).
                  </p>
                </>
              ) : (
                <select
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                >
                  <option value="persona">{ETIQUETA_TIPO.persona}</option>
                  <option value="recurso">{ETIQUETA_TIPO.recurso}</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Nombre *
              </label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Operador, Grúa"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
              {!esEdicion && puedeEscribir && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400">Sugerencias:</span>
                  {(SUGERENCIAS_NOMBRE[formData.tipo] || []).map((sugerencia) => (
                    <button
                      key={sugerencia}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, nombre: sugerencia }))}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        formData.nombre === sugerencia
                          ? "bg-primary text-white border-primary"
                          : "bg-primary-lighter text-primary-dark border-primary-light hover:bg-primary/20"
                      }`}
                    >
                      {sugerencia}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Estado</label>
              <select
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                disabled={!puedeEscribir}
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción</label>
              <textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                disabled={!puedeEscribir}
                rows={3}
                placeholder="Descripción opcional del perfil de recurso..."
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancelar}
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
