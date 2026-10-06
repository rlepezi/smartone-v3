import React, { useEffect, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate, useParams } from "react-router-dom";
import { UserCog, ArrowLeft, AlertCircle, CheckCircle2, Copy, Check } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { usuarioService, ROLES_USUARIO } from "../../services/usuarioService";
import { mandanteService } from "../../services/mandanteService";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin", "admin_comercial"];

export const UsuarioFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  const actorRol = profile?.rol;
  const actorMandanteId = profile?.mandanteId || null;
  const esMandanteAdmin = actorRol === "mandante_admin";
  const esAdminComercial = actorRol === "admin_comercial";
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(actorRol);

  // mandante_admin y admin_comercial solo pueden asignar roles de
  // Mandante — difieren en si el mandanteId queda fijo (mandante_admin)
  // o es seleccionable (admin_comercial, ver bloque de Mandante abajo).
  const rolesDisponibles = (esMandanteAdmin || esAdminComercial)
    ? ROLES_USUARIO.filter((r) => ["mandante_admin", "mandante_lector"].includes(r.value))
    : ROLES_USUARIO;

  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    email: "",
    rol: rolesDisponibles[0]?.value || "",
    mandanteId: esMandanteAdmin ? actorMandanteId || "" : "",
  });

  const [mandantesActivos, setMandantesActivos] = useState([]);
  const [actorMandanteNombre, setActorMandanteNombre] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!esMandanteAdmin) {
      mandanteService
        .listar("activo")
        .then((data) => setMandantesActivos(data || []))
        .catch((err) => console.error("Error al cargar mandantes:", err));
    }
  }, [esMandanteAdmin]);

  useEffect(() => {
    if (!esMandanteAdmin || !actorMandanteId) return;
    mandanteService
      .obtenerPorId(actorMandanteId)
      .then((data) => setActorMandanteNombre(getMandanteDisplayName(data) || actorMandanteId))
      .catch(() => setActorMandanteNombre(actorMandanteId));
  }, [esMandanteAdmin, actorMandanteId]);

  useEffect(() => {
    if (!esEdicion) return;
    usuarioService
      .obtenerPorId(id)
      .then((data) => {
        setFormData({
          nombre: data.nombre || "",
          apellido: data.apellido || "",
          email: data.email || "",
          rol: data.rol || rolesDisponibles[0]?.value || "",
          mandanteId: data.mandanteId || "",
        });
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar el usuario."))
      .finally(() => setCargandoRegistro(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, esEdicion]);

  const rolSeleccionado = ROLES_USUARIO.find((r) => r.value === formData.rol);
  const requiereMandante = rolSeleccionado?.requiereMandante || false;

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
    if (!formData.apellido.trim()) newErrors.apellido = "El apellido es obligatorio.";
    if (!esEdicion) {
      if (!formData.email.trim()) {
        newErrors.email = "El email es obligatorio.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = "Email inválido.";
      }
    }
    if (!formData.rol) newErrors.rol = "El rol es obligatorio.";
    if (requiereMandante && !esMandanteAdmin && !formData.mandanteId) {
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
      apellido: formData.apellido.trim(),
      email: formData.email.trim(),
      rol: formData.rol,
      mandanteId: requiereMandante
        ? (esMandanteAdmin ? actorMandanteId : formData.mandanteId)
        : null,
    };

    try {
      if (esEdicion) {
        delete payload.email;
        await usuarioService.actualizar(id, payload);
        navigate("/usuarios");
      } else {
        const creado = await usuarioService.crear(payload);
        setResultado(creado);
      }
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!resultado?.passwordTemporal) return;
    try {
      await navigator.clipboard.writeText(resultado.passwordTemporal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error("No se pudo copiar la contraseña:", err);
    }
  };

  if (resultado) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-card text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-sage-lighter text-sage-darker flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Usuario creado exitosamente</h2>
            <p className="text-xs text-gray-500 mt-1">
              {resultado.nombre} {resultado.apellido} ({resultado.email})
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">
              Contraseña temporal — guárdala ahora, no se volverá a mostrar
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm font-mono text-gray-800 break-all">
                {resultado.passwordTemporal}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="p-2.5 rounded-lg border border-amber-200 bg-white hover:bg-amber-100 text-amber-700 transition-colors flex-shrink-0"
                title="Copiar contraseña"
              >
                {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/usuarios")}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all"
          >
            Volver a Usuarios
          </button>
        </div>
      </div>
    );
  }

  if (cargandoRegistro) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando usuario...
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
            onClick={() => navigate("/usuarios")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              {esEdicion ? "Editar Usuario" : "Nuevo Usuario"}
            </h2>
            <p className="text-xs text-gray-500">
              {esEdicion
                ? puedeEscribir
                  ? "Modifique los datos del usuario."
                  : "Detalle del usuario (solo lectura)."
                : "Registre una nueva cuenta de acceso a la plataforma."}
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
            <UserCog className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos del Usuario</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre *</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Juan"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Apellido *</label>
              <input
                type="text"
                name="apellido"
                value={formData.apellido}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Pérez"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.apellido ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.apellido && <p className="text-xs text-red-500 mt-1">{errors.apellido}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email *</label>
              {esEdicion ? (
                <>
                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">El email no puede modificarse después de creado.</p>
                </>
              ) : (
                <>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="usuario@empresa.cl"
                    className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                      errors.email ? "border-red-400 bg-red-50/30" : "border-gray-200"
                    }`}
                  />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Rol *</label>
              <select
                name="rol"
                value={formData.rol}
                onChange={handleChange}
                disabled={!puedeEscribir}
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.rol ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              >
                {rolesDisponibles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {errors.rol && <p className="text-xs text-red-500 mt-1">{errors.rol}</p>}
            </div>

            {requiereMandante && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandante *</label>
                {esMandanteAdmin ? (
                  <input
                    type="text"
                    value={actorMandanteNombre || ""}
                    disabled
                    className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                  />
                ) : (
                  <select
                    name="mandanteId"
                    value={formData.mandanteId}
                    onChange={handleChange}
                    disabled={!puedeEscribir}
                    className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                      errors.mandanteId ? "border-red-400 bg-red-50/30" : "border-gray-200"
                    }`}
                  >
                    <option value="">Seleccione un Mandante...</option>
                    {mandantesActivos.map((m) => (
                      <option key={m.id} value={m.id}>{getMandanteDisplayName(m)}</option>
                    ))}
                  </select>
                )}
                {errors.mandanteId && <p className="text-xs text-red-500 mt-1">{errors.mandanteId}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/usuarios")}
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
              {loading ? "Guardando..." : "Guardar Usuario"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
