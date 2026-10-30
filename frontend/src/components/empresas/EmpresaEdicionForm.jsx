import React, { useEffect, useRef, useState } from "react";
import { HardHat, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { empresaService } from "../../services/empresaService";
import { OpcionesRadio } from "../shared/OpcionesRadio";
import { OPCIONES_ACTIVO_INACTIVO } from "../../utils/opcionesFormulario";
import { formatRutDisplay, validateRut, cleanRut } from "../../utils/rutFormatters";
import { EmpresaLogoUploader } from "../shared/EmpresaLogoUploader";
import { aMayusculas } from "../../utils/texto";
import { CarpetasDeEmpresa, DocumentosCarpeta } from "./CarpetasDeEmpresa";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin", "admin_comercial"];

// Formulario de datos identitarios para EDITAR una Empresa, en el Detalle (edición in-place de la
// pestaña Resumen, enDetalle=true): sin botones propios (Guardar/Cancelar viven en el encabezado
// del detalle, vinculados por `formId`) y sin los bloques de gestión que ahí ya tienen su pestaña.
// Crear una Empresa es NuevaEmpresaForm (página /empresas/nuevo y paso Empresa del wizard).
// Muestra sus Carpetas de empresa; con "Ver documentos", el panel de documentos de esa carpeta queda a
// la izquierda y un clic en un RUT o una razón social detectados lo copia al formulario.
export const EmpresaEdicionForm = ({
  idEntidad: id, formId, enDetalle = false, onGuardado, onCancelar, onDirtyChange, onGuardandoChange,
}) => {
  const { profile } = useAuth();
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);
  // El RUT no se edita después de creado, salvo superadmin.
  const rutEditable = profile?.rol === "superadmin";

  const [formData, setFormData] = useState({
    rut: "",
    razonSocial: "",
    nombreFantasia: "",
    giro: "",
    estado: "activo",
    contactoNombre: "",
    contactoEmail: "",
    contactoTelefono: "",
    logoUrl: null,
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(true);
  const [serverError, setServerError] = useState(null);
  // Carpeta de la empresa cuyos documentos se muestran junto al formulario.
  const [carpetaVista, setCarpetaVista] = useState(null);

  useEffect(() => {
    empresaService
      .obtenerPorId(id)
      .then((data) => {
        setFormData({
          rut: formatRutDisplay(data.rut || ""),
          razonSocial: data.razonSocial || "",
          nombreFantasia: data.nombreFantasia || "",
          giro: data.giro || "",
          estado: data.estado || "activo",
          contactoNombre: data.contacto?.nombre || "",
          contactoEmail: data.contacto?.email || "",
          contactoTelefono: data.contacto?.telefono || "",
          logoUrl: data.logoUrl || null,
        });
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar la empresa."))
      .finally(() => setCargandoRegistro(false));
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "rut") {
      setFormData((prev) => ({
        ...prev,
        rut: formatRutDisplay(value),
      }));
    } else if (name === "razonSocial" || name === "nombreFantasia") {
      setFormData((prev) => ({ ...prev, [name]: aMayusculas(value) }));
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
    if (!formData.giro.trim()) newErrors.giro = "El giro es obligatorio.";
    if (rutEditable) {
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
      await empresaService.actualizar(id, { logoUrl: url });
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

    const hayContacto =
      formData.contactoNombre || formData.contactoEmail || formData.contactoTelefono;

    const payload = {
      rut: cleanRut(formData.rut),
      razonSocial: formData.razonSocial.trim(),
      nombreFantasia: formData.nombreFantasia.trim() || formData.razonSocial.trim(),
      giro: formData.giro.trim(),
      estado: formData.estado,
      contacto: hayContacto ? {
        nombre: formData.contactoNombre.trim() || null,
        email: formData.contactoEmail.trim() || null,
        telefono: formData.contactoTelefono.trim() || null,
      } : null,
    };

    try {
      if (!rutEditable) delete payload.rut;
      await empresaService.actualizar(id, payload);
      onGuardado?.();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Aviso de cambios sin guardar: se compara con una foto del formulario tomada al
  // terminar de cargar.
  const fotoInicialRef = useRef(null);
  useEffect(() => {
    if (cargandoRegistro) return;
    const actual = JSON.stringify(formData);
    if (fotoInicialRef.current === null) {
      fotoInicialRef.current = actual;
      return;
    }
    onDirtyChange?.(actual !== fotoInicialRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, cargandoRegistro]);

  useEffect(() => {
    onGuardandoChange?.(loading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (cargandoRegistro) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando empresa...
      </div>
    );
  }

  // Valor copiado desde un documento de la carpeta (el RUT solo si es editable).
  const copiar = (campo, valor) => {
    if (campo === "rut" && !rutEditable) return;
    setFormData((prev) => ({ ...prev, [campo]: campo === "rut" ? formatRutDisplay(valor) : aMayusculas(valor) }));
    setErrors((prev) => ({ ...prev, [campo]: null }));
  };

  const formulario = (
    <div className="space-y-6">
      <CarpetasDeEmpresa empresaId={id} vista={carpetaVista} onVer={setCarpetaVista} />
      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form id={formId} onSubmit={handleSubmit} className="space-y-6">
        {/* Card 1: Identificación */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <HardHat className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Identificación de la Empresa</h3>
          </div>

          <EmpresaLogoUploader
            empresaId={id}
            logoUrl={formData.logoUrl}
            onUploaded={handleLogoSubido}
            disabled={!puedeEscribir}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">RUT *</label>
              {!rutEditable ? (
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
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Giro *</label>
              <input
                type="text"
                name="giro"
                value={formData.giro}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Construcción y obras civiles"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.giro ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.giro && <p className="text-xs text-red-500 mt-1">{errors.giro}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Razón Social *</label>
              <input
                type="text"
                name="razonSocial"
                value={formData.razonSocial}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Constructora Ejemplo S.A."
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.razonSocial ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.razonSocial && <p className="text-xs text-red-500 mt-1">{errors.razonSocial}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre Fantasía</label>
              <input
                type="text"
                name="nombreFantasia"
                value={formData.nombreFantasia}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Constructora Ejemplo"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Estado</label>
              <OpcionesRadio
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                disabled={!puedeEscribir}
                opciones={OPCIONES_ACTIVO_INACTIVO}
                ariaLabel="Estado"
              />
            </div>
          </div>
        </div>

        {/* Card 4: Contacto */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">
            Contacto (opcional)
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

        {!enDetalle && (
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
              {loading ? "Guardando..." : "Guardar Empresa"}
            </button>
          )}
        </div>
        )}
      </form>
    </div>
  );

  if (!carpetaVista) return formulario;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div className="lg:sticky lg:top-4 h-[78vh] min-h-[28rem] flex flex-col">
        <DocumentosCarpeta key={carpetaVista.id} carpeta={carpetaVista}
          onRut={(r) => copiar("rut", r)} onRazonSocial={(t) => copiar("razonSocial", t)} />
      </div>
      <div className="min-w-0">{formulario}</div>
    </div>
  );
};
