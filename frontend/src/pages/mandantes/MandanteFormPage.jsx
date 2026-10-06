import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, ArrowLeft, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { mandanteService } from "../../services/mandanteService";
import { storageService } from "../../services/storageService";
import { formatRutDisplay, validateRut, cleanRut } from "../../utils/rutFormatters";
import { MandanteLogoUploader } from "../../components/shared/MandanteLogoUploader";

const ROLES_ESCRITURA = ["superadmin", "admin_comercial"];

export const MandanteFormPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);

  const [formData, setFormData] = useState({
    rut: "",
    razonSocial: "",
    nombreFantasia: "",
    estado: "activo",
    contactoNombre: "",
    contactoEmail: "",
    contactoTelefono: "",
    zonaHoraria: "America/Santiago",
    logoUrl: null,
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);

  // Logo elegido ANTES de crear el Mandante (modo diferido, ver
  // MandanteLogoUploader.jsx): se guarda el archivo crudo + una
  // previsualización local, y se sube recién al crear el registro y
  // obtener su ID real.
  const [logoPendiente, setLogoPendiente] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);

  const handleLogoSeleccionado = (archivo) => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPendiente(archivo);
    setLogoPreviewUrl(URL.createObjectURL(archivo));
  };

  useEffect(() => {
    // Libera la URL local al desmontar — evita una fuga de memoria si el
    // usuario elige un logo y luego navega fuera sin llegar a guardar.
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!esEdicion) return;
    mandanteService
      .obtenerPorId(id)
      .then((data) => {
        setFormData({
          rut: formatRutDisplay(data.rut || ""),
          razonSocial: data.razonSocial || "",
          nombreFantasia: data.nombreFantasia || "",
          estado: data.estado || "activo",
          contactoNombre: data.contacto?.nombre || "",
          contactoEmail: data.contacto?.email || "",
          contactoTelefono: data.contacto?.telefono || "",
          zonaHoraria: data.configuracion?.zonaHoraria || "America/Santiago",
          logoUrl: data.logoUrl || null,
        });
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar el mandante."))
      .finally(() => setCargandoRegistro(false));
  }, [id, esEdicion]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "rut") {
      setFormData((prev) => ({
        ...prev,
        rut: formatRutDisplay(value),
      }));
    } else if (name === "contactoTelefono") {
      setFormData((prev) => ({
        ...prev,
        contactoTelefono: value.replace(/\D/g, "").slice(0, 11),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.razonSocial.trim()) newErrors.razonSocial = "La razón social es obligatoria.";
    if (!esEdicion) {
      if (!formData.rut.trim()) {
        newErrors.rut = "El RUT es obligatorio.";
      } else if (!validateRut(formData.rut)) {
        newErrors.rut = "El RUT ingresado no es válido.";
      }
    }
    if (formData.contactoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactoEmail)) {
      newErrors.contactoEmail = "Email inválido.";
    }
    if (formData.contactoTelefono && !/^\d{1,11}$/.test(formData.contactoTelefono)) {
      newErrors.contactoTelefono = "El teléfono debe contener solo números, sin espacios ni símbolos, máximo 11 dígitos.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogoSubido = async (url) => {
    setServerError(null);
    try {
      await mandanteService.actualizar(id, { logoUrl: url });
      setFormData((prev) => ({ ...prev, logoUrl: url }));
    } catch (err) {
      setServerError(err.message || "No se pudo guardar el logo.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    if (!validateForm()) return;
    setLoading(true);

    const payload = {
      rut: cleanRut(formData.rut),
      razonSocial: formData.razonSocial.trim(),
      nombreFantasia: formData.nombreFantasia.trim() || null,
      estado: formData.estado,
      contacto: formData.contactoNombre || formData.contactoEmail ? {
        nombre: formData.contactoNombre.trim(),
        email: formData.contactoEmail.trim(),
        telefono: formData.contactoTelefono ? formData.contactoTelefono.trim() : null,
      } : null,
      configuracion: {
        zonaHoraria: formData.zonaHoraria,
      },
      logoUrl: formData.logoUrl,
    };

    try {
      if (esEdicion) {
        delete payload.rut;
        await mandanteService.actualizar(id, payload);
      } else {
        const nuevo = await mandanteService.crear(payload);
        if (logoPendiente) {
          // Best-effort: el Mandante ya quedó creado — si la subida del
          // logo falla, no se revierte la creación. No se usa
          // setServerError acá porque estamos a punto de navegar fuera
          // de esta pantalla (el banner nunca llegaría a verse).
          try {
            const { url } = await storageService.subirLogoMandante(nuevo.id, logoPendiente);
            await mandanteService.actualizar(nuevo.id, { logoUrl: url });
          } catch (logoErr) {
            console.error("Error al subir el logo del nuevo mandante:", logoErr);
            window.alert(
                "El Mandante se creó correctamente, pero no se pudo subir el logo. " +
                "Puedes intentarlo de nuevo desde 'Editar'.",
            );
          }
        }
      }
      navigate("/mandantes");
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (cargandoRegistro) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando mandante...
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
            onClick={() => navigate("/mandantes")}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              {esEdicion ? "Editar Mandante" : "Nuevo Mandante"}
            </h2>
            <p className="text-xs text-gray-500">
              {esEdicion
                ? puedeEscribir
                  ? "Modifique los datos del mandante."
                  : "Detalle del mandante (solo lectura)."
                : "Registre un nuevo cliente mandante en el sistema."}
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
        {/* Card 1: Identificación Principal */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Identificación y Empresa</h3>
          </div>

          <MandanteLogoUploader
            mandanteId={esEdicion ? id : undefined}
            logoUrl={esEdicion ? formData.logoUrl : logoPreviewUrl}
            onUploaded={handleLogoSubido}
            onArchivoSeleccionado={handleLogoSeleccionado}
            disabled={!puedeEscribir}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Razón Social *</label>
              <input
                type="text"
                name="razonSocial"
                value={formData.razonSocial}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Transemel S.A."
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.razonSocial ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.razonSocial && <p className="text-xs text-red-500 mt-1">{errors.razonSocial}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">RUT *</label>
              {esEdicion ? (
                <>
                  <input
                    type="text"
                    value={formData.rut}
                    disabled
                    className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">El RUT no puede modificarse después de creado.</p>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    name="rut"
                    value={formData.rut}
                    onChange={handleChange}
                    placeholder="76.123.456-7"
                    maxLength={12}
                    className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                      errors.rut ? "border-red-400 bg-red-50/30" : "border-gray-200"
                    }`}
                  />
                  {errors.rut && <p className="text-xs text-red-500 mt-1">{errors.rut}</p>}
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre Fantasía</label>
              <input
                type="text"
                name="nombreFantasia"
                value={formData.nombreFantasia}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Transemel"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
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
                <option value="bloqueado">Bloqueado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 2: Contacto Operacional */}
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
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.contactoEmail ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.contactoEmail && <p className="text-xs text-red-500 mt-1">{errors.contactoEmail}</p>}
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
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/mandantes")}
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
              {loading ? "Guardando..." : "Guardar Mandante"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
