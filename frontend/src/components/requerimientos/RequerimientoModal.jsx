import { useEffect, useRef, useState } from "react";
import { X, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { requerimientoService, etiquetaTipoEntidad, NOMBRE_CORTO_MAX } from "../../services/requerimientoService";
import { AplicaAPills } from "./AplicaAPills";
import { CrearPerfilRecurso } from "../perfiles-recurso/CrearPerfilRecurso";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { OpcionesRadio } from "../shared/OpcionesRadio";
import { OPCIONES_ACTIVO_INACTIVO } from "../../utils/opcionesFormulario";
import { ordenarPerfilesParticipacion } from "../../utils/ordenPerfiles";
import { Tabs } from "../shared/Tabs";
import { ReglasIARequerimiento } from "./reglas-ia/ReglasIARequerimiento";
import { CoberturaMapeoRequerimiento } from "./reglas-ia/UbicacionMapeo";

const CLASE_INPUT = "w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all";
const CLASE_LABEL = "block text-xs font-semibold text-gray-700 mb-1.5";
const ETIQUETA_PLURAL = { persona: "persona", recurso: "maquinaria" };

const DATOS_VACIOS = {
  nombre: "", nombreCorto: "", descripcion: "", requiereVencimiento: false, esDocumentoIdentidad: false,
};

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordenados = (ids) => (Array.isArray(ids) ? [...ids].sort() : ids);

// Modal "Nuevo requerimiento" / "Editar requerimiento" del catálogo. El Mandante y el tipo de
// entidad vienen del catálogo y no se cambian aquí. Guarda el Requerimiento junto con su
// aplicabilidad en una sola llamada (requerimientoService.crear / actualizar): el backend lo
// escribe todo en una transacción.
//  - `perfilesParticipacion` / `perfilesRecurso`: [{ id, nombre }] elegibles (los de Recurso, ya
//    del tipo de entidad).
//  - `requerimiento`: el que se edita (con `aplicabilidad`), o null para crear.
//  - `preseleccion`: { perfilParticipacionIds, perfilRecursoIds } marcados en los chips del catálogo.
//  - `onGuardado(requerimiento)`: tras cada guardado (el catálogo recarga su listado).
//  - `onPerfilRecursoCreado()`: se creó un Perfil de Recurso desde el estado vacío.
//  - `mostrarReglasIA`: pestaña "Reglas IA" al editar (solo superadmin). Sus cambios se guardan al
//    momento, aparte del formulario.
// La ubicación ya no se edita aquí (E5): Empresa muestra su cobertura en el mapeo documental y
// Persona/Maquinaria se ubican por patrón aprendido («Recordar» en el panel de evaluación).
export const RequerimientoModal = ({
  mandante, tipoEntidad, perfilesParticipacion, perfilesRecurso, requerimiento = null,
  preseleccion = {}, onGuardado, onCerrar, onPerfilRecursoCreado, mostrarReglasIA = false, pestanaInicial = "datos",
}) => {
  const esEdicion = Boolean(requerimiento);
  const esEmpresa = tipoEntidad === "empresa";
  const nombreRef = useRef(null);

  const contextoInicial = () => (esEdicion ? {
    perfilParticipacionIds: requerimiento.aplicabilidad?.perfilParticipacionIds || [],
    // null = "Todos"; arreglo = perfiles específicos.
    perfilRecursoIds: esEmpresa ? null : (requerimiento.aplicabilidad?.perfilRecursoIds ?? null),
  } : {
    perfilParticipacionIds: preseleccion.perfilParticipacionIds || [],
    // "Todos" por defecto, salvo lo preseleccionado en el catálogo.
    perfilRecursoIds: esEmpresa ? null
      : (preseleccion.perfilRecursoIds?.length ? preseleccion.perfilRecursoIds : null),
  });
  const datosIniciales = () => (esEdicion ? {
    nombre: requerimiento.nombre || "",
    nombreCorto: requerimiento.nombreCorto || "",
    descripcion: requerimiento.descripcion || "",
    requiereVencimiento: Boolean(requerimiento.requiereVencimiento),
    esDocumentoIdentidad: Boolean(requerimiento.esDocumentoIdentidad),
  } : DATOS_VACIOS);

  const [contexto, setContexto] = useState(contextoInicial);
  const [datos, setDatos] = useState(datosIniciales);
  const [estado, setEstado] = useState(requerimiento?.estado || "activo");
  // Foto de lo último guardado (o de la apertura): base del aviso de cambios sin guardar.
  const [foto, setFoto] = useState(() => ({ contexto: contextoInicial(), datos: datosIniciales(), estado: requerimiento?.estado || "activo" }));
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const conReglasIA = esEdicion && mostrarReglasIA;
  const [pestana, setPestana] = useState(pestanaInicial === "reglas" && esEdicion && mostrarReglasIA ? "reglas" : "datos");
  // Al cerrar tras usar "Reglas IA", el listado recarga (badge de estado IA).
  const [tocoReglas, setTocoReglas] = useState(false);
  const cerrar = () => {
    if (tocoReglas) onGuardado?.(requerimiento);
    onCerrar();
  };

  const hayCambios = !iguales(
    { contexto: { ...contexto, perfilRecursoIds: ordenados(contexto.perfilRecursoIds), perfilParticipacionIds: ordenados(contexto.perfilParticipacionIds) }, datos, estado },
    { contexto: { ...foto.contexto, perfilRecursoIds: ordenados(foto.contexto.perfilRecursoIds), perfilParticipacionIds: ordenados(foto.contexto.perfilParticipacionIds) }, datos: foto.datos, estado: foto.estado },
  );
  const cambioAplicabilidad = esEdicion && (
    !iguales(ordenados(contexto.perfilParticipacionIds), ordenados(foto.contexto.perfilParticipacionIds)) ||
    !iguales(ordenados(contexto.perfilRecursoIds), ordenados(foto.contexto.perfilRecursoIds))
  );

  const pedirCierre = () => {
    if (guardando) return;
    if (hayCambios) setConfirmarDescarte(true);
    else cerrar();
  };

  // Escape cierra (pidiendo confirmación si hay cambios). No actúa si hay otro modal encima.
  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key !== "Escape" || confirmarDescarte) return;
      if (document.querySelector('[aria-label="Nuevo Perfil de Recurso"]')) return;
      // Modales de "Reglas IA" abiertos encima (agregar, copiar, probar…).
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      pedirCierre();
    };
    document.addEventListener("keydown", alPresionar);
    return () => document.removeEventListener("keydown", alPresionar);
  });

  useEffect(() => {
    nombreRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const temporizador = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(temporizador);
  }, [toast]);

  const cambiarDato = (e) => {
    const { name, value, type, checked } = e.target;
    setDatos((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (errores[name]) setErrores((prev) => ({ ...prev, [name]: null }));
  };

  const alternarPerfilParticipacion = (id) => {
    setContexto((prev) => ({
      ...prev,
      perfilParticipacionIds: prev.perfilParticipacionIds.includes(id)
        ? prev.perfilParticipacionIds.filter((x) => x !== id) : [...prev.perfilParticipacionIds, id],
    }));
    setErrores((prev) => ({ ...prev, perfilParticipacionIds: null }));
  };

  const combinaciones = contexto.perfilParticipacionIds.length * (
    esEmpresa || contexto.perfilRecursoIds === null ? 1 : (contexto.perfilRecursoIds?.length || 0)
  );

  const validar = () => {
    const nuevos = {};
    if (!datos.nombre.trim()) nuevos.nombre = "El nombre es obligatorio.";
    const corto = datos.nombreCorto.trim();
    if (!corto) nuevos.nombreCorto = "El nombre corto es obligatorio.";
    else if (corto.length > NOMBRE_CORTO_MAX) nuevos.nombreCorto = `Máximo ${NOMBRE_CORTO_MAX} caracteres.`;
    if (contexto.perfilParticipacionIds.length === 0) {
      nuevos.perfilParticipacionIds = "Seleccione al menos un Perfil de Participación.";
    }
    if (!esEmpresa && contexto.perfilRecursoIds === undefined) {
      nuevos.perfilRecursoIds = "Elija \"Todos\" o al menos un perfil.";
    }
    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  };

  const guardar = async (continuar) => {
    if (guardando) return;
    setErrorServidor(null);
    if (!validar()) return;
    setGuardando(true);
    const payload = {
      nombre: datos.nombre.trim(),
      nombreCorto: datos.nombreCorto.trim(),
      descripcion: datos.descripcion.trim() || null,
      requiereVencimiento: datos.requiereVencimiento,
      esDocumentoIdentidad: tipoEntidad === "persona" && datos.esDocumentoIdentidad,
      aplicabilidad: {
        perfilParticipacionIds: contexto.perfilParticipacionIds,
        perfilRecursoIds: esEmpresa ? null : contexto.perfilRecursoIds,
      },
    };
    try {
      const guardado = esEdicion
        ? await requerimientoService.actualizar(requerimiento.id, { ...payload, estado })
        : await requerimientoService.crear({ ...payload, mandanteId: mandante.id, tipoEntidad });
      onGuardado?.(guardado);
      if (continuar) {
        // Mantiene el tipo y los perfiles; limpia los datos y vuelve al Nombre.
        setToast(`Requerimiento ${payload.nombreCorto} guardado`);
        setDatos(DATOS_VACIOS);
        setFoto({ contexto, datos: DATOS_VACIOS, estado: "activo" });
        setErrores({});
        nombreRef.current?.focus();
      } else {
        cerrar();
      }
    } catch (err) {
      // Lo escrito se conserva; el error se muestra en el modal.
      setErrorServidor(err.message || "No se pudo guardar el requerimiento.");
    } finally {
      setGuardando(false);
    }
  };

  const alEnviar = (e) => {
    e.preventDefault();
    guardar(!esEdicion);
  };

  const clasePill = (activo) => `px-3 py-1.5 text-[11px] rounded-full font-semibold border transition-colors disabled:opacity-60 ${
    activo ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={pedirCierre}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="requerimiento-modal-titulo"
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h3 id="requerimiento-modal-titulo" className="text-sm font-bold text-carbon-dark uppercase tracking-wider">
              {esEdicion ? "Editar requerimiento" : "Nuevo requerimiento"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Mandante: <span className="font-semibold text-carbon-dark">{mandante.nombre}</span></p>
          </div>
          <button type="button" onClick={pedirCierre} aria-label="Cerrar" disabled={guardando} className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        {conReglasIA && (
          <div className="px-5">
            <Tabs tabs={[{ key: "datos", label: "Datos" }, { key: "reglas", label: "Reglas IA" }]} active={pestana}
              onChange={(k) => { setPestana(k); if (k === "reglas") setTocoReglas(true); }} />
          </div>
        )}
        {pestana === "reglas" && conReglasIA ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            <ReglasIARequerimiento requerimientoId={requerimiento.id}
              ubicacion={tipoEntidad === "empresa" ? (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                  <p className="text-xs font-bold text-carbon-dark">Ubicación en el mapeo documental</p>
                  <CoberturaMapeoRequerimiento mandanteId={mandante.id} requerimientoId={requerimiento.id} />
                </div>
              ) : null} />
          </div>
        ) : (
        <form onSubmit={alEnviar} className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {toast && (
            <div role="status" className="flex items-center gap-2 p-3 rounded-xl bg-sage-lighter border border-sage-light text-sage-darker text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> {toast}
            </div>
          )}
          {errorServidor && (
            <div role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" /> <span>{errorServidor}</span>
            </div>
          )}

          {/* Contexto: tipo de entidad y aplicabilidad */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
            <div>
              <label className={CLASE_LABEL}>Tipo de entidad</label>
              <div className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed">
                {etiquetaTipoEntidad(tipoEntidad)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Heredado de la pestaña seleccionada</p>
            </div>

            {/* Empresa: dónde está ubicado en las carpetas mapeadas (Mapeo documental). Personas y
                maquinarias: por patrón aprendido (E5). */}
            {tipoEntidad === "empresa" ? (
              <div>
                <label className={CLASE_LABEL}>Ubicación en el mapeo documental</label>
                {requerimiento?.id
                  ? <CoberturaMapeoRequerimiento mandanteId={mandante.id} requerimientoId={requerimiento.id} />
                  : <p className="text-[11px] text-slate-400">Se verá al ubicarlo en Configuración › Inteligencia Artificial › Mapeo documental.</p>}
              </div>
            ) : (
              <div>
                <label className={CLASE_LABEL}>Ubicación del documento</label>
                <p className="text-[11px] text-slate-500">
                  En la carpeta de cada {tipoEntidad === "persona" ? "persona" : "maquinaria"}, el archivo se ubica por patrón aprendido:
                  al elegirlo en el panel de evaluación, «Recordar» hace que la próxima vez (y en la revisión en lote) se ubique solo.
                </p>
              </div>
            )}

            <div>
              <label className={CLASE_LABEL}>Perfiles de Participación a los que aplica *</label>
              {perfilesParticipacion.length === 0 ? (
                <p className="text-[11px] text-amber-700">Este Mandante no tiene Perfiles de Participación activos.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ordenarPerfilesParticipacion(perfilesParticipacion).map((p) => {
                    const activo = contexto.perfilParticipacionIds.includes(p.id);
                    return (
                      <button
                        key={p.id} type="button" aria-pressed={activo} disabled={guardando}
                        onClick={() => alternarPerfilParticipacion(p.id)} className={clasePill(activo)}
                      >
                        {p.nombre}
                      </button>
                    );
                  })}
                </div>
              )}
              {errores.perfilParticipacionIds && <p className="text-xs text-red-500 mt-1">{errores.perfilParticipacionIds}</p>}
            </div>

            {!esEmpresa && (
              <div>
                <label className={CLASE_LABEL}>Perfiles de {ETIQUETA_PLURAL[tipoEntidad]} a los que aplica *</label>
                {perfilesRecurso.length === 0 ? (
                  <CrearPerfilRecurso tipo={tipoEntidad} mandanteId={mandante.id} onCreado={onPerfilRecursoCreado} />
                ) : (
                  <AplicaAPills
                    permiteVacio
                    perfiles={perfilesRecurso}
                    valor={contexto.perfilRecursoIds}
                    disabled={guardando}
                    onChange={(valor) => {
                      setContexto((prev) => ({ ...prev, perfilRecursoIds: valor }));
                      setErrores((prev) => ({ ...prev, perfilRecursoIds: null }));
                    }}
                  />
                )}
                {errores.perfilRecursoIds && <p className="text-xs text-red-500 mt-1">{errores.perfilRecursoIds}</p>}
              </div>
            )}

            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {combinaciones === 1
                ? "Se creará 1 combinación de aplicabilidad"
                : `Se crearán ${combinaciones} combinaciones de aplicabilidad`}
            </p>
            {cambioAplicabilidad && (
              <p className="text-[11px] text-amber-700">
                Los expedientes abiertos de estos perfiles se actualizarán; los cerrados y las evaluaciones existentes no cambian.
              </p>
            )}
          </div>

          {/* Datos */}
          <div className="space-y-4">
            <div>
              <label htmlFor="req-nombre" className={CLASE_LABEL}>Nombre del requerimiento *</label>
              <input
                id="req-nombre" ref={nombreRef} type="text" name="nombre" value={datos.nombre} onChange={cambiarDato}
                maxLength={200}
                className={`${CLASE_INPUT} ${errores.nombre ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
              />
              {errores.nombre && <p className="text-xs text-red-500 mt-1">{errores.nombre}</p>}
            </div>

            <div>
              <label htmlFor="req-nombre-corto" className={CLASE_LABEL}>Nombre corto *</label>
              <input
                id="req-nombre-corto" type="text" name="nombreCorto" value={datos.nombreCorto} onChange={cambiarDato}
                maxLength={NOMBRE_CORTO_MAX}
                className={`${CLASE_INPUT} ${errores.nombreCorto ? "border-red-400 bg-red-50/30" : "border-gray-200"}`}
              />
              <div className="flex items-center justify-between mt-1">
                {errores.nombreCorto
                  ? <p className="text-xs text-red-500">{errores.nombreCorto}</p>
                  : <p className="text-[11px] text-slate-400">Se usa en gráficos y reportes</p>}
                <p className="text-[11px] text-slate-400">{datos.nombreCorto.length}/{NOMBRE_CORTO_MAX}</p>
              </div>
            </div>

            <div>
              <label htmlFor="req-descripcion" className={CLASE_LABEL}>Descripción</label>
              <textarea
                id="req-descripcion" name="descripcion" value={datos.descripcion} onChange={cambiarDato} rows={3} maxLength={2000}
                placeholder="Contenido o condiciones que debe cumplir el documento…"
                className={`${CLASE_INPUT} border-gray-200 resize-none`}
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox" name="requiereVencimiento" checked={datos.requiereVencimiento} onChange={cambiarDato}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
              />
              <span>
                <span className="block text-xs font-semibold text-gray-700">Este documento tiene vencimiento</span>
                <span className="block text-[11px] text-slate-400">La fecha se registra en cada documento presentado</span>
              </span>
            </label>

            {tipoEntidad === "persona" && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox" name="esDocumentoIdentidad" checked={datos.esDocumentoIdentidad} onChange={cambiarDato}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                />
                <span>
                  <span className="block text-xs font-semibold text-gray-700">Es documento de identidad</span>
                  <span className="block text-[11px] text-slate-400">
                    Sus archivos se eliminan, tras el periodo de gracia, cuando la persona es anonimizada
                  </span>
                </span>
              </label>
            )}


            {esEdicion && (
              <div>
                <label className={CLASE_LABEL}>Estado</label>
                <OpcionesRadio
                  name="estado-requerimiento" value={estado} onChange={(e) => setEstado(e.target.value)}
                  opciones={OPCIONES_ACTIVO_INACTIVO} ariaLabel="Estado" disabled={guardando}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 flex-wrap pt-2 border-t border-slate-100">
            <button
              type="button" onClick={pedirCierre} disabled={guardando}
              className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            {esEdicion ? (
              <button
                type="submit" disabled={guardando}
                className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
            ) : (
              <>
                <button
                  type="button" onClick={() => guardar(false)} disabled={guardando}
                  className="px-4 py-2 text-xs font-semibold text-primary bg-primary-lighter border border-primary/20 hover:bg-primary/10 rounded-xl transition-all disabled:opacity-50"
                >
                  Guardar y cerrar
                </button>
                <button
                  type="submit" disabled={guardando}
                  className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : "Guardar y continuar"}
                </button>
              </>
            )}
          </div>
        </form>
        )}
      </div>

      {confirmarDescarte && (
        <ConfirmacionModal
          peligro
          titulo="¿Descartar los cambios?"
          mensaje="Hay cambios sin guardar en este requerimiento. Si cierra ahora, se perderán."
          textoConfirmar="Descartar"
          textoCancelar="Seguir editando"
          onCancelar={() => setConfirmarDescarte(false)}
          onConfirmar={cerrar}
        />
      )}
    </div>
  );
};
