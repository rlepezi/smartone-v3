import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban, AlertCircle, CalendarRange, Eye, Trash2, Copy, Download,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { proyectoService, ESTADOS_PROYECTO, textoCierreExpedientes } from "../../services/proyectoService";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { mandanteService } from "../../services/mandanteService";
import { MandanteChip } from "../shared/MandanteChip";
import { TarjetaPanel } from "../shared/DetalleUI";
import { EstadoProyectoPanel } from "./EstadoProyectoPanel";
import {
  REGIONES_CHILE, TIPOS_PROYECTO,
} from "../../utils/catalogosProyecto";
import { calcularCronograma, ESTADOS_CRONOGRAMA } from "../../utils/cronogramaProyecto";
import { DateInput } from "../ui/DateInput";
import { aFechaISO } from "../../utils/fechas";
import { aMayusculas } from "../../utils/texto";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { CampoMandante } from "../shared/CampoMandante";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];
const MAX_OBSERVACIONES = 500;

const CLASE_INPUT = "w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed";
const CLASE_LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";

const FORM_VACIO = {
  nombre: "",
  codigo: "",
  mandanteId: "",
  fechaInicio: "",
  fechaTermino: "",
  descripcion: "",
  ubicacion: "",
  tipoProyecto: "",
  observaciones: "",
  fechaInicioEfectiva: "",
  fechaTerminoReprogramada: "",
};

// <select> de catálogo: si el valor guardado ya no está en la lista de opciones,
// se sigue mostrando (no se pierde el dato al editar).
const SelectorCatalogo = ({ name, value, onChange, opciones, disabled, placeholder = "Seleccione..." }) => (
  <select
    name={name}
    value={value}
    onChange={onChange}
    disabled={disabled}
    className={`${CLASE_INPUT} border-gray-200`}
  >
    <option value="">{placeholder}</option>
    {value && !opciones.includes(value) && <option value={value}>{value}</option>}
    {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

// Formulario de Proyecto (crear / editar). Se usa en dos lugares:
//   - ProyectoFormPage: solo para CREAR un proyecto (pantalla propia).
//   - ProyectoDetailPage: como edición in-place de la pestaña Resumen
//     (enDetalle=true): sin botones propios (Guardar/Cancelar viven en el
//     encabezado del detalle, vinculados por `formId`) y sin el atajo
//     "Ver detalle", que ahí no aplica.
export const ProyectoEdicionForm = ({
  idProyecto: id, formId, enDetalle = false, onGuardado, onCancelar,
  onDirtyChange, onGuardandoChange, onEliminado,
}) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const actorRol = profile?.rol;
  const esEdicion = Boolean(id);
  // Mandante del proyecto nuevo: fijo, único o elegido (solo en alta).
  const contextoMandante = useMandanteContexto({ activo: !esEdicion });
  const sinSelectorMandante = contextoMandante.modo !== "seleccionable";
  const nombreRef = useRef(null);
  const tieneRolEscritura = ROLES_ESCRITURA.includes(actorRol);

  const [formData, setFormData] = useState(FORM_VACIO);

  const [estadoActual, setEstadoActual] = useState(null);
  const [estadoForm, setEstadoForm] = useState("");
  const [fechaTerminoReal, setFechaTerminoReal] = useState("");
  const [mandanteNombre, setMandanteNombre] = useState("");
  const [mandanteLogoUrl, setMandanteLogoUrl] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  // Confirmación de finalizar o archivar: { tipo: "finalizar" | "archivar", cantidad }.
  const [confirmacionCierre, setConfirmacionCierre] = useState(null);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);

  // Aviso de cambios sin guardar: se compara con una foto del formulario tomada
  // al terminar de cargar.
  const fotoInicialRef = useRef(null);
  useEffect(() => {
    if (cargandoRegistro) return;
    const actual = JSON.stringify([formData, estadoForm]);
    if (fotoInicialRef.current === null) {
      fotoInicialRef.current = actual;
      return;
    }
    onDirtyChange?.(actual !== fotoInicialRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, estadoForm, cargandoRegistro]);

  useEffect(() => {
    onGuardandoChange?.(loading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const proyectoArchivado = esEdicion && estadoActual === "archivado";
  const proyectoFinalizado = esEdicion && estadoActual === "finalizado";
  const puedeEscribir = tieneRolEscritura && !proyectoArchivado;

  useEffect(() => {
    if (!esEdicion) return;
    proyectoService
      .obtenerPorId(id)
      .then(async (data) => {
        setFormData({
          nombre: data.nombre || "",
          codigo: data.codigo || "",
          mandanteId: data.mandanteId || "",
          fechaInicio: aFechaISO(data.fechaInicio),
          fechaTermino: aFechaISO(data.fechaTermino),
          descripcion: data.descripcion || "",
          ubicacion: data.ubicacion || "",
          tipoProyecto: data.tipoProyecto || "",
          observaciones: data.observaciones || "",
          fechaInicioEfectiva: aFechaISO(data.fechaInicioEfectiva),
          fechaTerminoReprogramada: aFechaISO(data.fechaTerminoReprogramada),
        });
        setEstadoActual(data.estado || null);
        setEstadoForm(data.estado || "");
        setFechaTerminoReal(aFechaISO(data.fechaTerminoReal));
        try {
          const mandante = await mandanteService.obtenerPorId(data.mandanteId);
          setMandanteNombre(getMandanteDisplayName(mandante) || data.mandanteId);
          setMandanteLogoUrl(mandante?.logoUrl || null);
        } catch {
          setMandanteNombre(data.mandanteId);
        }
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar el proyecto."))
      .finally(() => setCargandoRegistro(false));
  }, [id, esEdicion]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === "nombre" ? aMayusculas(value) : value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = "El nombre es obligatorio.";
    if (!esEdicion && !contextoMandante.mandanteId) {
      newErrors.mandanteId = "Debe seleccionar un Mandante.";
    }
    if (!formData.fechaInicio) {
      newErrors.fechaInicio = "La fecha de inicio es obligatoria.";
    }
    if (formData.fechaTermino && formData.fechaInicio && formData.fechaTermino < formData.fechaInicio) {
      newErrors.fechaTermino = "No puede ser anterior a la fecha de inicio.";
    }
    const inicioBase = formData.fechaInicioEfectiva || formData.fechaInicio;
    if (formData.fechaTerminoReprogramada && inicioBase && formData.fechaTerminoReprogramada < inicioBase) {
      newErrors.fechaTerminoReprogramada = "No puede ser anterior al inicio.";
    }
    if (formData.observaciones.length > MAX_OBSERVACIONES) {
      newErrors.observaciones = `Máximo ${MAX_OBSERVACIONES} caracteres.`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Expedientes abiertos del Proyecto (se cierran al finalizarlo o archivarlo).
  const pedirConfirmacionCierre = async (tipo) => {
    setServerError(null);
    try {
      const cantidad = await proyectoService.expedientesAbiertos(id);
      setConfirmacionCierre({ tipo, cantidad });
    } catch (err) {
      setServerError(err.message || "No se pudo consultar los expedientes del proyecto.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    // Pasar a "finalizado" cierra los Expedientes del Proyecto: se confirma antes.
    if (esEdicion && estadoForm === "finalizado" && estadoActual !== "finalizado") {
      await pedirConfirmacionCierre("finalizar");
      return;
    }
    await guardar();
  };

  const guardar = async () => {
    setConfirmacionCierre(null);
    setLoading(true);

    // Sin código: lo asigna el backend al crear y no se edita.
    const payload = {
      nombre: formData.nombre.trim(),
      mandanteId: contextoMandante.mandanteId,
      fechaInicio: formData.fechaInicio,
      fechaTermino: formData.fechaTermino || null,
      descripcion: formData.descripcion.trim() || null,
      ubicacion: formData.ubicacion || null,
      tipoProyecto: formData.tipoProyecto || null,
      observaciones: formData.observaciones.trim() || null,
      fechaInicioEfectiva: formData.fechaInicioEfectiva || null,
      fechaTerminoReprogramada: formData.fechaTerminoReprogramada || null,
    };

    try {
      if (esEdicion) {
        delete payload.mandanteId;
        if (proyectoFinalizado) delete payload.fechaTermino;
        // Solo se envía el estado si el usuario lo cambió (la transición la valida el backend).
        if (estadoForm && estadoForm !== estadoActual) payload.estado = estadoForm;
        await proyectoService.actualizar(id, payload);
      } else {
        await proyectoService.crear(payload);
      }
      onGuardado?.();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Eliminación LÓGICA: el proyecto pasa a "archivado" (estado terminal) — no se
  // borra ningún dato, igual que en el resto del sistema.
  const handleEliminar = () => pedirConfirmacionCierre("archivar");

  const archivar = async () => {
    setConfirmacionCierre(null);
    setEliminando(true);
    setServerError(null);
    try {
      await proyectoService.archivar(id);
      onEliminado?.();
    } catch (err) {
      setServerError(err.message || "No se pudo eliminar el proyecto.");
      setEliminando(false);
    }
  };

  if (cargandoRegistro) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-400 text-xs">
        Cargando proyecto...
      </div>
    );
  }

  // Estado del proyecto: "archivado" solo se alcanza con "Eliminar proyecto"; y desde
  // "finalizado" el backend solo admite pasar a "archivado".
  const opcionesEstado = ESTADOS_PROYECTO.filter((e) => e.value !== "archivado" || proyectoArchivado);
  const cronograma = calcularCronograma({
    fechaInicio: formData.fechaInicio,
    fechaInicioEfectiva: formData.fechaInicioEfectiva,
    fechaTermino: formData.fechaTermino,
    fechaTerminoReprogramada: formData.fechaTerminoReprogramada,
    fechaTerminoReal,
  });
  const estadoCronograma = ESTADOS_CRONOGRAMA[cronograma.estado];

  const formulario = (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6 min-w-0">
      {/* Información General */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <FolderKanban className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Información General</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {esEdicion ? (
            <div>
              <label className={CLASE_LABEL}>Mandante *</label>
              <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed flex items-center">
                <MandanteChip nombre={mandanteNombre} logoUrl={mandanteLogoUrl} />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">El Mandante no puede modificarse después de creado.</p>
            </div>
          ) : (
            <div className={sinSelectorMandante ? "md:col-span-2" : ""}>
              <CampoMandante
                contexto={contextoMandante}
                error={errors.mandanteId}
                focoRef={nombreRef}
                onChange={() => setErrors((prev) => ({ ...prev, mandanteId: null }))}
              />
            </div>
          )}

          <div>
            <label className={CLASE_LABEL}>Nombre del proyecto *</label>
            <input
              ref={nombreRef}
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              disabled={!puedeEscribir}
              placeholder="Ej: Mantención Planta Norte"
              className={`${CLASE_INPUT} ${errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
            />
            {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
          </div>

          {/* El código lo asigna el sistema al crear (PRJ-AAAA-NNN); no se edita. */}
          {esEdicion && (
            <div>
              <label className={CLASE_LABEL}>Código</label>
              <input type="text" value={formData.codigo} disabled className={`${CLASE_INPUT} border-gray-200 font-mono`} />
              <p className="text-[11px] text-slate-400 mt-1">Asignado automáticamente al crear el proyecto.</p>
            </div>
          )}

          <div>
            <label className={CLASE_LABEL}>Estado *</label>
            {esEdicion ? (
              <>
                <select
                  value={estadoForm}
                  onChange={(e) => setEstadoForm(e.target.value)}
                  disabled={!puedeEscribir}
                  className={`${CLASE_INPUT} border-gray-200`}
                >
                  {opcionesEstado
                    .filter((e) => !proyectoFinalizado || e.value === "finalizado")
                    .map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                {proyectoFinalizado && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Un proyecto finalizado solo puede pasar a Archivado, con "Eliminar proyecto".
                  </p>
                )}
              </>
            ) : (
              <input type="text" value="Planificado" disabled className={`${CLASE_INPUT} border-gray-200`} />
            )}
          </div>

          <div>
            <label className={CLASE_LABEL}>Fecha de inicio *</label>
            <DateInput
              name="fechaInicio"
              value={formData.fechaInicio}
              onChange={handleChange}
              disabled={!puedeEscribir}
              className={`${CLASE_INPUT} ${errors.fechaInicio ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
            />
            {errors.fechaInicio && <p className="text-xs text-red-500 mt-1">{errors.fechaInicio}</p>}
          </div>

          <div>
            <label className={CLASE_LABEL}>Fecha de término planificada</label>
            <DateInput
              name="fechaTermino"
              value={formData.fechaTermino}
              onChange={handleChange}
              disabled={!puedeEscribir || proyectoFinalizado}
              className={`${CLASE_INPUT} ${errors.fechaTermino ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
            />
            {errors.fechaTermino && <p className="text-xs text-red-500 mt-1">{errors.fechaTermino}</p>}
            {proyectoFinalizado && (
              <p className="text-[11px] text-slate-400 mt-1">No puede modificarse mientras el proyecto esté finalizado.</p>
            )}
          </div>

          <div>
            <label className={CLASE_LABEL}>Ubicación / Región</label>
            <SelectorCatalogo
              name="ubicacion" value={formData.ubicacion} onChange={handleChange}
              opciones={REGIONES_CHILE} disabled={!puedeEscribir} placeholder="Seleccione una región..."
            />
          </div>

          <div>
            <label className={CLASE_LABEL}>Tipo de proyecto</label>
            <SelectorCatalogo
              name="tipoProyecto" value={formData.tipoProyecto} onChange={handleChange}
              opciones={TIPOS_PROYECTO} disabled={!puedeEscribir}
            />
          </div>

          <div className="md:col-span-2">
            <label className={CLASE_LABEL}>Descripción</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              disabled={!puedeEscribir}
              rows={3}
              maxLength={2000}
              placeholder="Describa brevemente el alcance del proyecto."
              className={`${CLASE_INPUT} border-gray-200 resize-none`}
            />
          </div>

          <div className="md:col-span-2">
            <label className={CLASE_LABEL}>Observaciones</label>
            <textarea
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              disabled={!puedeEscribir}
              rows={3}
              maxLength={MAX_OBSERVACIONES}
              className={`${CLASE_INPUT} resize-none ${errors.observaciones ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.observaciones ? <p className="text-xs text-red-500">{errors.observaciones}</p> : <span />}
              <span className="text-[11px] text-slate-400">{formData.observaciones.length}/{MAX_OBSERVACIONES}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fechas y cronograma */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <CalendarRange className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Fechas y cronograma</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={CLASE_LABEL}>Fecha de inicio efectiva</label>
            <DateInput
              name="fechaInicioEfectiva"
              value={formData.fechaInicioEfectiva}
              onChange={handleChange}
              disabled={!puedeEscribir}
              className={`${CLASE_INPUT} border-gray-200`}
            />
          </div>

          <div>
            <label className={CLASE_LABEL}>Fecha de término reprogramada</label>
            <DateInput
              name="fechaTerminoReprogramada"
              value={formData.fechaTerminoReprogramada}
              onChange={handleChange}
              disabled={!puedeEscribir}
              className={`${CLASE_INPUT} ${errors.fechaTerminoReprogramada ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
            />
            {errors.fechaTerminoReprogramada && <p className="text-xs text-red-500 mt-1">{errors.fechaTerminoReprogramada}</p>}
          </div>

          {proyectoFinalizado && (
            <div>
              <label className={CLASE_LABEL}>Fecha de término real</label>
              <DateInput value={fechaTerminoReal} disabled className={`${CLASE_INPUT} border-gray-200`} />
              <p className="text-[11px] text-slate-400 mt-1">Se completó automáticamente al finalizar el proyecto.</p>
            </div>
          )}

          <div>
            <label className={CLASE_LABEL}>Días de duración</label>
            <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600">
              {cronograma.dias === null ? "-" : `${cronograma.dias} día${cronograma.dias === 1 ? "" : "s"}`}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Calculado: del inicio al término vigente, ambos incluidos.</p>
          </div>

          <div>
            <label className={CLASE_LABEL}>Estado del cronograma</label>
            <div className="py-1.5">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${estadoCronograma.className}`}>
                {estadoCronograma.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Calculado con las fechas efectivas o, si faltan, las planificadas.</p>
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
            disabled={loading || (!esEdicion && !contextoMandante.modo) || contextoMandante.modo === "ninguno"}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar Proyecto"}
          </button>
        )}
      </div>
      )}
    </form>
  );

  const claseAccion = "w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-colors";

  return (
    <div className="space-y-6">
      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {proyectoArchivado && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Este proyecto está archivado y ya no puede modificarse.</span>
        </div>
      )}

      {esEdicion ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          {formulario}

          <aside className="space-y-6 min-w-0">
            <EstadoProyectoPanel proyectoId={id} />

            <TarjetaPanel titulo="Acciones Rápidas">
              <div className="space-y-2">
                {!enDetalle && (
                <button
                  type="button"
                  onClick={() => navigate(`/proyectos/${id}`)}
                  className={`${claseAccion} bg-slate-50 hover:bg-slate-100 border-slate-100 text-carbon-dark`}
                >
                  <Eye className="w-4 h-4 text-slate-400" /> Ver detalle del proyecto
                </button>
                )}

                {puedeEscribir && (
                  <button
                    type="button"
                    onClick={handleEliminar}
                    disabled={eliminando}
                    title="Pasa a estado Archivado; no se borra información"
                    className={`${claseAccion} bg-red-50 hover:bg-red-100 border-red-100 text-red-700 disabled:opacity-50`}
                  >
                    <Trash2 className="w-4 h-4" /> {eliminando ? "Eliminando..." : "Eliminar proyecto (lógico)"}
                  </button>
                )}

                {/* Sin alcance definido todavía: visibles pero inertes. */}
                <button type="button" disabled title="Próximamente" className={`${claseAccion} bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed`}>
                  <Copy className="w-4 h-4" /> Duplicar proyecto
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider">Próximamente</span>
                </button>
                <button type="button" disabled title="Próximamente" className={`${claseAccion} bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed`}>
                  <Download className="w-4 h-4" /> Exportar información
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider">Próximamente</span>
                </button>
              </div>
            </TarjetaPanel>
          </aside>
        </div>
      ) : (
        formulario
      )}

      {confirmacionCierre && (
        <ConfirmacionModal
          peligro
          titulo={confirmacionCierre.tipo === "archivar" ? "¿Eliminar este proyecto?" : "¿Finalizar este proyecto?"}
          mensaje={`${confirmacionCierre.tipo === "archivar"
            ? "Pasará a estado Archivado y ya no podrá modificarse. No se borra información."
            : "Un proyecto finalizado solo puede pasar después a Archivado."} ${textoCierreExpedientes(confirmacionCierre.cantidad)}`}
          textoConfirmar={confirmacionCierre.tipo === "archivar" ? "Eliminar proyecto" : "Finalizar proyecto"}
          ocupado={loading || eliminando}
          onCancelar={() => setConfirmacionCierre(null)}
          onConfirmar={confirmacionCierre.tipo === "archivar" ? archivar : guardar}
        />
      )}
    </div>
  );
};
