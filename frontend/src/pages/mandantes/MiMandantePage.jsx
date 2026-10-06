import React, { useEffect, useState } from "react";
import { Building2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { mandanteService } from "../../services/mandanteService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { MandanteLogoUploader } from "../../components/shared/MandanteLogoUploader";

// Autogestión acotada del propio Mandante para mandante_admin/lector — NO
// es el módulo "Mandantes" (ese sigue siendo exclusivo de superadmin).
// mandante_admin solo puede editar nombreFantasia/contacto/zonaHoraria/logo;
// rut/razonSocial/estado son de solo lectura, administrados por
// SmartApplication.
export const MiMandantePage = () => {
  const { profile } = useAuth();
  const puedeEscribir = profile?.rol === "mandante_admin";

  const [mandante, setMandante] = useState(null);
  const [formData, setFormData] = useState({
    nombreFantasia: "",
    contactoNombre: "",
    contactoEmail: "",
    contactoTelefono: "",
    zonaHoraria: "America/Santiago",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const cargar = () => {
    if (!profile?.mandanteId) return;
    setLoading(true);
    mandanteService
      .obtenerPorId(profile.mandanteId)
      .then((data) => {
        setMandante(data);
        setFormData({
          nombreFantasia: data.nombreFantasia || "",
          contactoNombre: data.contacto?.nombre || "",
          contactoEmail: data.contacto?.email || "",
          contactoTelefono: data.contacto?.telefono || "",
          zonaHoraria: data.configuracion?.zonaHoraria || "America/Santiago",
        });
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar tu Mandante."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.mandanteId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "contactoTelefono") {
      setFormData((prev) => ({ ...prev, contactoTelefono: value.replace(/\D/g, "").slice(0, 11) }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    setGuardadoOk(false);
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (formData.contactoTelefono && !/^\d{1,11}$/.test(formData.contactoTelefono)) {
      newErrors.contactoTelefono = "El teléfono debe contener solo números, sin espacios ni símbolos, máximo 11 dígitos.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogoSubido = async (url) => {
    setServerError(null);
    try {
      const actualizado = await mandanteService.actualizar(profile.mandanteId, { logoUrl: url });
      setMandante(actualizado);
      setGuardadoOk(true);
    } catch (err) {
      setServerError(err.message || "No se pudo guardar el logo.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    setGuardadoOk(false);

    if (!validateForm()) return;
    setGuardando(true);

    const payload = {
      nombreFantasia: formData.nombreFantasia.trim(),
      contacto: formData.contactoNombre || formData.contactoEmail ? {
        nombre: formData.contactoNombre.trim(),
        email: formData.contactoEmail.trim(),
        telefono: formData.contactoTelefono ? formData.contactoTelefono.trim() : null,
      } : null,
      configuracion: {
        zonaHoraria: formData.zonaHoraria,
      },
    };

    try {
      const actualizado = await mandanteService.actualizar(profile.mandanteId, payload);
      setMandante(actualizado);
      setGuardadoOk(true);
    } catch (err) {
      setServerError(err.message || "No se pudo guardar los cambios.");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando tu Mandante...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Mi Mandante</h2>
          <p className="text-xs text-gray-500">
            {puedeEscribir
              ? "Administra la información de contacto y el logo de tu organización."
              : "Información de tu organización (solo lectura)."}
          </p>
        </div>
      </div>

      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}
      {guardadoOk && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-sage-lighter border border-sage-light text-sage-darker text-sm">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>Cambios guardados.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Logo + identificación (solo lectura) */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Identificación</h3>
          </div>

          <MandanteLogoUploader
            mandanteId={profile.mandanteId}
            logoUrl={mandante?.logoUrl}
            onUploaded={handleLogoSubido}
            disabled={!puedeEscribir}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">RUT</label>
              <input
                type="text"
                value={formatRutDisplay(mandante?.rut || "")}
                disabled
                className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Razón Social</label>
              <input
                type="text"
                value={mandante?.razonSocial || ""}
                disabled
                className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre Fantasía</label>
              <input
                type="text"
                name="nombreFantasia"
                value={formData.nombreFantasia}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Transemel"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Estado</label>
              <input
                type="text"
                value={mandante?.estado || ""}
                disabled
                className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed capitalize"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            El RUT, razón social y estado son administrados por SmartApplication.
          </p>
        </div>

        {/* Card 2: Contacto operacional */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">
            Contacto Principal
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre Contacto</label>
              <input
                type="text"
                name="contactoNombre"
                value={formData.contactoNombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Juan Pérez"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                name="contactoEmail"
                value={formData.contactoEmail}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="contacto@ejemplo.cl"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Teléfono</label>
              <input
                type="text"
                name="contactoTelefono"
                value={formData.contactoTelefono}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="56912345678"
                maxLength={11}
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.contactoTelefono ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.contactoTelefono && <p className="text-xs text-red-500 mt-1">{errors.contactoTelefono}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Zona Horaria</label>
              <input
                type="text"
                name="zonaHoraria"
                value={formData.zonaHoraria}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="America/Santiago"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {puedeEscribir && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={guardando}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
