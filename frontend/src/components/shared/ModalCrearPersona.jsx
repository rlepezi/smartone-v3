import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { personaService } from "../../services/personaService";
import { empresaService } from "../../services/empresaService";
import { formatRutDisplay, validateRut, cleanRut } from "../../utils/rutFormatters";
import { SugerenciasChips } from "./SugerenciasChips";
import { ConfirmacionModal } from "./ConfirmacionModal";
import {
  SUGERENCIAS_TIPO_RELACION_PERSONA, SUGERENCIAS_TIPO_CONTRATO,
} from "../../utils/sugerenciasRelacionLaboral";

// Un mensaje de duplicado claro reemplaza el prefijo técnico "DUPLICADO: "
// que ya viene diferenciado desde el backend (personaService.crearPersona)
// — el resto del mensaje (con el RUT/Pasaporte exacto) se conserva tal cual.
const mensajeError = (mensaje) => (
  mensaje && mensaje.startsWith("DUPLICADO: ") ? mensaje.slice("DUPLICADO: ".length) : mensaje
);

// Modal rápido "Nueva Persona": solo los campos que realmente hacen falta
// en este punto del flujo (Empresa del contexto, País, identificación,
// nombre, apellido, Cargo) — Tipo de Relación/Tipo de Contrato/Jornada/Fecha de Inicio se
// completan después editando la Persona (decisión explícita: "completar
// después" en vez de pedirlos acá). Reutiliza personaService.crear y las
// validaciones de RUT tal cual, sin reimplementarlas. Componente
// compartido: lo usan PasoAsignaciones.jsx (wizard de Nueva Acreditación),
// ProyectoDetailPage.jsx e IngresarRecursoModal.jsx (alta rápida).
//
// La Empresa la fija el contexto (la de la Participación) y se muestra como primer campo. Si la
// identificación ya existe (409 IDENTIFICACION_EXISTENTE) se muestra esa Persona y se ofrece
// crearle la relación con esta Empresa (pide Tipo de Relación y Tipo de Contrato, obligatorios
// en un cambio de empresa); si ya la tiene, se usa directamente.
export const ModalCrearPersona = ({ empresaId, onCreada, onCerrar }) => {
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [existente, setExistente] = useState(null); // detalle del 409 (+ asignaciones/mensaje si hay que confirmar)
  const [relacion, setRelacion] = useState({ tipoRelacion: "", tipoContrato: "" });
  const [relacionando, setRelacionando] = useState(false);
  const [errorRelacion, setErrorRelacion] = useState(null);
  const [formData, setFormData] = useState({
    pais: "Chile", numeroIdentificacion: "", paisLibre: "",
    nombre: "", apellido: "", cargo: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  const esChile = formData.pais === "Chile";

  useEffect(() => {
    if (!empresaId) return;
    empresaService.obtenerPorId(empresaId)
      .then((e) => setEmpresaNombre(e?.razonSocial || ""))
      .catch(() => setEmpresaNombre(""));
  }, [empresaId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "numeroIdentificacion" && esChile ? formatRutDisplay(value) : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleCambiarPais = (e) => {
    const pais = e.target.value;
    setFormData((prev) => ({ ...prev, pais, numeroIdentificacion: "" }));
    setErrors((prev) => ({ ...prev, numeroIdentificacion: null, paisLibre: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.numeroIdentificacion.trim()) {
      newErrors.numeroIdentificacion = esChile ? "El RUT es obligatorio." : "El número de pasaporte es obligatorio.";
    } else if (esChile && !validateRut(formData.numeroIdentificacion)) {
      newErrors.numeroIdentificacion = "El RUT ingresado no es válido.";
    } else if (!esChile && formData.numeroIdentificacion.trim().length < 4) {
      newErrors.numeroIdentificacion = "El número de pasaporte es muy corto.";
    }
    if (!esChile && !formData.paisLibre.trim()) newErrors.paisLibre = "Indica el país.";
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    if (!formData.apellido.trim()) newErrors.apellido = "El apellido es obligatorio.";
    if (!formData.cargo.trim()) newErrors.cargo = "El cargo es obligatorio.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);
    try {
      const identificacion = esChile
        ? { tipo: "RUT", numero: cleanRut(formData.numeroIdentificacion), pais: "Chile" }
        : { tipo: "PASAPORTE", numero: formData.numeroIdentificacion.trim(), pais: formData.paisLibre.trim() };

      const creada = await personaService.crear({
        identificacion,
        nombre: formData.nombre.trim(),
        apellido: formData.apellido.trim(),
        estado: "activo",
        empresaId,
        cargo: formData.cargo.trim(),
      });
      onCreada(creada);
    } catch (err) {
      if (err.codigo === "IDENTIFICACION_EXISTENTE") {
        setExistente(err.detalle || {});
      } else {
        setServerError(mensajeError(err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const usarExistente = async () => {
    const persona = await personaService.obtenerPorId(existente.personaId);
    setExistente(null);
    onCreada(persona);
  };

  // Crea la relación de la Persona existente con esta Empresa (termina la anterior, si tenía).
  const relacionarExistente = async (confirmado) => {
    if (!relacion.tipoRelacion.trim() || !relacion.tipoContrato.trim()) {
      setErrorRelacion("Indique el Tipo de Relación y el Tipo de Contrato.");
      return;
    }
    setErrorRelacion(null);
    setRelacionando(true);
    try {
      await personaService.cambiarEmpresa(existente.personaId, {
        empresaId,
        tipoRelacion: relacion.tipoRelacion.trim(),
        cargo: formData.cargo.trim(),
        tipoContrato: relacion.tipoContrato.trim(),
        confirmado,
      });
      await usarExistente();
    } catch (err) {
      if (err.codigo === "RELACION_EXISTENTE") {
        await usarExistente().catch((e) => setServerError(e.message));
      } else if (err.codigo === "CONFIRMACION_REQUERIDA") {
        setExistente((prev) => ({ ...prev, asignaciones: err.detalle?.asignaciones || [], mensaje: err.message }));
      } else {
        setExistente(null);
        setServerError(err.message || "No se pudo crear la relación con la Empresa.");
      }
    } finally {
      setRelacionando(false);
    }
  };

  const nombreExistente = existente
    ? `${existente.nombre || ""} ${existente.apellido || ""}`.trim() || "Una Persona"
    : "";
  const idExistente = existente?.identificacion?.tipo === "RUT"
    ? `RUT ${formatRutDisplay(existente.identificacion.numero || "")}`
    : existente?.identificacion?.numero ? `Pasaporte ${existente.identificacion.numero}` : "";
  const claseCampo = "w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Nueva Persona</h3>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">{serverError}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Empresa</label>
              <input
                type="text" value={empresaNombre} disabled
                className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">La Persona se crea con su relación laboral con esta Empresa.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">País *</label>
              <select
                name="pais" value={formData.pais} onChange={handleCambiarPais}
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="Chile">Chile</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            {!esChile && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">¿Cuál país? *</label>
                <input
                  type="text" name="paisLibre" value={formData.paisLibre} onChange={handleChange}
                  placeholder="Ej: Argentina"
                  className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                    errors.paisLibre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {errors.paisLibre && <p className="text-xs text-red-500 mt-1">{errors.paisLibre}</p>}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                {esChile ? "RUT *" : "Número de Pasaporte *"}
              </label>
              <input
                type="text" name="numeroIdentificacion" value={formData.numeroIdentificacion} onChange={handleChange}
                placeholder={esChile ? "12.345.678-9" : "Ej: AB123456"} maxLength={esChile ? 12 : 20}
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.numeroIdentificacion ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.numeroIdentificacion && <p className="text-xs text-red-500 mt-1">{errors.numeroIdentificacion}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre *</label>
              <input
                type="text" name="nombre" value={formData.nombre} onChange={handleChange}
                placeholder="Juan"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Apellido *</label>
              <input
                type="text" name="apellido" value={formData.apellido} onChange={handleChange}
                placeholder="Pérez"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.apellido ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.apellido && <p className="text-xs text-red-500 mt-1">{errors.apellido}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cargo *</label>
              <input
                type="text" name="cargo" value={formData.cargo} onChange={handleChange}
                placeholder="Ej: Operador de Camión"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.cargo ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.cargo && <p className="text-xs text-red-500 mt-1">{errors.cargo}</p>}
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onCerrar} className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
              Cancelar
            </button>
            <button
              type="submit" disabled={loading}
              className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
            >
              {loading ? "Creando..." : "Crear Persona"}
            </button>
          </div>
        </form>
      </div>
      {existente && !existente.asignaciones && (
        <ConfirmacionModal
          titulo="Esta Persona ya está registrada"
          mensaje={`${nombreExistente} (${idExistente}) ya existe. Puede crearle la relación con ${empresaNombre || "esta Empresa"} (cargo: ${formData.cargo.trim()}) en vez de duplicarla. Si tiene otra relación vigente, esta se terminará y quedará en su historial.`}
          textoConfirmar="Crear relación y usarla"
          ocupado={relacionando}
          onCancelar={() => setExistente(null)}
          onConfirmar={() => relacionarExistente(false)}
        >
          <div className="grid grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">Tipo de Relación *</label>
              <input
                type="text" value={relacion.tipoRelacion}
                onChange={(e) => setRelacion((p) => ({ ...p, tipoRelacion: e.target.value }))}
                className={claseCampo}
              />
              <SugerenciasChips opciones={SUGERENCIAS_TIPO_RELACION_PERSONA} valor={relacion.tipoRelacion} onElegir={(v) => setRelacion((p) => ({ ...p, tipoRelacion: v }))} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">Tipo de Contrato *</label>
              <input
                type="text" value={relacion.tipoContrato}
                onChange={(e) => setRelacion((p) => ({ ...p, tipoContrato: e.target.value }))}
                className={claseCampo}
              />
              <SugerenciasChips opciones={SUGERENCIAS_TIPO_CONTRATO} valor={relacion.tipoContrato} onElegir={(v) => setRelacion((p) => ({ ...p, tipoContrato: v }))} />
            </div>
            {errorRelacion && <p className="col-span-2 text-[11px] text-red-500">{errorRelacion}</p>}
          </div>
        </ConfirmacionModal>
      )}
      {existente?.asignaciones && (
        <ConfirmacionModal
          peligro
          titulo={(existente?.asignaciones?.length || 0) > 0 ? "Se finalizarán asignaciones activas" : "Se terminará la relación vigente"}
          mensaje={existente.mensaje}
          items={existente.asignaciones.map((a) => ({ key: a.participacionId, principal: a.proyectoNombre }))}
          textoConfirmar={(existente?.asignaciones?.length || 0) > 0 ? "Cambiar de empresa y finalizarlas" : "Cambiar de empresa"}
          ocupado={relacionando}
          onCancelar={() => setExistente(null)}
          onConfirmar={() => relacionarExistente(true)}
        />
      )}
    </div>
  );
};
