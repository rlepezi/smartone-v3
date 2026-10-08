import React, { useEffect, useState } from "react";
import { Search, Plus, AlertCircle, HardHat } from "lucide-react";
import { empresaService } from "../../../services/empresaService";
import { formatRutDisplay, validateRut, cleanRut } from "../../../utils/rutFormatters";
import { ErrorBanner } from "../../../components/shared/ErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { EntityIconTile } from "../../../components/shared/EntityIconTile";
import { ConfirmacionModal } from "../../../components/shared/ConfirmacionModal";

// Mismos campos/validaciones que EmpresaFormPage.jsx (modo creación) —
// reutiliza empresaService.crear tal cual, sin reimplementar la
// validación de RUT. La Empresa nueva queda asociada al Mandante del flujo
// (empresaMandantes); si el RUT ya existe, se ofrece asociar la existente en
// vez de duplicarla.
const CrearEmpresaInline = ({ mandanteId, onCreada, onCancelar }) => {
  const [formData, setFormData] = useState({
    rut: "", razonSocial: "", nombreFantasia: "", giro: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);
  // 409 RUT_EXISTENTE: Empresa ya registrada con ese RUT, pendiente de asociar.
  const [rutExistente, setRutExistente] = useState(null);
  const [asociando, setAsociando] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "rut" ? formatRutDisplay(value) : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.razonSocial.trim()) newErrors.razonSocial = "La razón social es obligatoria.";
    if (!formData.giro.trim()) newErrors.giro = "El giro es obligatorio.";
    if (!formData.rut.trim()) {
      newErrors.rut = "El RUT es obligatorio.";
    } else if (!validateRut(formData.rut)) {
      newErrors.rut = "El RUT ingresado no es válido.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);
    try {
      const creada = await empresaService.crear({
        rut: cleanRut(formData.rut),
        razonSocial: formData.razonSocial.trim(),
        nombreFantasia: formData.nombreFantasia.trim() || formData.razonSocial.trim(),
        giro: formData.giro.trim(),
        estado: "activo",
        contacto: null,
        mandanteId,
      });
      onCreada(creada);
    } catch (err) {
      if (err.codigo === "RUT_EXISTENTE") {
        setRutExistente(err.detalle || {});
      } else {
        setServerError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Asocia (o deja asociada) la Empresa existente al Mandante del flujo y la usa.
  const usarExistente = async () => {
    setAsociando(true);
    try {
      if (!rutExistente.yaAsociada) {
        await empresaService.asociarMandante(rutExistente.empresaId, mandanteId);
      }
      const empresa = await empresaService.obtenerPorId(rutExistente.empresaId);
      setRutExistente(null);
      onCreada(empresa);
    } catch (err) {
      setRutExistente(null);
      setServerError(err.message || "No se pudo asociar la Empresa.");
    } finally {
      setAsociando(false);
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
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">RUT *</label>
          <input
            type="text" name="rut" value={formData.rut} onChange={handleChange}
            placeholder="76.123.456-7" maxLength={12}
            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              errors.rut ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.rut && <p className="text-[11px] text-red-500 mt-1">{errors.rut}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Giro *</label>
          <input
            type="text" name="giro" value={formData.giro} onChange={handleChange}
            placeholder="Ej: Construcción y obras civiles"
            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              errors.giro ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.giro && <p className="text-[11px] text-red-500 mt-1">{errors.giro}</p>}
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Razón Social *</label>
          <input
            type="text" name="razonSocial" value={formData.razonSocial} onChange={handleChange}
            placeholder="Constructora Ejemplo S.A."
            className={`w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
              errors.razonSocial ? "border-red-400" : "border-gray-200"
            }`}
          />
          {errors.razonSocial && <p className="text-[11px] text-red-500 mt-1">{errors.razonSocial}</p>}
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Nombre Fantasía</label>
          <input
            type="text" name="nombreFantasia" value={formData.nombreFantasia} onChange={handleChange}
            placeholder="Constructora Ejemplo"
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
          {loading ? "Creando..." : "Crear y usar esta Empresa"}
        </button>
      </div>
      {rutExistente && (
        <ConfirmacionModal
          titulo="Ya existe una Empresa con este RUT"
          mensaje={rutExistente.yaAsociada
            ? `${rutExistente.razonSocial || "La Empresa"} (RUT ${formatRutDisplay(rutExistente.rut || "")}) ya está registrada y asociada a este Mandante. Puede usarla directamente.`
            : `${rutExistente.razonSocial || "La Empresa"} (RUT ${formatRutDisplay(rutExistente.rut || "")}) ya está registrada. Puede asociarla a este Mandante y usarla, en vez de crear un duplicado.`}
          textoConfirmar={rutExistente.yaAsociada ? "Usar esta Empresa" : "Asociar y usar esta Empresa"}
          ocupado={asociando}
          onCancelar={() => setRutExistente(null)}
          onConfirmar={usarExistente}
        />
      )}
    </form>
  );
};

// `mandanteId`: Mandante del flujo; solo se listan las Empresas asociadas a él (empresaMandantes).
export const PasoEmpresa = ({ mandanteId, empresaId, onSeleccionar }) => {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [mostrarCrear, setMostrarCrear] = useState(false);

  const cargar = () => {
    if (!mandanteId) return;
    setLoading(true);
    setError(null);
    empresaService.listar("activo", { mandanteId })
      .then((data) => setEmpresas(data || []))
      .catch((err) => setError(err.message || "No se pudieron cargar las empresas."))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [mandanteId]);

  const filtradas = empresas.filter((e) => {
    const term = search.toLowerCase();
    return (
      e.razonSocial?.toLowerCase().includes(term) ||
      e.rut?.toLowerCase().includes(term)
    );
  });

  const handleCreada = (empresa) => {
    setMostrarCrear(false);
    cargar();
    onSeleccionar(empresa);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Selecciona la Empresa a acreditar</h3>
        <p className="text-xs text-gray-500 mt-0.5">Elige una Empresa activa asociada al Mandante, o crea una nueva sin salir de este flujo.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por razón social o RUT..."
            className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>
        <ActionButton variant="primary" icon={Plus} onClick={() => setMostrarCrear((v) => !v)}>
          {mostrarCrear ? "Cancelar" : "Crear nueva Empresa"}
        </ActionButton>
      </div>

      <ErrorBanner message={error} />

      {mostrarCrear && (
        <CrearEmpresaInline mandanteId={mandanteId} onCreada={handleCreada} onCancelar={() => setMostrarCrear(false)} />
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-8 text-center">Cargando empresas...</p>
      ) : filtradas.length === 0 ? (
        <p className="text-xs text-slate-400 py-8 text-center">No se encontraron empresas activas asociadas a este Mandante.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtradas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSeleccionar(e)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                empresaId === e.id ? "border-primary bg-primary-lighter" : "border-gray-100 hover:border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                {e.logoUrl ? (
                  <img
                    src={e.logoUrl}
                    alt=""
                    className="w-9 h-9 rounded-full object-contain border border-slate-100 flex-shrink-0"
                  />
                ) : (
                  <EntityIconTile icon={HardHat} />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-carbon-dark truncate">{e.razonSocial}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{formatRutDisplay(e.rut)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{e.giro}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
