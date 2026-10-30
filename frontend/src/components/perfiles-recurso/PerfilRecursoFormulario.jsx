import React, { useEffect, useRef, useState } from "react";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { Tags, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { perfilRecursoService } from "../../services/perfilRecursoService";
import { mandanteService } from "../../services/mandanteService";
import { MandanteChip } from "../../components/shared/MandanteChip";
import { OpcionesRadio } from "../shared/OpcionesRadio";
import { OPCIONES_ACTIVO_INACTIVO } from "../../utils/opcionesFormulario";
import { normalizarNombre } from "../../utils/texto";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { CampoMandante } from "../shared/CampoMandante";

const ROLES_ESCRITURA = ["superadmin", "mandante_admin"];

// Etiquetas visibles de la Clasificación. Solo presentación: el valor guardado sigue
// siendo tipo: "persona" | "recurso".
const ETIQUETA_TIPO = { persona: "Persona", recurso: "Maquinaria" };

// Formulario de Perfil de Recurso (crear / editar). Único componente: lo usan la pantalla de
// Perfiles de Recurso (PerfilRecursoFormPage) y el modal del wizard de Nueva Acreditación
// (NuevoPerfilRecursoModal). `inicial` ({ nombre, tipo, mandanteId }) solo precarga al crear:
// es un punto de partida y todos los campos siguen editables, salvo con `fijo`: el alta desde una
// asignación (asistente y modales), donde Mandante y Clasificación vienen dados y son de solo
// lectura, el Estado no se muestra (se crea activo) y el formulario va sin tarjeta, dentro del
// modal. `nombre` identifica la función de la Persona (trabajador, prevencionista, operador) o la
// clasificación de la Maquinaria.
// Nombre ya existente (activo o inactivo) en el Mandante y tipo: al crear se avisa mientras se
// escribe (contra la lista de perfiles del Mandante, cargada una vez) y también si el backend
// responde 409 PERFIL_EXISTENTE. Se ofrece usar el existente, reactivarlo si está inactivo, o
// elegir otro nombre. `onGuardado` recibe { id, nombre, creado } y, en esos casos, `existente` o
// `reactivado` en true (quien lo usa lo asigna igual que uno recién creado).
export const PerfilRecursoFormulario = ({ id = null, inicial = {}, fijo = false, onGuardado, onCancelar }) => {
  const { profile } = useAuth();
  const esEdicion = Boolean(id);
  const esFijo = fijo && !esEdicion && Boolean(inicial.mandanteId);
  // Mandante del perfil nuevo: el dado por la asignación (fijo), el propio del rol, el único
  // disponible o el elegido. Solo en alta.
  const contextoMandante = useMandanteContexto({
    mandanteId: inicial.mandanteId || null, fijo: esFijo, activo: !esEdicion,
  });
  const sinSelectorMandante = contextoMandante.modo !== "seleccionable";
  const puedeEscribir = ROLES_ESCRITURA.includes(profile?.rol);

  const [formData, setFormData] = useState(() => ({
    nombre: id ? "" : inicial.nombre || "",
    tipo: !id && ["persona", "recurso"].includes(inicial.tipo) ? inicial.tipo : "persona",
    descripcion: "",
    estado: "activo",
    mandanteId: "",
  }));

  const [mandanteNombre, setMandanteNombre] = useState("");
  const [mandanteLogoUrl, setMandanteLogoUrl] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [cargandoRegistro, setCargandoRegistro] = useState(esEdicion);
  const [serverError, setServerError] = useState(null);
  const nombreRef = useRef(null);
  // Perfiles del Mandante (activos e inactivos), para avisar un nombre repetido sin consultar por
  // cada tecla, y perfil con el mismo nombre que lo escrito (o el que informó el backend).
  const [perfilesMandante, setPerfilesMandante] = useState([]);
  const [coincidencia, setCoincidencia] = useState(null);
  const [reactivando, setReactivando] = useState(false);

  const mandanteDelPerfil = contextoMandante.mandanteId;
  useEffect(() => {
    if (esEdicion || !mandanteDelPerfil) return undefined;
    let vigente = true;
    perfilRecursoService.listar({ mandanteId: mandanteDelPerfil, incluirConteo: true })
      .then((data) => { if (vigente) setPerfilesMandante(data || []); })
      .catch(() => { if (vigente) setPerfilesMandante([]); });
    return () => { vigente = false; };
  }, [esEdicion, mandanteDelPerfil]);

  // Aviso anticipado, con una pausa breve tras la última tecla.
  useEffect(() => {
    if (esEdicion) return undefined;
    const temporizador = setTimeout(() => {
      const clave = normalizarNombre(formData.nombre);
      const iguales = clave ? perfilesMandante.filter((p) =>
        p.mandanteId === mandanteDelPerfil && p.tipo === formData.tipo && normalizarNombre(p.nombre) === clave) : [];
      setCoincidencia(iguales.find((p) => p.estado === "activo") || iguales[0] || null);
    }, 300);
    return () => clearTimeout(temporizador);
  }, [esEdicion, formData.nombre, formData.tipo, perfilesMandante, mandanteDelPerfil]);

  const perfilesInactivos = esEdicion ? [] : perfilesMandante.filter((p) =>
    p.mandanteId === mandanteDelPerfil && p.tipo === formData.tipo && p.estado !== "activo");

  // Usar un perfil que ya existe, en vez de crear otro con el mismo nombre.
  const usarExistente = (perfil) => onGuardado({ id: perfil.id, nombre: perfil.nombre, creado: false, existente: true });
  const reactivarYUsar = async (perfil) => {
    setReactivando(true);
    setServerError(null);
    try {
      await perfilRecursoService.actualizar(perfil.id, { estado: "activo" });
      onGuardado({ id: perfil.id, nombre: perfil.nombre, creado: false, reactivado: true });
    } catch (err) {
      setServerError(err.message || "No se pudo activar el perfil.");
    } finally {
      setReactivando(false);
    }
  };
  const usarOtroNombre = () => {
    setFormData((prev) => ({ ...prev, nombre: "" }));
    setCoincidencia(null);
    nombreRef.current?.focus();
  };

  useEffect(() => {
    if (!esEdicion) return;
    perfilRecursoService
      .obtenerPorId(id)
      .then(async (data) => {
        setFormData({
          nombre: data.nombre || "",
          tipo: data.tipo || "persona",
          descripcion: data.descripcion || "",
          estado: data.estado || "activo",
          mandanteId: data.mandanteId || "",
        });
        try {
          const mandante = await mandanteService.obtenerPorId(data.mandanteId);
          setMandanteNombre(getMandanteDisplayName(mandante) || data.mandanteId);
          setMandanteLogoUrl(mandante?.logoUrl || null);
        } catch {
          setMandanteNombre(data.mandanteId);
        }
      })
      .catch((err) => setServerError(err.message || "No se pudo cargar el perfil."))
      .finally(() => setCargandoRegistro(false));
  }, [id, esEdicion]);

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
    if (!esEdicion && !contextoMandante.mandanteId) {
      newErrors.mandanteId = "Debe seleccionar un Mandante.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Dentro de otro modal con formulario (Cambiar Proyecto), el submit no debe llegar al de afuera.
    e.stopPropagation();
    setServerError(null);
    if (!validateForm()) return;
    if (!esEdicion && coincidencia) return;
    setLoading(true);

    const payload = {
      nombre: formData.nombre.trim(),
      tipo: formData.tipo,
      descripcion: formData.descripcion.trim() || null,
      estado: formData.estado,
      mandanteId: contextoMandante.mandanteId,
    };

    try {
      if (esEdicion) {
        // tipo y mandanteId son inmutables después de creado — no se
        // reenvían en la edición para no depender de que el backend los
        // ignore silenciosamente (ambos quedan fuera de allowedFields en
        // perfilRecursoService.actualizarPerfil de todas formas).
        delete payload.tipo;
        delete payload.mandanteId;
        await perfilRecursoService.actualizar(id, payload);
        onGuardado({ id, creado: false });
      } else {
        const creado = await perfilRecursoService.crear(payload);
        onGuardado({ id: creado?.id || null, creado: true, nombre: payload.nombre });
      }
    } catch (err) {
      if (err.codigo === "PERFIL_EXISTENTE" && err.detalle?.perfil) {
        // Mismo bloque del aviso anticipado, en vez del error genérico.
        setCoincidencia({
          ...err.detalle.perfil, cantidadRequerimientos: err.detalle.cantidadRequerimientos || 0,
        });
      } else {
        setServerError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Sin selector de Mandante (alta), el Estado sube junto a la Clasificación y el Nombre ocupa la
  // fila completa, para que no quede un hueco donde iba el selector.
  const estadoAntesDelNombre = !esEdicion && !esFijo && sinSelectorMandante;
  const campoEstado = esFijo ? null : (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Estado</label>
      <OpcionesRadio
        name="estado"
        value={formData.estado}
        onChange={handleChange}
        disabled={!puedeEscribir}
        opciones={OPCIONES_ACTIVO_INACTIVO}
        ariaLabel="Estado"
      />
    </div>
  );

  if (cargandoRegistro) {
    return (
      <div className="py-16 text-center text-slate-400 text-xs">
        Cargando perfil de recurso...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {serverError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className={esFijo ? "space-y-4" : "bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4"}>
          {!esFijo && (
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Tags className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Datos del Perfil</h3>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {esEdicion ? (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Mandante *</label>
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
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Clasificación *</label>
              {esEdicion || esFijo ? (
                <>
                  <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed">
                    {ETIQUETA_TIPO[formData.tipo] || formData.tipo}
                  </div>
                  {esEdicion && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      No puede modificarse después de creado (para no romper referencias existentes en Asignaciones/Recursos).
                    </p>
                  )}
                </>
              ) : (
                <OpcionesRadio
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleChange}
                  opciones={[
                    { value: "persona", label: ETIQUETA_TIPO.persona },
                    { value: "recurso", label: ETIQUETA_TIPO.recurso },
                  ]}
                  ariaLabel="Clasificación"
                />
              )}
            </div>

            {estadoAntesDelNombre && campoEstado}

            <div className={estadoAntesDelNombre ? "md:col-span-2" : ""}>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Nombre *
              </label>
              <input
                ref={nombreRef}
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                disabled={!puedeEscribir}
                placeholder="Ej: Operador, Grúa"
                className={`w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed ${
                  errors.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {errors.nombre && <p className="text-xs text-red-500 mt-1">{errors.nombre}</p>}
              {coincidencia && (
                <div role="alert" className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <p className="text-xs font-semibold text-amber-800">
                    {coincidencia.estado === "activo"
                      ? <>El perfil &apos;{coincidencia.nombre}&apos; ya existe</>
                      : <>El perfil &apos;{coincidencia.nombre}&apos; ya existe y está inactivo. Se activará para volver a usarlo.</>}
                  </p>
                  {coincidencia.estado !== "activo" && coincidencia.cantidadRequerimientos > 0 && (
                    <p className="text-[11px] text-amber-700">
                      Tiene {coincidencia.cantidadRequerimientos} {coincidencia.cantidadRequerimientos === 1 ? "requerimiento vinculado" : "requerimientos vinculados"} que volverán a aplicar.
                    </p>
                  )}
                  {coincidencia.estado !== "activo" && !puedeEscribir && (
                    <p className="text-[11px] text-amber-700">Pide a un administrador que lo active.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {coincidencia.estado === "activo" ? (
                      <button
                        type="button" onClick={() => usarExistente(coincidencia)}
                        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-white text-[11px] font-bold"
                      >
                        {esFijo ? "Usar este perfil" : "Ver en el listado"}
                      </button>
                    ) : puedeEscribir && (
                      <button
                        type="button" onClick={() => reactivarYUsar(coincidencia)} disabled={reactivando}
                        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-white text-[11px] font-bold disabled:opacity-50"
                      >
                        {reactivando ? "Activando..." : esFijo ? "Activar y usar" : "Activar"}
                      </button>
                    )}
                    <button
                      type="button" onClick={usarOtroNombre} disabled={reactivando}
                      className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-50"
                    >
                      Usar otro nombre
                    </button>
                  </div>
                </div>
              )}
              {!coincidencia && puedeEscribir && perfilesInactivos.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400">Perfiles inactivos:</span>
                  {perfilesInactivos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={reactivando}
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, nombre: p.nombre }));
                        setCoincidencia(p);
                      }}
                      title={`Usar el nombre '${p.nombre}' (se pedirá confirmar su activación)`}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-dashed border-slate-300 bg-white text-slate-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!estadoAntesDelNombre && campoEstado}

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Descripción</label>
              <textarea
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                disabled={!puedeEscribir}
                rows={3}
                placeholder="Descripción opcional del perfil de recurso..."
                className="w-full px-3.5 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Acciones */}
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
              disabled={loading || reactivando || (!esEdicion && Boolean(coincidencia)) ||
                (!esEdicion && !contextoMandante.modo) || contextoMandante.modo === "ninguno"}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar Perfil"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
