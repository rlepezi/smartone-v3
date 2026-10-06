import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { relacionLaboralService } from "../../services/relacionLaboralService";
import { empresaService } from "../../services/empresaService";
import { formatRutDisplay } from "../../utils/rutFormatters";
import { SelectConBusqueda } from "../shared/SelectConBusqueda";
import { SugerenciasChips } from "../shared/SugerenciasChips";
import { useSugerenciasPerfilRecurso } from "../../hooks/useSugerenciasPerfilRecurso";
import { useMandantesDeEmpresa } from "../../hooks/useMandantesDeEmpresa";
import {
  SUGERENCIAS_TIPO_RELACION_PERSONA, SUGERENCIAS_TIPO_CONTRATO, SUGERENCIAS_JORNADA,
} from "../../utils/sugerenciasRelacionLaboral";

const hoyISO = () => new Date().toISOString().slice(0, 10);

// Modal "Cambiar Empresa" — compartido entre PersonaDetailPage.jsx y
// PersonaFormPage.jsx (modo edición), antes vivía embebido solo en el
// primero. Se autoabastece de su propia lista de Empresas (no depende de
// que el llamador ya la tenga cargada) para poder montarse igual en
// ambas pantallas. Reutiliza relacionLaboralService.cambiarEmpresa
// (RN-063) tal cual, sin reimplementar la transacción de cierre/apertura.
export const CambiarEmpresaModal = ({ personaId, empresaActualNombre, onCambiado, onCerrar }) => {
  const [empresasOpciones, setEmpresasOpciones] = useState([]);
  const [formData, setFormData] = useState({
    empresaId: "", tipoRelacion: "", cargo: "", tipoContrato: "", jornada: "", fechaInicio: hoyISO(),
  });
  const [errors, setErrors] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    empresaService.listar("activo")
      .then((data) => setEmpresasOpciones(data || []))
      .catch((err) => console.error("Error al cargar empresas:", err));
  }, []);

  // Cargo = catálogo Perfil de Recurso (persona) del Mandante de la Empresa elegida: sin Empresa, sin sugerencias.
  const sugerenciasCargo = useSugerenciasPerfilRecurso(useMandantesDeEmpresa(formData.empresaId), "persona");

  const elegir = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validar = () => {
    const errs = {};
    if (!formData.empresaId) errs.empresaId = "Debe seleccionar una Empresa.";
    if (!formData.tipoRelacion.trim()) errs.tipoRelacion = "El tipo de relación es obligatorio.";
    if (!formData.cargo.trim()) errs.cargo = "La función es obligatoria.";
    if (!formData.tipoContrato.trim()) errs.tipoContrato = "El tipo de contrato es obligatorio.";
    if (!formData.fechaInicio) errs.fechaInicio = "La fecha de inicio es obligatoria.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validar()) return;
    setGuardando(true);
    try {
      const nuevaRelacion = await relacionLaboralService.cambiarEmpresa(personaId, {
        empresaId: formData.empresaId,
        tipoRelacion: formData.tipoRelacion.trim(),
        cargo: formData.cargo.trim(),
        tipoContrato: formData.tipoContrato.trim(),
        jornada: formData.jornada.trim() || null,
        fechaInicio: formData.fechaInicio,
      });
      onCambiado(nuevaRelacion);
    } catch (err) {
      console.error("Error al cambiar la empresa:", err);
      setServerError(err.message || "No se pudo cambiar la Empresa.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCerrar}>
      <div
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Cambiar Empresa</h3>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">{serverError}</div>
          )}
          <p className="text-xs text-slate-500">
            {empresaActualNombre && <>Empresa actual: <strong className="text-slate-700">{empresaActualNombre}</strong>. </>}
            Esto cierra la relación laboral activa actual y crea una nueva — el historial de Asignaciones a Proyectos ya existentes no se ve afectado.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nueva Empresa *</label>
            <SelectConBusqueda
              bloque
              conAvatar
              invalido={Boolean(errors.empresaId)}
              value={formData.empresaId}
              onChange={(v) => elegir("empresaId", v)}
              textoVacio="Seleccione una Empresa..."
              placeholder="Buscar por nombre o RUT..."
              options={[
                { value: "", label: "Seleccione una Empresa..." },
                ...empresasOpciones.map((e) => ({
                  value: e.id, label: e.razonSocial, logoUrl: e.logoUrl || null, buscar: e.rut ? `${e.rut} ${formatRutDisplay(e.rut)}` : "",
                })),
              ]}
            />
            {errors.empresaId && <p className="text-xs text-red-500 mt-1">{errors.empresaId}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Relación *</label>
              <input
                type="text" name="tipoRelacion" value={formData.tipoRelacion} onChange={handleChange}
                placeholder="Ej: Trabajador"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.tipoRelacion ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.tipoRelacion && <p className="text-xs text-red-500 mt-1">{errors.tipoRelacion}</p>}
              <SugerenciasChips opciones={SUGERENCIAS_TIPO_RELACION_PERSONA} valor={formData.tipoRelacion} onElegir={(v) => elegir("tipoRelacion", v)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Función *</label>
              <input
                type="text" name="cargo" value={formData.cargo} onChange={handleChange}
                placeholder="Ej: Operador de Camión"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.cargo ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.cargo && <p className="text-xs text-red-500 mt-1">{errors.cargo}</p>}
              <SugerenciasChips opciones={sugerenciasCargo} valor={formData.cargo} onElegir={(v) => elegir("cargo", v)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Contrato *</label>
              <input
                type="text" name="tipoContrato" value={formData.tipoContrato} onChange={handleChange}
                placeholder="Ej: Indefinido"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.tipoContrato ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.tipoContrato && <p className="text-xs text-red-500 mt-1">{errors.tipoContrato}</p>}
              <SugerenciasChips opciones={SUGERENCIAS_TIPO_CONTRATO} valor={formData.tipoContrato} onElegir={(v) => elegir("tipoContrato", v)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Jornada</label>
              <input
                type="text" name="jornada" value={formData.jornada} onChange={handleChange}
                placeholder="Ej: Diurna"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              <SugerenciasChips opciones={SUGERENCIAS_JORNADA} valor={formData.jornada} onElegir={(v) => elegir("jornada", v)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de Inicio *</label>
              <input
                type="date" name="fechaInicio" value={formData.fechaInicio} onChange={handleChange}
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.fechaInicio ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.fechaInicio && <p className="text-xs text-red-500 mt-1">{errors.fechaInicio}</p>}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onCerrar} className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Confirmar Cambio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
