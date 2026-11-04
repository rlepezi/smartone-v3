import { useEffect, useRef, useState } from "react";
import { AlertCircle, HardHat } from "lucide-react";
import { empresaService } from "../../services/empresaService";
import { storageService } from "../../services/storageService";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { formatRutDisplay, validateRut, cleanRut } from "../../utils/rutFormatters";
import { aMayusculas } from "../../utils/texto";
import { OPCIONES_ACTIVO_INACTIVO } from "../../utils/opcionesFormulario";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { OpcionesRadio } from "../shared/OpcionesRadio";
import { EmpresaLogoUploader } from "../shared/EmpresaLogoUploader";
import { CampoMandante } from "../shared/CampoMandante";

const VACIO = {
  rut: "", razonSocial: "", nombreFantasia: "", giro: "", estado: "activo",
  contactoNombre: "", contactoEmail: "", contactoTelefono: "",
};

// Estilos de cada variante (los de cada pantalla antes de unificarlas).
const ESTILOS = {
  completa: {
    label: "block text-xs font-semibold text-gray-700 mb-1.5",
    input: "w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed",
    error: "text-xs text-red-500 mt-1",
    grid: "grid grid-cols-1 md:grid-cols-2 gap-4",
  },
  compacta: {
    label: "block text-[11px] font-semibold text-gray-700 mb-1",
    input: "w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
    error: "text-[11px] text-red-500 mt-1",
    grid: "grid grid-cols-1 md:grid-cols-2 gap-3",
  },
};

// Formulario ÚNICO para crear una Empresa. Lo usan:
//  - la página /empresas/nuevo (variante "completa"): Mandante (fijo, único o elegido), logo,
//    estado y contacto, en tarjetas;
//  - el paso Empresa de Nueva Acreditación (variante "compacta"): Mandante del flujo (`mandanteId`)
//    y solo RUT, giro, razón social y nombre de fantasía (estado activo, sin contacto).
// Mismas validaciones en ambas; el backend valida de nuevo y garantiza el RUT único. Si el RUT ya
// existe (409 RUT_EXISTENTE) no se duplica: "completa" ofrece asociar la Empresa al Mandante (o
// avisa si ya lo está) y "compacta" ofrece usarla (asociándola si hace falta).
// `onCreada(empresa)`: la Empresa creada o la existente que se usa (en "completa", tras asociar,
// sin datos). `onCancelar`: botón Cancelar. Las carpetas de empresa no se vinculan aquí.
export const NuevaEmpresaForm = ({ variante = "completa", mandanteId: mandanteFijo = null, onCreada, onCancelar }) => {
  const completa = variante === "completa";
  const e = ESTILOS[completa ? "completa" : "compacta"];
  const contextoMandante = useMandanteContexto({ activo: completa });
  const mandanteId = completa ? contextoMandante.mandanteId : mandanteFijo;
  const rutRef = useRef(null);

  const [formData, setFormData] = useState(VACIO);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);
  // 409 RUT_EXISTENTE: Empresa ya registrada con ese RUT.
  const [rutExistente, setRutExistente] = useState(null);
  const [asociando, setAsociando] = useState(false);

  // Logo elegido antes de crear (solo "completa"): se sube al obtener el ID real.
  const [logoPendiente, setLogoPendiente] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const handleLogoSeleccionado = (archivo) => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPendiente(archivo);
    setLogoPreviewUrl(URL.createObjectURL(archivo));
  };
  useEffect(() => () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    // Solo al desmontar (evita una fuga si se navega fuera sin guardar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (ev) => {
    const { name, value } = ev.target;
    const valor = name === "rut" ? formatRutDisplay(value)
      : name === "razonSocial" || name === "nombreFantasia" ? aMayusculas(value)
        : name === "contactoTelefono" ? value.replace(/\D/g, "").slice(0, 11) : value;
    setFormData((prev) => ({ ...prev, [name]: valor }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const nuevos = {};
    if (!formData.razonSocial.trim()) nuevos.razonSocial = "La razón social es obligatoria.";
    if (completa && !mandanteId) nuevos.mandanteId = "Seleccione el Mandante.";
    if (!formData.rut.trim()) nuevos.rut = "El RUT es obligatorio.";
    else if (!validateRut(formData.rut)) nuevos.rut = "El RUT ingresado no es válido.";
    if (completa && formData.contactoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactoEmail)) {
      nuevos.contactoEmail = "Email inválido.";
    }
    if (completa && formData.contactoTelefono && !/^\d{1,11}$/.test(formData.contactoTelefono)) {
      nuevos.contactoTelefono = "El teléfono debe contener solo números, sin espacios ni símbolos, máximo 11 dígitos.";
    }
    setErrors(nuevos);
    return Object.keys(nuevos).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);
    const hayContacto = completa && (formData.contactoNombre || formData.contactoEmail || formData.contactoTelefono);
    try {
      const nueva = await empresaService.crear({
        rut: cleanRut(formData.rut),
        razonSocial: formData.razonSocial.trim(),
        nombreFantasia: formData.nombreFantasia.trim() || formData.razonSocial.trim(),
        giro: formData.giro.trim() || null,
        estado: completa ? formData.estado : "activo",
        contacto: hayContacto ? {
          nombre: formData.contactoNombre.trim() || null,
          email: formData.contactoEmail.trim() || null,
          telefono: formData.contactoTelefono.trim() || null,
        } : null,
        mandanteId,
      });
      if (completa && logoPendiente) {
        // Best-effort: la Empresa ya quedó creada; si el logo falla no se revierte (se navega fuera,
        // por eso un alert y no el banner).
        try {
          const { url } = await storageService.subirLogoEmpresa(nueva.id, logoPendiente);
          await empresaService.actualizar(nueva.id, { logoUrl: url });
        } catch (logoErr) {
          console.error("Error al subir el logo de la nueva empresa:", logoErr);
          window.alert("La Empresa se creó correctamente, pero no se pudo subir el logo. Puedes intentarlo de nuevo desde 'Editar'.");
        }
      }
      onCreada?.(nueva);
    } catch (err) {
      if (err.codigo === "RUT_EXISTENTE") setRutExistente(err.detalle || {});
      else setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // RUT existente → "completa": asociarla al Mandante elegido; "compacta": usarla (asociándola si
  // hace falta) y devolverla.
  const resolverExistente = async () => {
    setAsociando(true);
    try {
      if (!rutExistente.yaAsociada) await empresaService.asociarMandante(rutExistente.empresaId, mandanteId);
      const empresa = completa ? null : await empresaService.obtenerPorId(rutExistente.empresaId);
      setRutExistente(null);
      onCreada?.(empresa);
    } catch (err) {
      setRutExistente(null);
      setServerError(err.message || "No se pudo asociar la Empresa.");
    } finally {
      setAsociando(false);
    }
  };

  const nombreMandante = getMandanteDisplayName(contextoMandante.mandante) || "el Mandante";
  const rutTexto = rutExistente ? `${rutExistente.razonSocial || (completa ? "Una Empresa" : "La Empresa")} (RUT ${formatRutDisplay(rutExistente.rut || "")})` : "";
  const conError = (campo) => `${e.input} ${errors[campo] ? (completa ? "border-red-400 bg-red-50/30" : "border-red-400") : "border-gray-200"}`;
  const banner = serverError && (
    <div className={completa ? "flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm" : "flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs"}>
      <AlertCircle className={completa ? "w-5 h-5 flex-shrink-0" : "w-4 h-4 flex-shrink-0"} />
      <span>{serverError}</span>
    </div>
  );

  const camposIdentificacion = (
    <div className={e.grid}>
      <div>
        <label className={e.label}>RUT *</label>
        <input ref={rutRef} type="text" name="rut" value={formData.rut} onChange={handleChange} placeholder="76.123.456-7" maxLength={12} className={conError("rut")} />
        {errors.rut && <p className={e.error}>{errors.rut}</p>}
      </div>
      <div>
        <label className={e.label}>Giro</label>
        <input type="text" name="giro" value={formData.giro} onChange={handleChange} placeholder="Ej: Construcción y obras civiles" className={`${e.input} border-gray-200`} />
      </div>
      <div className="md:col-span-2">
        <label className={e.label}>Razón Social *</label>
        <input type="text" name="razonSocial" value={formData.razonSocial} onChange={handleChange} placeholder="Constructora Ejemplo S.A." className={conError("razonSocial")} />
        {errors.razonSocial && <p className={e.error}>{errors.razonSocial}</p>}
      </div>
      <div className={completa ? "" : "md:col-span-2"}>
        <label className={e.label}>Nombre Fantasía</label>
        <input type="text" name="nombreFantasia" value={formData.nombreFantasia} onChange={handleChange} placeholder="Constructora Ejemplo" className={`${e.input} border-gray-200`} />
      </div>
      {completa && (
        <div>
          <label className={e.label}>Estado</label>
          <OpcionesRadio name="estado" value={formData.estado} onChange={handleChange} opciones={OPCIONES_ACTIVO_INACTIVO} ariaLabel="Estado" />
        </div>
      )}
    </div>
  );

  const modalExistente = rutExistente && (completa && rutExistente.yaAsociada ? (
    <ConfirmacionModal
      titulo="La Empresa ya existe"
      mensaje={`${rutTexto} ya está registrada y asociada a ${nombreMandante}.`}
      textoConfirmar="Entendido" textoCancelar="Cerrar"
      onCancelar={() => setRutExistente(null)} onConfirmar={() => setRutExistente(null)}
    />
  ) : (
    <ConfirmacionModal
      titulo="Ya existe una Empresa con este RUT"
      mensaje={completa
        ? `${rutTexto} ya está registrada. Puede asociarla a ${nombreMandante} en vez de crear un duplicado. Los datos ingresados en este formulario no se aplicarán.`
        : rutExistente.yaAsociada
          ? `${rutTexto} ya está registrada y asociada a este Mandante. Puede usarla directamente.`
          : `${rutTexto} ya está registrada. Puede asociarla a este Mandante y usarla, en vez de crear un duplicado.`}
      textoConfirmar={completa ? "Asociar Empresa existente" : rutExistente.yaAsociada ? "Usar esta Empresa" : "Asociar y usar esta Empresa"}
      ocupado={asociando}
      onCancelar={() => setRutExistente(null)} onConfirmar={resolverExistente}
    />
  ));

  if (!completa) {
    return (
      <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-primary/20 bg-primary-lighter/40 space-y-3">
        {banner}
        {camposIdentificacion}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900">Cancelar</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-sm transition-all disabled:opacity-50">
            {loading ? "Creando..." : "Crear y usar esta Empresa"}
          </button>
        </div>
        {modalExistente}
      </form>
    );
  }

  return (
    <div className="space-y-6">
      {banner}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <HardHat className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Identificación de la Empresa</h3>
          </div>
          <CampoMandante
            contexto={contextoMandante} error={errors.mandanteId} ayuda="La Empresa quedará asociada a este Mandante." focoRef={rutRef}
            onChange={() => setErrors((prev) => ({ ...prev, mandanteId: null }))}
          />
          <EmpresaLogoUploader logoUrl={logoPreviewUrl} onArchivoSeleccionado={handleLogoSeleccionado} />
          {camposIdentificacion}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">Contacto (opcional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={e.label}>Nombre Contacto</label>
              <input type="text" name="contactoNombre" value={formData.contactoNombre} onChange={handleChange} placeholder="Juan Pérez" className={`${e.input} border-gray-200`} />
            </div>
            <div>
              <label className={e.label}>Email</label>
              <input type="email" name="contactoEmail" value={formData.contactoEmail} onChange={handleChange} placeholder="contacto@ejemplo.cl" className={conError("contactoEmail")} />
              {errors.contactoEmail && <p className={e.error}>{errors.contactoEmail}</p>}
            </div>
            <div>
              <label className={e.label}>Teléfono</label>
              <input type="text" name="contactoTelefono" value={formData.contactoTelefono} onChange={handleChange} placeholder="56912345678" maxLength={11} className={conError("contactoTelefono")} />
              {errors.contactoTelefono && <p className={e.error}>{errors.contactoTelefono}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onCancelar} className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm">Cancelar</button>
          <button
            type="submit" disabled={loading || !contextoMandante.modo || contextoMandante.modo === "ninguno"}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar Empresa"}
          </button>
        </div>
      </form>
      {modalExistente}
    </div>
  );
};
