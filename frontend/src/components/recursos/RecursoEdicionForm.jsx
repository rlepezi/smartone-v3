import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Truck, Building2, AlertCircle, Repeat } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { recursoService } from "../../services/recursoService";
import { empresaService } from "../../services/empresaService";
import { sujetoService } from "../../services/participacionSujetoService";
import { proyectoService } from "../../services/proyectoService";
import { mandanteService } from "../../services/mandanteService";
import { ActionButton } from "../shared/ActionButton";
import { CambiarEmpresaRecursoModal } from "../recursos/CambiarEmpresaRecursoModal";
import { CambiarProyectoModal } from "../shared/CambiarProyectoModal";
import { MandanteChip } from "../shared/MandanteChip";
import { SelectConBusqueda } from "../shared/SelectConBusqueda";
import { SugerenciasChips } from "../shared/SugerenciasChips";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { formatRutDisplay as formatRutBusqueda } from "../../utils/rutFormatters";
import { SUGERENCIAS_TIPO_RELACION_RECURSO } from "../../utils/sugerenciasRelacionLaboral";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];
const OTRO_SENTINEL = "__otro__";

const hoyISO = () => new Date().toISOString().slice(0, 10);

// Formulario de datos identitarios (crear / editar). Se usa en dos lugares:
//   - RecursoFormPage: solo para CREAR (pantalla propia).
//   - el Detalle, como edición in-place de la pestaña Resumen (enDetalle=true): sin
//     botones propios (Guardar/Cancelar viven en el encabezado del detalle,
//     vinculados por `formId`) y sin los bloques de gestión que ahí ya tienen su
//     pestaña.
export const RecursoEdicionForm = ({
  idEntidad: id, formId, enDetalle = false, onGuardado, onCancelar, onDirtyChange, onGuardandoChange,
}) => {
  const { profile } = useAuth();
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);

  const [formData, setFormData] = useState({
    nombre: "",
    tipo: "",
    estado: "activo",
    patente: "",
    marca: "",
    modelo: "",
    anio: "",
    // Solo se usan al crear — la Empresa/relación después se cambia
    // únicamente vía "Cambiar Empresa" desde el detalle (RN-122).
    empresaId: "",
    tipoRelacion: "",
    fechaInicio: hoyISO(),
  });

  const [tiposDisponibles, setTiposDisponibles] = useState([]);
  const [tipoPersonalizado, setTipoPersonalizado] = useState("");
  const [empresasOpciones, setEmpresasOpciones] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);
  // Patente ya usada por otra maquinaria activa visible (409 PATENTE_DUPLICADA): aviso, no bloqueo;
  // al confirmar se reenvía con confirmarPatenteDuplicada: true.
  const [patenteDuplicada, setPatenteDuplicada] = useState(null); // {recursoId, nombre, patente}

  // Empresa activa (nombre, para el modal "Cambiar Empresa") y si ya
  // tiene alguna participación activa en un Proyecto (para el rótulo
  // "Cambiar Proyecto" vs "Asignar a Proyecto") — mismo criterio que
  // PersonaFormPage.jsx.
  const [empresaActualNombre, setEmpresaActualNombre] = useState(null);
  const [tieneParticipacionActiva, setTieneParticipacionActiva] = useState(false);
  // Mandante del Proyecto de la participación activa (Recurso no tiene un
  // Mandante propio) — a diferencia de Persona, no hay un
  // recursoService.obtenerResumen que lo resuelva server-side, así que se
  // arma acá con dos llamadas ya existentes (Proyecto → Mandante), mismo
  // patrón que ProyectoDetailPage.jsx.
  const [mandanteActual, setMandanteActual] = useState(null);
  const [cambiarEmpresaAbierto, setCambiarEmpresaAbierto] = useState(false);
  const [cambiarProyectoAbierto, setCambiarProyectoAbierto] = useState(false);

  const resolverMandanteDesdeParticipaciones = (activas) => {
    const primera = activas?.[0];
    if (!primera?.proyectoId) {
      setMandanteActual(null);
      return;
    }
    proyectoService.obtenerPorId(primera.proyectoId)
      .then((proyecto) => {
        if (!proyecto?.mandanteId) {
          setMandanteActual(null);
          return;
        }
        return mandanteService.obtenerPorId(proyecto.mandanteId)
          .then((m) => setMandanteActual({ nombre: getMandanteDisplayName(m) || proyecto.mandanteId, logoUrl: m?.logoUrl || null }));
      })
      .catch(() => setMandanteActual(null));
  };

  const elegirCampo = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
  };

  useEffect(() => {
    // Solo se necesita al crear — en edición el bloque Empresa no se
    // muestra (RN-122: se cambia únicamente vía "Cambiar Empresa").
    if (esEdicion) return;
    empresaService.listar("activo")
      .then((data) => setEmpresasOpciones(data || []))
      .catch((err) => console.error("Error al cargar empresas:", err));
  }, [esEdicion]);

  useEffect(() => {
    recursoService
      .listarTipos()
      .then((data) => {
        setTiposDisponibles(data || []);
        if (!esEdicion && !formData.tipo && data?.length) {
          setFormData((prev) => ({ ...prev, tipo: data[0].value }));
        }
      })
      .catch((err) => console.error("Error al cargar tipos de recurso:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!esEdicion) return;
    recursoService
      .obtenerPorId(id)
      .then((data) => {
        setFormData((prev) => ({
          ...prev,
          nombre: data.nombre || "",
          tipo: data.tipo || "",
          estado: data.estado || "activo",
          patente: data.patente || "",
          marca: data.marca || "",
          modelo: data.modelo || "",
          anio: data.anio ? String(data.anio) : "",
        }));
        // Empresa actual: la de su relación activa (null si es de una empresa fuera del alcance).
        setEmpresaActualNombre(data.empresaActual?.empresaNombre || null);
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar la maquinaria."))
      .finally(() => setCargandoRegistro(false));

    sujetoService.listar({ recursoId: id, estado: "activa" })
      .then((data) => {
        setTieneParticipacionActiva((data?.length || 0) > 0);
        resolverMandanteDesdeParticipaciones(data || []);
      })
      .catch((err) => console.error("Error al cargar participaciones activas:", err));
  }, [id, esEdicion]);

  const handleEmpresaCambiada = () => {
    setCambiarEmpresaAbierto(false);
    recursoService.obtenerPorId(id)
      .then((data) => setEmpresaActualNombre(data.empresaActual?.empresaNombre || null))
      .catch((err) => console.error("Error al recargar la empresa actual:", err));
  };

  const handleProyectoCambiado = () => {
    setCambiarProyectoAbierto(false);
    sujetoService.listar({ recursoId: id, estado: "activa" })
      .then((data) => {
        setTieneParticipacionActiva((data?.length || 0) > 0);
        resolverMandanteDesdeParticipaciones(data || []);
      })
      .catch((err) => console.error("Error al recargar participaciones activas:", err));
  };

  const tiposFijos = tiposDisponibles.filter((t) => t.origen === "catalogo");
  const tiposPersonalizados = tiposDisponibles.filter((t) => t.origen === "personalizado");
  const usaTipoPersonalizado = formData.tipo === OTRO_SENTINEL;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    if (!formData.tipo) newErrors.tipo = "El tipo es obligatorio.";
    if (usaTipoPersonalizado && !tipoPersonalizado.trim()) {
      newErrors.tipoPersonalizado = "Debe especificar el tipo.";
    }
    if (!formData.patente.trim()) newErrors.patente = "La patente es obligatoria.";
    if (!esEdicion) {
      if (!formData.empresaId) {
        newErrors.empresaId = "Debe seleccionar una Empresa.";
      }
      if (!formData.tipoRelacion.trim()) {
        newErrors.tipoRelacion = "El tipo de relación es obligatorio.";
      }
      if (!formData.fechaInicio) {
        newErrors.fechaInicio = "La fecha de inicio es obligatoria.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const guardar = async (confirmarPatenteDuplicada = false) => {
    setLoading(true);

    const datosBase = {
      nombre: formData.nombre.trim(),
      tipo: usaTipoPersonalizado ? tipoPersonalizado.trim() : formData.tipo,
      estado: formData.estado,
      patente: formData.patente.trim(),
      confirmarPatenteDuplicada,
      marca: formData.marca.trim() || null,
      modelo: formData.modelo.trim() || null,
      anio: formData.anio ? Number(formData.anio) : null,
    };

    try {
      if (esEdicion) {
        await recursoService.actualizar(id, datosBase);
        onGuardado?.();
      } else {
        await recursoService.crear({
          ...datosBase,
          empresaId: formData.empresaId,
          tipoRelacion: formData.tipoRelacion.trim(),
          fechaInicio: formData.fechaInicio,
        });
        onGuardado?.();
      }
      setPatenteDuplicada(null);
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
    await guardar(false);
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
        Cargando maquinaria...
      </div>
    );
  }


  return (
    <div className="space-y-6">
      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form id={formId} onSubmit={handleSubmit} className="space-y-6">
        {/*
          Empresa + relación inicial — SOLO al crear, y como primer bloque: la Maquinaria se crea
          junto con su relación (empresaRecursos). En edición la Empresa/Proyecto activos se
          cambian vía "Cambiar Empresa"/"Cambiar Proyecto" (RN-122), nunca con este formulario.
        */}
        {!esEdicion && (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Empresa</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Empresa *</label>
                <SelectConBusqueda
                  bloque
                  conAvatar
                  invalido={Boolean(errors.empresaId)}
                  disabled={!puedeEscribir}
                  value={formData.empresaId}
                  onChange={(v) => elegirCampo("empresaId", v)}
                  textoVacio="Seleccione una Empresa..."
                  placeholder="Buscar por nombre o RUT..."
                  options={[
                    { value: "", label: "Seleccione una Empresa..." },
                    ...empresasOpciones.map((e) => ({
                      value: e.id, label: e.razonSocial, logoUrl: e.logoUrl || null, buscar: e.rut ? `${e.rut} ${formatRutBusqueda(e.rut)}` : "",
                    })),
                  ]}
                />
                {errors.empresaId && <p className="text-xs text-red-500 mt-1">{errors.empresaId}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Relación *</label>
                <input
                  type="text"
                  name="tipoRelacion"
                  value={formData.tipoRelacion}
                  onChange={handleChange}
                  disabled={!puedeEscribir}
                  placeholder="Ej: Propietario, Arrendatario"
                  className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                    errors.tipoRelacion ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {errors.tipoRelacion && <p className="text-xs text-red-500 mt-1">{errors.tipoRelacion}</p>}
                {puedeEscribir && <SugerenciasChips opciones={SUGERENCIAS_TIPO_RELACION_RECURSO} valor={formData.tipoRelacion} onElegir={(v) => elegirCampo("tipoRelacion", v)} />}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de Inicio *</label>
                <input
                  type="date"
                  name="fechaInicio"
                  value={formData.fechaInicio}
                  onChange={handleChange}
                  disabled={!puedeEscribir}
                  className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                    errors.fechaInicio ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {errors.fechaInicio && <p className="text-xs text-red-500 mt-1">{errors.fechaInicio}</p>}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Truck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos de la Maquinaria</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre *</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Retroexcavadora CAT 320"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo *</label>
              <select
                name="tipo"
                value={formData.tipo}
                onChange={handleChange}
                disabled={!puedeEscribir}
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.tipo ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              >
                <optgroup label="Catálogo">
                  {tiposFijos.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </optgroup>
                {tiposPersonalizados.length > 0 && (
                  <optgroup label="Personalizados">
                    {tiposPersonalizados.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                )}
                <option value={OTRO_SENTINEL}>+ Otro (especificar)</option>
              </select>
              {errors.tipo && <p className="text-xs text-red-500 mt-1">{errors.tipo}</p>}
              {usaTipoPersonalizado && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={tipoPersonalizado}
                    onChange={(e) => {
                      setTipoPersonalizado(e.target.value);
                      if (errors.tipoPersonalizado) {
                        setErrors((prev) => ({ ...prev, tipoPersonalizado: null }));
                      }
                    }}
                    disabled={!puedeEscribir}
                    placeholder="Ej: Compresor de aire"
                    maxLength={60}
                    className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                      errors.tipoPersonalizado ? "border-red-400 bg-red-50/30" : "border-gray-200"
                    }`}
                  />
                  {errors.tipoPersonalizado && <p className="text-xs text-red-500 mt-1">{errors.tipoPersonalizado}</p>}
                </div>
              )}
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
              </select>
            </div>

            {esEdicion && !enDetalle && mandanteActual && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandante</label>
                <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl">
                  <MandanteChip nombre={mandanteActual.nombre} logoUrl={mandanteActual.logoUrl} />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Heredado del Proyecto donde participa actualmente — no se edita acá.
                </p>
              </div>
            )}

            {/*
              Empresa/Proyecto activos no son campos de este formulario
              (RN-122: cambian solo vía transacción dedicada, nunca con un
              simple PUT) — acá solo los botones que abren esos modales,
              mismos componentes que usa RecursoDetailPage.jsx.
            */}
            {esEdicion && !enDetalle && puedeEscribir && (
              <div className="md:col-span-2 flex items-center gap-2 pt-1">
                <ActionButton onClick={() => setCambiarEmpresaAbierto(true)} icon={Building2}>
                  Cambiar Empresa
                </ActionButton>
                <ActionButton onClick={() => setCambiarProyectoAbierto(true)} icon={Repeat}>
                  {tieneParticipacionActiva ? "Cambiar Proyecto" : "Asignar a Proyecto"}
                </ActionButton>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Patente / Identificación *</label>
              <input
                type="text"
                name="patente"
                value={formData.patente}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: ABCD12"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.patente ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.patente && <p className="text-xs text-red-500 mt-1">{errors.patente}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Marca (Opcional)</label>
              <input
                type="text"
                name="marca"
                value={formData.marca}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Caterpillar"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Modelo (Opcional)</label>
              <input
                type="text"
                name="modelo"
                value={formData.modelo}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: 320"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Año (Opcional)</label>
              <input
                type="number"
                name="anio"
                value={formData.anio}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: 2020"
                min="1950"
                max="2100"
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
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
              {loading ? "Guardando..." : "Guardar Maquinaria"}
            </button>
          )}
        </div>
        )}
      </form>

      {patenteDuplicada && (
        <ConfirmacionModal
          peligro
          titulo="Patente ya registrada"
          mensaje={`La patente ${patenteDuplicada.patente || formData.patente.trim()} ya la usa otra maquinaria activa: ${patenteDuplicada.nombre || "sin nombre"}. La patente no es única; puede continuar si corresponde.`}
          textoConfirmar="Guardar de todas formas"
          ocupado={loading}
          onCancelar={() => setPatenteDuplicada(null)}
          onConfirmar={() => guardar(true)}
        />
      )}

      {cambiarEmpresaAbierto && (
        <CambiarEmpresaRecursoModal
          recursoId={id}
          empresaActualNombre={empresaActualNombre}
          onCambiado={handleEmpresaCambiada}
          onCerrar={() => setCambiarEmpresaAbierto(false)}
        />
      )}

      {cambiarProyectoAbierto && (
        <CambiarProyectoModal
          entidadTipo="recurso"
          entidadId={id}
          tieneParticipacionActiva={tieneParticipacionActiva}
          onCambiado={handleProyectoCambiado}
          onCerrar={() => setCambiarProyectoAbierto(false)}
        />
      )}
    </div>
  );
};
