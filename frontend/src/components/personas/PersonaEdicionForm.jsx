import React, { useEffect, useRef, useState } from "react";
import { Users, Briefcase, AlertCircle, Building2, FolderKanban } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { personaService } from "../../services/personaService";
import { empresaService } from "../../services/empresaService";
import { formatRutDisplay as formatRutBusqueda } from "../../utils/rutFormatters";
import { SelectConBusqueda } from "../shared/SelectConBusqueda";
import { SugerenciasChips } from "../shared/SugerenciasChips";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import {
  SUGERENCIAS_TIPO_RELACION_PERSONA, SUGERENCIAS_TIPO_CONTRATO, SUGERENCIAS_JORNADA,
} from "../../utils/sugerenciasRelacionLaboral";
import { formatRutDisplay, validateRut, cleanRut } from "../../utils/rutFormatters";
import { ActionButton } from "../shared/ActionButton";
import { CambiarEmpresaModal } from "../personas/CambiarEmpresaModal";
import { CambiarProyectoModal } from "../shared/CambiarProyectoModal";
import { MandanteChip } from "../shared/MandanteChip";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

const hoyISO = () => new Date().toISOString().slice(0, 10);

// Formulario de datos identitarios (crear / editar). Se usa en dos lugares:
//   - PersonaFormPage: solo para CREAR (pantalla propia).
//   - el Detalle, como edición in-place de la pestaña Resumen (enDetalle=true): sin
//     botones propios (Guardar/Cancelar viven en el encabezado del detalle,
//     vinculados por `formId`) y sin los bloques de gestión que ahí ya tienen su
//     pestaña.
export const PersonaEdicionForm = ({
  idEntidad: id, formId, enDetalle = false, onGuardado, onCancelar, onDirtyChange, onGuardandoChange,
}) => {
  const { profile } = useAuth();
  const esEdicion = Boolean(id);
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);
  // La identificación no se edita después de creada, salvo superadmin.
  const rutEditable = !esEdicion || profile?.rol === "superadmin";

  const [formData, setFormData] = useState({
    rut: "",
    nombre: "",
    apellido: "",
    estado: "activo",
    // Solo se usan al crear — la Empresa/relación laboral después se
    // cambia únicamente vía "Cambiar Empresa" desde el detalle (RN-063).
    empresaId: "",
    tipoRelacion: "",
    cargo: "",
    tipoContrato: "",
    jornada: "",
    fechaInicio: hoyISO(),
  });

  const [empresasOpciones, setEmpresasOpciones] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);

  // Empresa activa (nombre, para el modal "Cambiar Empresa") y si ya
  // tiene alguna Asignación activa a un Proyecto (para saber si el botón
  // debe decir "Cambiar Proyecto" o "Asignar a Proyecto") — mismos datos
  // que ya carga PersonaDetailPage.jsx, aquí solo lo mínimo necesario
  // para los dos botones, sin duplicar toda esa pantalla.
  const [empresaActualNombre, setEmpresaActualNombre] = useState(null);
  const [tieneParticipacionActiva, setTieneParticipacionActiva] = useState(false);
  // Mandante del último Proyecto (heredado, Persona no tiene uno propio)
  // — mismo dato que ya trae personaService.obtenerResumen para el botón
  // "Cambiar Proyecto", solo mostrado también acá.
  const [mandanteActual, setMandanteActual] = useState(null);
  const [cambiarEmpresaAbierto, setCambiarEmpresaAbierto] = useState(false);
  const [cambiarProyectoAbierto, setCambiarProyectoAbierto] = useState(false);

  // Identificación ya registrada (409 IDENTIFICACION_EXISTENTE): se muestra esa Persona y se ofrece
  // crearle la relación con la Empresa elegida en vez de duplicarla. Si su relación actual tiene
  // asignaciones activas, el backend pide además confirmar cuáles se finalizarán.
  const [personaExistente, setPersonaExistente] = useState(null); // {personaId, nombre, apellido, identificacion, asignaciones?, mensaje?}
  const [relacionando, setRelacionando] = useState(false);

  const elegirCampo = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
  };

  useEffect(() => {
    if (esEdicion) return;
    empresaService.listar("activo")
      .then((data) => setEmpresasOpciones(data || []))
      .catch((err) => console.error("Error al cargar empresas:", err));
  }, [esEdicion]);

  useEffect(() => {
    if (!esEdicion) return;
    personaService
      .obtenerPorId(id)
      .then((data) => {
        setFormData((prev) => ({
          ...prev,
          rut: formatRutDisplay(data.rut || ""),
          nombre: data.nombre || "",
          apellido: data.apellido || "",
          estado: data.estado || "activo",
        }));
        // Empresa actual: la de su relación activa (null si es de una empresa fuera del alcance).
        setEmpresaActualNombre(data.empresaActual?.empresaNombre || null);
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar la persona."))
      .finally(() => setCargandoRegistro(false));

    personaService.obtenerResumen(id)
      .then((data) => {
        const activas = data?.participacionesActivas || [];
        setTieneParticipacionActiva(activas.length > 0);
        const primera = activas[0];
        setMandanteActual(
          primera?.mandanteNombre ? { nombre: primera.mandanteNombre, logoUrl: primera.mandanteLogoUrl } : null,
        );
      })
      .catch((err) => console.error("Error al cargar el resumen de la persona:", err));
  }, [id, esEdicion]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "rut") {
      setFormData((prev) => ({ ...prev, rut: formatRutDisplay(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    if (!formData.apellido.trim()) newErrors.apellido = "El apellido es obligatorio.";
    if (rutEditable) {
      if (!formData.rut.trim()) {
        newErrors.rut = "El RUT es obligatorio.";
      } else if (!validateRut(formData.rut)) {
        newErrors.rut = "El RUT ingresado no es válido.";
      }
    }
    if (!esEdicion) {
      if (!formData.empresaId) {
        newErrors.empresaId = "Debe seleccionar una Empresa.";
      }
      if (!formData.tipoRelacion.trim()) {
        newErrors.tipoRelacion = "El tipo de relación es obligatorio.";
      }
      if (!formData.cargo.trim()) {
        newErrors.cargo = "El cargo es obligatorio.";
      }
      if (!formData.tipoContrato.trim()) {
        newErrors.tipoContrato = "El tipo de contrato es obligatorio.";
      }
      if (!formData.fechaInicio) {
        newErrors.fechaInicio = "La fecha de inicio es obligatoria.";
      }
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
      if (esEdicion) {
        const payload = {
          nombre: formData.nombre.trim(),
          apellido: formData.apellido.trim(),
          estado: formData.estado,
          ...(rutEditable ? { rut: cleanRut(formData.rut) } : {}),
        };
        await personaService.actualizar(id, payload);
        onGuardado?.();
      } else {
        const payload = {
          rut: cleanRut(formData.rut),
          nombre: formData.nombre.trim(),
          apellido: formData.apellido.trim(),
          estado: formData.estado,
          empresaId: formData.empresaId,
          tipoRelacion: formData.tipoRelacion.trim(),
          cargo: formData.cargo.trim(),
          tipoContrato: formData.tipoContrato.trim(),
          jornada: formData.jornada.trim() || null,
          fechaInicio: formData.fechaInicio,
        };
        await personaService.crear(payload);
        onGuardado?.();
      }
    } catch (err) {
      if (err.codigo === "IDENTIFICACION_EXISTENTE") {
        setPersonaExistente(err.detalle || {});
      } else {
        setServerError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Crea la relación de la Persona existente con la Empresa elegida (empresaPersonas). Si tenía
  // otra relación activa, esta se termina (cambio de empresa, con historial).
  const relacionarExistente = async (confirmado) => {
    setRelacionando(true);
    try {
      await personaService.cambiarEmpresa(personaExistente.personaId, {
        empresaId: formData.empresaId,
        tipoRelacion: formData.tipoRelacion.trim(),
        cargo: formData.cargo.trim(),
        tipoContrato: formData.tipoContrato.trim(),
        jornada: formData.jornada.trim() || null,
        fechaInicio: formData.fechaInicio,
        confirmado,
      });
      setPersonaExistente(null);
      onGuardado?.();
    } catch (err) {
      if (err.codigo === "CONFIRMACION_REQUERIDA") {
        setPersonaExistente((prev) => ({ ...prev, asignaciones: err.detalle?.asignaciones || [], mensaje: err.message }));
      } else {
        setPersonaExistente(null);
        setServerError(err.message || "No se pudo crear la relación con la Empresa.");
      }
    } finally {
      setRelacionando(false);
    }
  };

  const nombreEmpresaElegida = empresasOpciones.find((e) => e.id === formData.empresaId)?.razonSocial || "la Empresa elegida";
  const nombrePersonaExistente = personaExistente
    ? `${personaExistente.nombre || ""} ${personaExistente.apellido || ""}`.trim() || "Una Persona"
    : "";

  const handleEmpresaCambiada = () => {
    setCambiarEmpresaAbierto(false);
    personaService.obtenerPorId(id)
      .then((data) => setEmpresaActualNombre(data.empresaActual?.empresaNombre || null))
      .catch((err) => console.error("Error al recargar la empresa actual:", err));
  };

  const handleProyectoCambiado = () => {
    setCambiarProyectoAbierto(false);
    personaService.obtenerResumen(id)
      .then((data) => {
        const activas = data?.participacionesActivas || [];
        setTieneParticipacionActiva(activas.length > 0);
        const primera = activas[0];
        setMandanteActual(
          primera?.mandanteNombre ? { nombre: primera.mandanteNombre, logoUrl: primera.mandanteLogoUrl } : null,
        );
      })
      .catch((err) => console.error("Error al recargar el resumen de la persona:", err));
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
        Cargando persona...
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
        {/* Empresa: primer campo al crear (la Persona se crea junto con su relación laboral). */}
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
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos de la Persona</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Nombre *</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Juan"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Apellido *</label>
              <input
                type="text"
                name="apellido"
                value={formData.apellido}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Pérez"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.apellido ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.apellido && <p className="text-xs text-red-500 mt-1">{errors.apellido}</p>}
            </div>

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
                    placeholder="12.345.678-9"
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
              (RN-063: cambian solo vía transacción dedicada, nunca con un
              simple PUT) — acá solo los botones que abren esos modales,
              mismos componentes que usa PersonaDetailPage.jsx.
            */}
            {esEdicion && !enDetalle && puedeEscribir && (
              <div className="md:col-span-2 flex items-center gap-2 pt-1">
                <ActionButton onClick={() => setCambiarEmpresaAbierto(true)} icon={Building2}>
                  Cambiar Empresa
                </ActionButton>
                <ActionButton onClick={() => setCambiarProyectoAbierto(true)} icon={FolderKanban}>
                  {tieneParticipacionActiva ? "Cambiar Proyecto" : "Asignar a Proyecto"}
                </ActionButton>
              </div>
            )}
          </div>
        </div>

        {/*
          Empresa + relación laboral inicial — SOLO al crear. En edición
          la Empresa/Proyecto activos se cambian vía los botones de arriba
          ("Cambiar Empresa"/"Cambiar Proyecto", RN-063), nunca editando
          este formulario directo.
        */}
        {!esEdicion && (
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Briefcase className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Relación Laboral Inicial</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Relación *</label>
                <input
                  type="text"
                  name="tipoRelacion"
                  value={formData.tipoRelacion}
                  onChange={handleChange}
                  disabled={!puedeEscribir}
                  placeholder="Ej: Trabajador, Contratista independiente"
                  className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                    errors.tipoRelacion ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {errors.tipoRelacion && <p className="text-xs text-red-500 mt-1">{errors.tipoRelacion}</p>}
                {puedeEscribir && <SugerenciasChips opciones={SUGERENCIAS_TIPO_RELACION_PERSONA} valor={formData.tipoRelacion} onElegir={(v) => elegirCampo("tipoRelacion", v)} />}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cargo *</label>
                <input
                  type="text"
                  name="cargo"
                  value={formData.cargo}
                  onChange={handleChange}
                  disabled={!puedeEscribir}
                  placeholder="Ej: Operador de Camión"
                  className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                    errors.cargo ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {errors.cargo && <p className="text-xs text-red-500 mt-1">{errors.cargo}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de Contrato *</label>
                <input
                  type="text"
                  name="tipoContrato"
                  value={formData.tipoContrato}
                  onChange={handleChange}
                  disabled={!puedeEscribir}
                  placeholder="Ej: Plazo Fijo, Indefinido"
                  className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                    errors.tipoContrato ? "border-red-400 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {errors.tipoContrato && <p className="text-xs text-red-500 mt-1">{errors.tipoContrato}</p>}
                {puedeEscribir && <SugerenciasChips opciones={SUGERENCIAS_TIPO_CONTRATO} valor={formData.tipoContrato} onElegir={(v) => elegirCampo("tipoContrato", v)} />}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Jornada</label>
                <input
                  type="text"
                  name="jornada"
                  value={formData.jornada}
                  onChange={handleChange}
                  disabled={!puedeEscribir}
                  placeholder="Ej: Diurna, Turno"
                  className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                />
                {puedeEscribir && <SugerenciasChips opciones={SUGERENCIAS_JORNADA} valor={formData.jornada} onElegir={(v) => elegirCampo("jornada", v)} />}
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
              {loading ? "Guardando..." : "Guardar Persona"}
            </button>
          )}
        </div>
        )}
      </form>

      {personaExistente && !personaExistente.asignaciones && (
        <ConfirmacionModal
          titulo="Esta Persona ya está registrada"
          mensaje={`${nombrePersonaExistente} (${personaExistente.identificacion?.tipo || "RUT"} ${personaExistente.identificacion?.tipo === "RUT" ? formatRutDisplay(personaExistente.identificacion.numero || "") : personaExistente.identificacion?.numero || ""}) ya existe. Puede crearle la relación con ${nombreEmpresaElegida} usando los datos de relación laboral de este formulario, en vez de duplicarla. Si tiene otra relación vigente, esta se terminará y quedará en su historial.`}
          textoConfirmar="Crear relación con la Empresa"
          ocupado={relacionando}
          onCancelar={() => setPersonaExistente(null)}
          onConfirmar={() => relacionarExistente(false)}
        />
      )}

      {personaExistente?.asignaciones && (
        <ConfirmacionModal
          peligro
          titulo={(personaExistente?.asignaciones?.length || 0) > 0 ? "Se finalizarán asignaciones activas" : "Se terminará la relación vigente"}
          mensaje={personaExistente.mensaje}
          items={personaExistente.asignaciones.map((a) => ({ key: a.participacionId, principal: a.proyectoNombre }))}
          textoConfirmar={(personaExistente?.asignaciones?.length || 0) > 0 ? "Cambiar de empresa y finalizarlas" : "Cambiar de empresa"}
          ocupado={relacionando}
          onCancelar={() => setPersonaExistente(null)}
          onConfirmar={() => relacionarExistente(true)}
        />
      )}

      {cambiarEmpresaAbierto && (
        <CambiarEmpresaModal
          personaId={id}
          empresaActualNombre={empresaActualNombre}
          onCambiado={handleEmpresaCambiada}
          onCerrar={() => setCambiarEmpresaAbierto(false)}
        />
      )}

      {cambiarProyectoAbierto && (
        <CambiarProyectoModal
          entidadTipo="persona"
          entidadId={id}
          tieneParticipacionActiva={tieneParticipacionActiva}
          onCambiado={handleProyectoCambiado}
          onCerrar={() => setCambiarProyectoAbierto(false)}
        />
      )}
    </div>
  );
};
