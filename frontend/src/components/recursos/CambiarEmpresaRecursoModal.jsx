import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { recursoService } from "../../services/recursoService";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { empresaService } from "../../services/empresaService";
import { formatRutDisplay as formatRutBusqueda } from "../../utils/rutFormatters";
import { SelectConBusqueda } from "../shared/SelectConBusqueda";
import { SugerenciasChips } from "../shared/SugerenciasChips";
import { SUGERENCIAS_TIPO_RELACION_RECURSO } from "../../utils/sugerenciasRelacionLaboral";
import { hoyISO } from "../../utils/fechas";
import { DateInput } from "../ui/DateInput";

// Modal "Cambiar Empresa" para Recurso (maquinaria) — compartido entre
// RecursoDetailPage.jsx y RecursoFormPage.jsx, antes vivía embebido solo
// en el primero. Distinto del de Persona (CambiarEmpresaModal.jsx): el
// Recurso solo lleva `tipoRelacion` (sin cargo/tipoContrato/jornada), por
// eso es un componente propio y no uno parametrizado — los campos del
// formulario son genuinamente distintos, no una copia casi idéntica.
// Usa recursoService.cambiarEmpresa (empresaRecursos, RN-122): si la relación anterior tiene
// asignaciones activas, muestra la lista para confirmar (ConfirmacionModal) antes de reenviar.
export const CambiarEmpresaRecursoModal = ({ recursoId, empresaActualNombre, empresaActualId = null, onCambiado, onCerrar }) => {
  const [empresasOpciones, setEmpresasOpciones] = useState([]);
  const [formData, setFormData] = useState({ empresaId: "", tipoRelacion: "", fechaInicio: hoyISO() });
  const [errors, setErrors] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);

  useEffect(() => {
    empresaService.listar("activo")
      .then((data) => setEmpresasOpciones(data || []))
      .catch((err) => console.error("Error al cargar empresas:", err));
  }, []);

  // La Empresa actual se muestra bloqueada: cambiar de Empresa es pasar a OTRA (si no existe,
  // primero hay que crearla en Empresas).
  const esEmpresaActual = (e) => (empresaActualId ? e.id === empresaActualId
    : Boolean(empresaActualNombre) && e.razonSocial === empresaActualNombre);
  const hayOtraEmpresa = empresasOpciones.some((e) => !esEmpresaActual(e));

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
    if (!formData.fechaInicio) errs.fechaInicio = "La fecha de inicio es obligatoria.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const enviar = async (confirmado) => {
    setGuardando(true);
    try {
      const nuevaRelacion = await recursoService.cambiarEmpresa(recursoId, {
        empresaId: formData.empresaId,
        tipoRelacion: formData.tipoRelacion.trim(),
        fechaInicio: formData.fechaInicio,
        confirmado,
      });
      setConfirmacion(null);
      onCambiado(nuevaRelacion);
    } catch (err) {
      if (err.codigo === "CONFIRMACION_REQUERIDA") {
        setConfirmacion({ mensaje: err.message, asignaciones: err.detalle?.asignaciones || [] });
      } else {
        console.error("Error al cambiar la empresa:", err);
        setConfirmacion(null);
        setServerError(err.message || "No se pudo cambiar la Empresa.");
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validar()) return;
    await enviar(false);
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
            Esto termina la relación con la Empresa actual y crea una nueva; el historial se conserva. Si tiene asignaciones activas en proyectos con la empresa actual, se finalizarán (se pedirá confirmación).
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
                  value: e.id, label: e.razonSocial, logoUrl: e.logoUrl || null, buscar: e.rut ? `${e.rut} ${formatRutBusqueda(e.rut)}` : "",
                  ...(esEmpresaActual(e) ? { deshabilitada: true, nota: "Empresa actual" } : {}),
                })),
              ]}
            />
            {errors.empresaId && <p className="text-xs text-red-500 mt-1">{errors.empresaId}</p>}
            <p className={`text-[11px] mt-1 ${hayOtraEmpresa ? "text-slate-400" : "font-semibold text-amber-700"}`}>
              {hayOtraEmpresa
                ? "La empresa actual no se puede elegir. Si la nueva empresa no está en la lista, primero créala."
                : "No hay otra empresa disponible: debes crear una empresa nueva para poder cambiar de empresa."}{" "}
              <a href="/empresas/nuevo" target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">
                Crear empresa
              </a>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Relación *</label>
              <input
                type="text" name="tipoRelacion" value={formData.tipoRelacion} onChange={handleChange}
                placeholder="Ej: Propietario, Arrendatario"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
                  errors.tipoRelacion ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.tipoRelacion && <p className="text-xs text-red-500 mt-1">{errors.tipoRelacion}</p>}
              <SugerenciasChips opciones={SUGERENCIAS_TIPO_RELACION_RECURSO} valor={formData.tipoRelacion} onElegir={(v) => elegir("tipoRelacion", v)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de Inicio *</label>
              <DateInput
                name="fechaInicio" value={formData.fechaInicio} onChange={handleChange}
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
      {confirmacion && (
        <ConfirmacionModal
          peligro
          titulo={(confirmacion?.asignaciones?.length || 0) > 0 ? "Se finalizarán asignaciones activas" : "Se terminará la relación vigente"}
          mensaje={confirmacion.mensaje}
          items={confirmacion.asignaciones.map((a) => ({ key: a.participacionId, principal: a.proyectoNombre }))}
          textoConfirmar={(confirmacion?.asignaciones?.length || 0) > 0 ? "Cambiar de empresa y finalizarlas" : "Cambiar de empresa"}
          ocupado={guardando}
          onCancelar={() => setConfirmacion(null)}
          onConfirmar={() => enviar(true)}
        />
      )}
    </div>
  );
};
