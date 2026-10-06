import React, { useState } from "react";
import { X } from "lucide-react";
import { recursoService } from "../../services/recursoService";
import { SugerenciasChips } from "./SugerenciasChips";
import { SUGERENCIAS_TIPO_MAQUINARIA } from "../../utils/sugerenciasRelacionLaboral";

// Mismo criterio que ModalCrearPersona.jsx, para Recurso (maquinaria).
// Sin "Tipo de Relación": la RelaciónRecurso inicial (entidad 19) se crea
// igual (recursoService.crear -> relacionRecursoService.crearRelacionInicial),
// pero acá se completa sin ese dato (decisión "completar después", mismo
// criterio ya aplicado a Persona/cargo) — queda null hasta editarse desde
// el detalle de la Maquinaria. Componente compartido: lo usan tanto
// PasoAsignaciones.jsx (wizard de Nueva Acreditación) como
// ProyectoDetailPage.jsx (alta rápida desde "Recursos Asignados").
export const ModalCrearRecurso = ({ empresaId, onCreada, onCerrar }) => {
  const [formData, setFormData] = useState({ patente: "", nombre: "", tipo: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  const elegir = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.patente.trim()) newErrors.patente = "La identificación / patente es obligatoria.";
    if (!formData.nombre.trim()) newErrors.nombre = "La marca / modelo es obligatoria.";
    if (!formData.tipo.trim()) newErrors.tipo = "El tipo de maquinaria es obligatorio.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);
    try {
      const creado = await recursoService.crear({
        nombre: formData.nombre.trim(),
        tipo: formData.tipo.trim(),
        empresaId,
        estado: "activo",
        patente: formData.patente.trim(),
      });
      onCreada(creado);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Nueva Maquinaria</h3>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">{serverError}</div>
          )}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Identificación / Patente *</label>
              <input
                type="text" name="patente" value={formData.patente} onChange={handleChange}
                placeholder="Ej: ABCD12 o Retroexcavadora CAT"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.patente ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.patente && <p className="text-xs text-red-500 mt-1">{errors.patente}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Marca / Modelo *</label>
              <input
                type="text" name="nombre" value={formData.nombre} onChange={handleChange}
                placeholder="Ej: Caterpillar 320"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo Maquinaria *</label>
              <input
                type="text" name="tipo" value={formData.tipo} onChange={handleChange}
                placeholder="Ej: Camioneta"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.tipo ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.tipo && <p className="text-xs text-red-500 mt-1">{errors.tipo}</p>}
              <SugerenciasChips opciones={SUGERENCIAS_TIPO_MAQUINARIA} valor={formData.tipo} onElegir={(v) => elegir("tipo", v)} />
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
              {loading ? "Creando..." : "Crear Maquinaria"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
