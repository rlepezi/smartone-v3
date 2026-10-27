import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, FileQuestion, IdCard, Pencil } from "lucide-react";
import { tipoDocumentalService } from "../../services/tipoDocumentalService";
import { configuracionIAService } from "../../services/configuracionIAService";
import { ErrorBanner } from "../shared/ErrorBanner";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { formatFecha } from "../../utils/fechas";
import { Tarjeta } from "./Tarjeta";
import { CLASE_INPUT, CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO, formatUsd } from "./estilos";

const ESTADO_IA = {
  no_normalizado: { label: "No normalizado", clase: "bg-slate-100 text-slate-500 border-slate-200" },
  piloto: { label: "Piloto", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  activo: { label: "Activo", clase: "bg-sage-lighter text-sage-darker border-sage-light" },
};
const MODO = { manual: "Manual", asistido: "Asistido", automatico: "Automático" };
const CLASE_BADGE = "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";

// Modal de edición de un tipo (estado IA, modelo preferido, umbral de legibilidad).
const EditarTipoModal = ({ tipo, modelos, onGuardado, onCancelar }) => {
  const [datos, setDatos] = useState({
    estadoIA: tipo.estadoIA || "piloto",
    modeloPreferido: tipo.modeloPreferido || "",
    umbralLegibilidad: String(tipo.umbralLegibilidad ?? 0.8),
  });
  const [confirmarActivo, setConfirmarActivo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const umbral = Number(String(datos.umbralLegibilidad).replace(",", "."));
  const umbralValido = umbral >= 0.5 && umbral <= 1;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onGuardado(await tipoDocumentalService.actualizar(tipo.id, {
        estadoIA: datos.estadoIA, modeloPreferido: datos.modeloPreferido || null, umbralLegibilidad: umbral,
      }));
    } catch (err) {
      setError(err.message || "No se pudo guardar el tipo documental.");
      setGuardando(false);
      setConfirmarActivo(false);
    }
  };

  const alEnviar = (e) => {
    e.preventDefault();
    if (!umbralValido) return;
    if (datos.estadoIA === "activo" && tipo.estadoIA !== "activo") setConfirmarActivo(true);
    else guardar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !guardando && onCancelar()}>
      <form role="dialog" aria-modal="true" aria-labelledby="editar-tipo-titulo" onSubmit={alEnviar} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-6 space-y-4">
        <h3 id="editar-tipo-titulo" className="text-sm font-bold text-carbon-dark">Editar {tipo.nombre}</h3>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <label className="block">
          <span className={CLASE_LABEL}>Estado IA</span>
          <select value={datos.estadoIA} onChange={(e) => setDatos((d) => ({ ...d, estadoIA: e.target.value }))} className={CLASE_INPUT}>
            {Object.entries(ESTADO_IA).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={CLASE_LABEL}>Modelo preferido</span>
          <select value={datos.modeloPreferido} onChange={(e) => setDatos((d) => ({ ...d, modeloPreferido: e.target.value }))} className={CLASE_INPUT}>
            <option value="">Usar modelo por defecto</option>
            {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
            {datos.modeloPreferido && !modelos.includes(datos.modeloPreferido) && <option value={datos.modeloPreferido}>{datos.modeloPreferido} (sin precios)</option>}
          </select>
        </label>
        <label className="block">
          <span className={CLASE_LABEL}>Umbral de legibilidad (0,5 a 1,0)</span>
          <input type="number" min="0.5" max="1" step="0.05" value={datos.umbralLegibilidad} onChange={(e) => setDatos((d) => ({ ...d, umbralLegibilidad: e.target.value }))} className={CLASE_INPUT} />
          {!umbralValido && <span className="block text-[11px] text-red-500 mt-1">Debe estar entre 0,5 y 1,0.</span>}
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={guardando} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="submit" disabled={guardando || !umbralValido} className={CLASE_PRIMARIO}>{guardando ? "Guardando..." : "Guardar"}</button>
        </div>
        {confirmarActivo && (
          <ConfirmacionModal
            titulo="Activar el tipo documental"
            mensaje="Los requerimientos de este tipo podrán usar modo automático."
            textoConfirmar="Activar"
            ocupado={guardando}
            onConfirmar={guardar}
            onCancelar={() => setConfirmarActivo(false)}
          />
        )}
      </form>
    </div>
  );
};

// Pestaña "Tipos documentales" (superadmin): tipos con métricas, requerimientos que los usan,
// edición y los tipos por normalizar (documentos clasificados como OTRO).
export const TabTipos = () => {
  const [tipos, setTipos] = useState(null);
  const [porNormalizar, setPorNormalizar] = useState(null);
  const [modelos, setModelos] = useState([]);
  const [error, setError] = useState(null);
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [editando, setEditando] = useState(null);
  const [desactivando, setDesactivando] = useState(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  // Habilitar es directo; deshabilitar pide confirmación (afecta a las plantillas).
  const cambiarEstado = async (tipo, estado) => {
    setCambiandoEstado(true);
    setError(null);
    try {
      const actualizado = await tipoDocumentalService.cambiarEstado(tipo.id, estado);
      setTipos((lista) => lista.map((t) => (t.id === actualizado.id ? { ...t, ...actualizado } : t)));
      setDesactivando(null);
    } catch (err) {
      setError(err.message || "No se pudo cambiar el estado del tipo documental.");
    } finally {
      setCambiandoEstado(false);
    }
  };

  useEffect(() => {
    let vigente = true;
    Promise.all([tipoDocumentalService.listar(), tipoDocumentalService.porNormalizar(), configuracionIAService.obtener()])
      .then(([lista, otros, config]) => {
        if (!vigente) return;
        setTipos(lista || []);
        setPorNormalizar(otros);
        setModelos(Object.keys(config.preciosPorModelo || {}));
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudieron cargar los tipos documentales."); });
    return () => { vigente = false; };
  }, []);

  const alternar = (id) => setAbiertos((actual) => {
    const nuevo = new Set(actual);
    if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
    return nuevo;
  });

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      <Tarjeta titulo="Tipos documentales" Icono={IdCard}>
        {!tipos ? (
          <div className="h-32 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
        ) : tipos.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">Aún no hay tipos documentales cargados. Se crean con el script de seed del módulo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-3 py-2.5">Habilitado</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Requerimientos</span></th>
                  <th className="px-3 py-2.5">Nombre</th>
                  <th className="px-3 py-2.5">Código</th>
                  <th className="px-3 py-2.5">Estado IA</th>
                  <th className="px-3 py-2.5 text-right">Versión</th>
                  <th className="px-3 py-2.5">Modelo preferido</th>
                  <th className="px-3 py-2.5 text-right">Umbral</th>
                  <th className="px-3 py-2.5 text-right">Procesados</th>
                  <th className="px-3 py-2.5 text-right">Concordancia</th>
                  <th className="px-3 py-2.5 text-right">Costo prom.</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Editar</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tipos.map((t) => {
                  const estadoIA = ESTADO_IA[t.estadoIA] || ESTADO_IA.no_normalizado;
                  const abierto = abiertos.has(t.id);
                  const Flecha = abierto ? ChevronDown : ChevronRight;
                  return (
                    <Fragment key={t.id}>
                      <tr className={t.estado === "activo" ? "" : "opacity-50"}>
                        <td className="px-3 py-2.5">
                          <button
                            type="button" role="switch" aria-checked={t.estado === "activo"} aria-label={`Habilitar ${t.nombre}`}
                            disabled={cambiandoEstado}
                            onClick={() => (t.estado === "activo" ? setDesactivando(t) : cambiarEstado(t, "activo"))}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 ${t.estado === "activo" ? "bg-primary" : "bg-slate-300"}`}
                          >
                            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${t.estado === "activo" ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <button type="button" onClick={() => alternar(t.id)} aria-expanded={abierto} aria-label={`Requerimientos de ${t.nombre}`} className="p-1 rounded text-slate-400 hover:text-carbon-dark">
                            <Flecha className="w-4 h-4" />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-carbon-dark">{t.nombre}</td>
                        <td className="px-3 py-2.5 font-mono text-slate-500">{t.codigo}</td>
                        <td className="px-3 py-2.5"><span className={`${CLASE_BADGE} ${estadoIA.clase}`}>{estadoIA.label}</span></td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{t.version}</td>
                        <td className="px-3 py-2.5 text-slate-600">{t.modeloPreferido || <span className="text-slate-400">por defecto</span>}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{t.umbralLegibilidad}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{t.metricas?.procesados || 0}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-carbon-dark">{t.concordancia === null || t.concordancia === undefined ? "—" : `${t.concordancia}%`}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{t.costoPromedioUsd === null || t.costoPromedioUsd === undefined ? "—" : formatUsd(t.costoPromedioUsd, 4)}</td>
                        <td className="px-3 py-2.5">
                          {t.estado === "activo"
                            ? <span className="text-slate-600">Activo</span>
                            : <span className={`${CLASE_BADGE} bg-slate-100 text-slate-500 border-slate-200`}>Inactivo</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" onClick={() => setEditando(t)} aria-label={`Editar ${t.nombre}`} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-lighter">
                            <Pencil className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr className="bg-slate-50/60">
                          <td />
                          <td colSpan={12} className="px-3 py-3">
                            {t.requerimientos.length === 0 ? (
                              <p className="text-[11px] text-slate-400">Ningún requerimiento usa este tipo. Se asocia en el catálogo de Requerimientos, sección "Validación con IA".</p>
                            ) : (
                              <ul className="space-y-1">
                                {t.requerimientos.map((r) => (
                                  <li key={r.id} className="flex flex-wrap gap-x-3 text-[11px]">
                                    <Link to={`/requerimientos/${r.id}`} className="font-bold text-primary hover:text-primary-dark hover:underline">{r.nombre}</Link>
                                    <span className="text-slate-500">{r.mandanteNombre}</span>
                                    <span className="text-slate-500">Modo: {MODO[r.modoValidacion] || r.modoValidacion}</span>
                                    {r.estado !== "activo" && <span className="text-slate-400">(inactivo)</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Tipos por normalizar" Icono={FileQuestion}>
        {porNormalizar && (porNormalizar.documentosPlantilla || []).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Documentos de las plantillas sin tipo documental</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Documento</th>
                    <th className="px-4 py-2.5">Sección</th>
                    <th className="px-4 py-2.5">Mandante</th>
                    <th className="px-4 py-2.5 text-right">Apariciones en revisiones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porNormalizar.documentosPlantilla.map((d) => (
                    <tr key={`${d.mandanteId}-${d.seccionClave}-${d.documentoClave}`}>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{d.documentoNombre}</td>
                      <td className="px-4 py-2.5 text-slate-500">{d.seccionNombre}</td>
                      <td className="px-4 py-2.5 text-slate-500">{d.mandanteNombre}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-carbon-dark">{d.apariciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {porNormalizar && (porNormalizar.documentosPlantilla || []).length > 0 && porNormalizar.grupos.length > 0 && (
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pt-2">Clasificados como OTRO por la IA</p>
        )}
        {!porNormalizar ? (
          <div className="h-24 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
        ) : porNormalizar.grupos.length === 0 ? (
          (porNormalizar.documentosPlantilla || []).length === 0 && (
            <p className="py-8 text-center text-xs text-slate-400">No se han detectado documentos fuera de los tipos normalizados.</p>
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-2.5">Descripción</th>
                    <th className="px-4 py-2.5 text-right">Apariciones</th>
                    <th className="px-4 py-2.5">Mandantes</th>
                    <th className="px-4 py-2.5">Último visto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porNormalizar.grupos.map((g) => (
                    <tr key={g.descripcion}>
                      <td className="px-4 py-2.5 text-slate-700 first-letter:uppercase">{g.descripcion}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-carbon-dark">{g.apariciones}</td>
                      <td className="px-4 py-2.5 text-slate-500">{g.mandantes.join(", ") || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatFecha(g.ultimoVisto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {porNormalizar.truncado && <p className="text-[11px] text-amber-700">Se muestran los primeros 5.000 documentos clasificados como OTRO.</p>}
          </>
        )}
      </Tarjeta>

      {desactivando && (
        <ConfirmacionModal
          titulo={`Deshabilitar ${desactivando.nombre}`}
          mensaje="Los documentos de las plantillas que usan este tipo pasarán a 'Solo completitud' y no se enviarán a la IA."
          textoConfirmar="Deshabilitar"
          peligro
          ocupado={cambiandoEstado}
          onConfirmar={() => cambiarEstado(desactivando, "inactivo")}
          onCancelar={() => setDesactivando(null)}
        />
      )}
      {editando && (
        <EditarTipoModal
          tipo={editando}
          modelos={modelos}
          onGuardado={(actualizado) => {
            setTipos((lista) => lista.map((t) => (t.id === actualizado.id ? { ...t, ...actualizado } : t)));
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      )}
    </div>
  );
};
