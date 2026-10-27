import React, { useEffect, useRef, useState } from "react";
import { LayoutModalDocumento } from "../expedientes/documentacion/LayoutModalDocumento";
import { recursoService } from "../../services/recursoService";
import { empresaService } from "../../services/empresaService";
import { SugerenciasChips } from "./SugerenciasChips";
import { ConfirmacionModal } from "./ConfirmacionModal";
import { SUGERENCIAS_TIPO_MAQUINARIA } from "../../utils/sugerenciasRelacionLaboral";

// Mismo criterio que ModalCrearPersona.jsx, para Recurso (maquinaria).
// Sin "Tipo de Relación": la RelaciónRecurso inicial (entidad 19) se crea
// igual (recursoService.crear crea el recurso y su relación con la empresa en una transacción),
// pero acá se completa sin ese dato (decisión "completar después", mismo
// criterio ya aplicado a Persona/cargo) — queda null hasta editarse desde
// el detalle de la Maquinaria. Componente compartido: lo usan tanto
// PasoAsignaciones.jsx (wizard de Nueva Acreditación) como
// ProyectoDetailPage.jsx (alta rápida desde "Recursos Asignados").
//
// La Empresa la fija el contexto y se muestra como primer campo. Patente obligatoria y no única:
// si otra maquinaria activa visible ya la usa (409 PATENTE_DUPLICADA) se avisa y se pide
// confirmación para continuar.
// `inicial` (opcional): { nombre, patente } para precargar (p. ej. "Crear desde carpeta").
// `documento` (opcional): carpeta para ver el padrón o el listado al lado del formulario.
export const ModalCrearRecurso = ({ empresaId, onCreada, onCerrar, inicial = null, documento = null }) => {
  const patenteRef = useRef(null);
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [patenteDuplicada, setPatenteDuplicada] = useState(null); // {recursoId, nombre, patente}
  const [formData, setFormData] = useState({ patente: inicial?.patente || "", nombre: inicial?.nombre || "", tipo: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    empresaService.obtenerPorId(empresaId)
      .then((e) => setEmpresaNombre(e?.razonSocial || ""))
      .catch(() => setEmpresaNombre(""));
  }, [empresaId]);

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

  const crear = async (confirmarPatenteDuplicada) => {
    setLoading(true);
    try {
      const creado = await recursoService.crear({
        nombre: formData.nombre.trim(),
        tipo: formData.tipo.trim(),
        empresaId,
        estado: "activo",
        patente: formData.patente.trim(),
        confirmarPatenteDuplicada,
      });
      setPatenteDuplicada(null);
      onCreada(creado);
    } catch (err) {
      if (err.codigo === "PATENTE_DUPLICADA") {
        setPatenteDuplicada(err.detalle || {});
      } else {
        setPatenteDuplicada(null);
        setServerError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    await crear(false);
  };

  return (
    <>
      <LayoutModalDocumento
        titulo="Nueva Maquinaria"
        onCerrar={onCerrar}
        documento={documento}
        nombreBuscado={formData.nombre}
        campoFocoRef={patenteRef}
      >
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">{serverError}</div>
          )}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Empresa</label>
              <input
                type="text" value={empresaNombre} disabled
                className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">La Maquinaria se crea con su relación con esta Empresa.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Identificación / Patente *</label>
              <input
                ref={patenteRef}
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
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de maquinaria *</label>
              <input
                type="text" name="tipo" value={formData.tipo} onChange={handleChange}
                placeholder="Ej: Camioneta"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.tipo ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.tipo && <p className="text-xs text-red-500 mt-1">{errors.tipo}</p>}
              <p className="text-[11px] text-slate-400 mt-1">Se usa para sugerir la clasificación al asignarla a un proyecto.</p>
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
      </LayoutModalDocumento>
      {patenteDuplicada && (
        <ConfirmacionModal
          peligro
          titulo="Patente ya registrada"
          mensaje={`La patente ${patenteDuplicada.patente || formData.patente.trim()} ya la usa otra maquinaria activa: ${patenteDuplicada.nombre || "sin nombre"}. La patente no es única; puede continuar si corresponde.`}
          textoConfirmar="Crear de todas formas"
          ocupado={loading}
          onCancelar={() => setPatenteDuplicada(null)}
          onConfirmar={() => crear(true)}
        />
      )}
    </>
  );
};
