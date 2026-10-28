import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, FlaskConical, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { reglaIAService } from "../../../services/reglaIAService";
import { ErrorBanner } from "../../shared/ErrorBanner";
import { ConfirmacionModal } from "../../shared/ConfirmacionModal";
import { ReglaModal } from "../../configuracion-ia/ReglaModal";
import { CampoParametro } from "../../configuracion-ia/CampoParametro";
import {
  ESTADOS_IA_REQ, RESULTADOS_PROPUESTOS, SEVERIDADES, TIPOS_REGLA, etiquetaEntidad, fechaDMA,
} from "../../../utils/reglasIA";
import { CLASE_INPUT, CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO, formatUsd } from "../../configuracion-ia/estilos";
import { AgregarReglaModal } from "./AgregarReglaModal";
import { CopiarReglasModal } from "./CopiarReglasModal";
import { ProbarReglasModal } from "./ProbarReglasModal";
import { ResultadoPrueba } from "./ResultadoPrueba";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";
const AVISO_HABILITADO = "Al modificar las reglas, el requerimiento vuelve a En definición y deberá probarse de nuevo.";
const TRANSICIONES = {
  sin_reglas: [],
  en_definicion: [{ destino: "en_prueba", label: "Pasar a En prueba" }],
  en_prueba: [{ destino: "habilitado", label: "Habilitar IA" }, { destino: "en_definicion", label: "Volver a En definición" }],
  habilitado: [{ destino: "en_definicion", label: "Volver a En definición" }],
};
const valorTexto = (v) => (Array.isArray(v) ? v.join(", ") : String(v));

// Una regla del requerimiento: orden, severidad, parámetros (los personalizados se marcan), activa y
// quitar. Las alertas (regla inactiva, campos que el tipo no extrae…) se muestran debajo.
const FilaRegla = ({ vinculo, indice, total, esquema, ocupado, onMover, onCambiar, onQuitar }) => {
  const [editando, setEditando] = useState(null); // borrador de parámetros
  const regla = vinculo.regla;
  const parametros = Object.entries(esquema || {});
  const personalizados = vinculo.parametros || {};
  return (
    <li className={`px-3 py-2.5 space-y-2 ${vinculo.activa ? "" : "bg-slate-50/70"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <button type="button" disabled={ocupado || indice === 0} onClick={() => onMover(-1)} aria-label="Subir" className="p-0.5 text-slate-400 hover:text-primary disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
          <button type="button" disabled={ocupado || indice === total - 1} onClick={() => onMover(1)} aria-label="Bajar" className="p-0.5 text-slate-400 hover:text-primary disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
        </div>
        <div className={`min-w-0 flex-1 ${vinculo.activa ? "" : "opacity-60"}`}>
          <p className="text-xs font-bold text-carbon-dark">
            {regla?.nombre || "Regla eliminada"}
            {regla && <span className={`${CLASE_BADGE} ${TIPOS_REGLA[regla.tipo]?.clase || ""} ml-1.5`}>{TIPOS_REGLA[regla.tipo]?.label}</span>}
            {regla && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">v{regla.version}</span>}
          </p>
          {regla?.tipo === "interpretativa" && <p className="text-[11px] text-slate-500 line-clamp-2">{regla.instruccionIA}</p>}
          {parametros.length > 0 && (
            <p className="text-[11px] text-slate-500">
              {parametros.map(([k, e]) => {
                const v = vinculo.parametrosEfectivos?.[k];
                if (v === undefined || v === null) return null;
                return (
                  <span key={k} className="mr-2">
                    {e.etiqueta}: <span className="font-semibold text-carbon-dark">{e.opciones?.find((o) => o.valor === v)?.etiqueta || valorTexto(v)}</span>
                    {k in personalizados && <span className="ml-1 text-primary font-bold">(personalizado)</span>}
                  </span>
                );
              })}
            </p>
          )}
        </div>
        <select aria-label="Severidad" value={vinculo.severidad} disabled={ocupado} onChange={(e) => onCambiar({ severidad: e.target.value })} className={`${CLASE_INPUT} w-auto`}>
          {Object.entries(SEVERIDADES).map(([v, x]) => <option key={v} value={v}>{x.label}</option>)}
        </select>
        {parametros.length > 0 && (
          <button type="button" disabled={ocupado} onClick={() => setEditando(editando ? null : { ...personalizados })} aria-label="Editar parámetros" className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary-lighter"><Pencil className="w-3.5 h-3.5" /></button>
        )}
        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
          <input type="checkbox" checked={vinculo.activa} disabled={ocupado} onChange={(e) => onCambiar({ activa: e.target.checked })} className="rounded text-primary" /> Activa
        </label>
        <button type="button" disabled={ocupado} onClick={onQuitar} aria-label={`Quitar ${regla?.nombre || "regla"}`} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {editando && (
        <div className="ml-6 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {parametros.map(([k, e]) => (
              <CampoParametro key={k} nombre={k} esquema={e} idPrefijo={`v-${vinculo.id}`} valor={editando[k]}
                porDefecto={regla?.parametros?.[k] ?? e.default} onChange={(v) => setEditando((d) => ({ ...d, [k]: v }))} />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { onCambiar({ parametros: {} }); setEditando(null); }} className="text-[11px] font-bold text-slate-500 hover:underline mr-auto">Usar los de la regla</button>
            <button type="button" onClick={() => setEditando(null)} className={CLASE_SECUNDARIO}>Cancelar</button>
            <button type="button" onClick={() => { onCambiar({ parametros: editando }); setEditando(null); }} className={CLASE_PRIMARIO}>Guardar parámetros</button>
          </div>
        </div>
      )}
      {(vinculo.alertas || []).length > 0 && (
        <ul className="ml-6 space-y-0.5">
          {vinculo.alertas.map((a) => (
            <li key={a} className="flex items-start gap-1 text-[11px] text-amber-700"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {a}</li>
          ))}
        </ul>
      )}
    </li>
  );
};

// Pestaña "Reglas IA" del requerimiento (solo superadmin): estado IA y sus transiciones, tipo
// documental (filtrado por la entidad), reglas de la biblioteca con severidad y parámetros propios,
// "Probar reglas" y las últimas pruebas. Cada cambio se guarda al momento y queda en la Bitácora.
export const ReglasIARequerimiento = ({ requerimientoId }) => {
  const [config, setConfig] = useState(null);
  const [verificaciones, setVerificaciones] = useState([]);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState(null); // agregar | copiar | nueva | probar
  const [pendiente, setPendiente] = useState(null); // { titulo, mensaje, accion }
  const [pruebaVista, setPruebaVista] = useState(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([reglaIAService.obtenerRequerimiento(requerimientoId), reglaIAService.verificaciones()])
      .then(([c, v]) => { if (vigente) { setConfig(c); setVerificaciones(v || []); } })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la configuración IA."); });
    return () => { vigente = false; };
  }, [requerimientoId]);

  const ejecutar = async (promesa, exito = null) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await promesa();
      if (r?.requerimiento) setConfig(r);
      setAviso(r?.aviso || exito);
      return r;
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
      throw err;
    } finally {
      setOcupado(false);
    }
  };
  const silencioso = (promesa, exito) => ejecutar(promesa, exito).catch(() => {});
  // Estando habilitado, todo cambio de reglas pide confirmar (vuelve a En definición).
  const conAviso = (accion) => {
    if (config?.requerimiento.estadoIA === "habilitado") {
      setPendiente({ titulo: "El requerimiento tiene la IA habilitada", mensaje: AVISO_HABILITADO, accion });
    } else {
      accion();
    }
  };

  if (!config) {
    return error ? <ErrorBanner message={error} /> : <p className="py-6 text-center text-xs text-slate-400">Cargando reglas IA...</p>;
  }

  const { requerimiento, tipo, tiposDisponibles, vinculos, pruebas, transiciones } = config;
  const estado = ESTADOS_IA_REQ[requerimiento.estadoIA] || ESTADOS_IA_REQ.sin_reglas;
  const tipoNoDisponible = Boolean(tipo) && !tiposDisponibles.some((t) => t.id === tipo.id);
  const esquemaDe = (v) => (v.regla?.tipo === "deterministica" ? verificaciones.find((x) => x.clave === v.regla.verificacion)?.parametros : null);
  const puedeProbar = ["en_definicion", "en_prueba"].includes(requerimiento.estadoIA) && tipo && vinculos.some((v) => v.activa && v.regla?.estado === "activa");
  const id = requerimiento.id;

  const mover = (indice, delta) => {
    const ids = vinculos.map((v) => v.id);
    const [x] = ids.splice(indice, 1);
    ids.splice(indice + delta, 0, x);
    silencioso(() => reglaIAService.ordenar(id, ids));
  };

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} />
      {aviso && <p role="status" className="text-xs font-semibold text-amber-700">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100">
        <span className="text-xs font-bold text-carbon-dark">Estado IA:</span>
        <span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {TRANSICIONES[requerimiento.estadoIA].map((t) => (
            <button key={t.destino} type="button" disabled={ocupado || Boolean(transiciones[t.destino])} title={transiciones[t.destino] || ""}
              onClick={() => silencioso(() => reglaIAService.cambiarEstadoIA(id, t.destino), `Estado IA: ${ESTADOS_IA_REQ[t.destino].label}.`)}
              className={t.destino === "en_definicion" ? CLASE_SECUNDARIO : CLASE_PRIMARIO}>
              {t.label}
            </button>
          ))}
        </div>
        {TRANSICIONES[requerimiento.estadoIA].map((t) => transiciones[t.destino] && t.destino !== "en_definicion" && (
          <p key={t.destino} className="basis-full text-[11px] text-slate-500">{t.label}: {transiciones[t.destino]}</p>
        ))}
      </div>

      <div>
        <label htmlFor="req-ia-tipo" className={CLASE_LABEL}>Tipo documental</label>
        {tiposDisponibles.length === 0 && !tipo ? (
          <p className="text-xs text-slate-500">No hay tipos documentales IA disponibles para {etiquetaEntidad(requerimiento.tipoEntidad)} todavía.</p>
        ) : (
          <select id="req-ia-tipo" value={tipoNoDisponible ? "" : requerimiento.tipoDocumentalId || ""} disabled={ocupado}
            onChange={(e) => { const v = e.target.value || null; conAviso(() => silencioso(() => reglaIAService.asignarTipo(id, v), "Tipo documental actualizado.")); }}
            className={CLASE_INPUT}>
            <option value="">Sin tipo documental</option>
            {tiposDisponibles.map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.estadoIA === "piloto" ? " (piloto)" : ""}</option>)}
          </select>
        )}
        {/* El tipo guardado se mantiene hasta que el usuario elija otro o lo quite. */}
        {tipoNoDisponible && (
          <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
            <span className="mr-auto">El tipo documental configurado ya no está disponible para IA ({tipo.nombre}). Elija otro o quítelo.</span>
            <button type="button" disabled={ocupado} className={CLASE_SECUNDARIO}
              onClick={() => conAviso(() => silencioso(() => reglaIAService.asignarTipo(id, null), "Tipo documental quitado."))}>
              Quitar tipo
            </button>
          </div>
        )}
        {tipo && (
          <p className="text-[11px] text-slate-500 mt-1">
            Extrae: {tipo.campos.map((c) => c.etiqueta).join(", ") || "sin campos"}.
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs font-bold text-carbon-dark mr-auto">Reglas ({vinculos.length})</span>
          <button type="button" disabled={ocupado} onClick={() => conAviso(() => setModal("agregar"))} className={CLASE_SECUNDARIO}><Library className="w-3.5 h-3.5" /> Agregar desde biblioteca</button>
          <button type="button" disabled={ocupado} onClick={() => conAviso(() => setModal("copiar"))} className={CLASE_SECUNDARIO}><Copy className="w-3.5 h-3.5" /> Copiar de otro requerimiento</button>
          <button type="button" disabled={ocupado} onClick={() => conAviso(() => setModal("nueva"))} className={CLASE_SECUNDARIO}><Plus className="w-3.5 h-3.5" /> Nueva regla</button>
        </div>
        {vinculos.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500 rounded-xl border border-dashed border-slate-200">Aún no hay reglas. Agréguelas desde la biblioteca o cree una nueva.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {vinculos.map((v, i) => (
              <FilaRegla key={v.id} vinculo={v} indice={i} total={vinculos.length} esquema={esquemaDe(v)} ocupado={ocupado}
                onMover={(delta) => mover(i, delta)}
                onCambiar={(cambios) => conAviso(() => silencioso(() => reglaIAService.actualizarVinculo(id, v.id, cambios), "Regla actualizada."))}
                onQuitar={() => setPendiente({
                  titulo: `Quitar «${v.regla?.nombre || "regla"}»`,
                  mensaje: `La regla deja de aplicarse en este requerimiento (queda en la biblioteca).${requerimiento.estadoIA === "habilitado" ? ` ${AVISO_HABILITADO}` : ""}`,
                  accion: () => silencioso(() => reglaIAService.quitarVinculo(id, v.id), "Regla quitada."),
                })} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-carbon-dark mr-auto">Pruebas</span>
          <button type="button" disabled={ocupado || !puedeProbar} onClick={() => setModal("probar")} className={CLASE_PRIMARIO}
            title={puedeProbar ? "" : "Se prueba en En definición o En prueba, con tipo documental y al menos una regla activa."}>
            <FlaskConical className="w-3.5 h-3.5" /> Probar reglas
          </button>
        </div>
        {requerimiento.estadoIA === "en_prueba" && !config.pruebaVigente && (
          <p className="text-[11px] text-amber-700">Hubo cambios después de la última prueba: pruebe de nuevo antes de habilitar.</p>
        )}
        {pruebas.length === 0 ? <p className="text-[11px] text-slate-400">Sin pruebas todavía.</p> : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {pruebas.map((p) => {
              const r = RESULTADOS_PROPUESTOS[p.resultadoPropuesto?.resultado];
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setPruebaVista(p)} className="w-full flex flex-wrap items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50">
                    <span className="text-slate-500 tabular-nums">{fechaDMA(p.createdAt, true)}</span>
                    <span className="flex-1 truncate text-carbon-dark">{p.archivoNombre}</span>
                    {p.error ? <span className={`${CLASE_BADGE} bg-red-50 text-red-700 border-red-200`}>Error</span>
                      : r && <span className={`${CLASE_BADGE} ${r.clase}`}>{r.label}</span>}
                    <span className="text-[11px] text-slate-400">{formatUsd(p.costoEstimado, 4)} · {p.createdByNombre}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modal === "agregar" && (
        <AgregarReglaModal entidad={requerimiento.tipoEntidad} tipo={tipo} vinculadas={vinculos.map((v) => v.reglaId)}
          onCerrar={() => setModal(null)}
          onAgregar={(regla, severidad) =>
            ejecutar(() => reglaIAService.agregarRegla(id, { reglaId: regla.id, severidad }), `Regla «${regla.nombre}» agregada.`)} />
      )}
      {modal === "copiar" && (
        <CopiarReglasModal requerimiento={requerimiento} onCerrar={() => setModal(null)}
          onCopiar={async (origenId) => {
            const r = await ejecutar(() => reglaIAService.copiarDe(id, origenId));
            setModal(null);
            setAviso([r.aviso, `${r.copiadas.length} ${r.copiadas.length === 1 ? "regla copiada" : "reglas copiadas"}.`,
              ...r.omitidas.map((o) => `Omitida ${o.nombre}: ${o.motivo}`)].filter(Boolean).join(" "));
          }} />
      )}
      {modal === "nueva" && (
        <ReglaModal verificaciones={verificaciones} entidadInicial={requerimiento.tipoEntidad} onCerrar={() => setModal(null)}
          onGuardada={(regla) => {
            setModal(null);
            silencioso(() => reglaIAService.agregarRegla(id, { reglaId: regla.id, severidad: "bloqueante" }),
              `Regla «${regla.nombre}» creada en la biblioteca y agregada.`);
          }} />
      )}
      {modal === "probar" && (
        <ProbarReglasModal config={config} verificaciones={verificaciones} onCerrar={() => setModal(null)}
          onProbada={() => reglaIAService.obtenerRequerimiento(id).then(setConfig).catch(() => {})} />
      )}
      {pruebaVista && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => setPruebaVista(null)}>
          <div role="dialog" aria-modal="true" aria-label="Detalle de la prueba" onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-dropdown w-full max-w-3xl max-h-[88vh] overflow-y-auto p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-carbon-dark truncate">{pruebaVista.archivoNombre}</h3>
              <button type="button" onClick={() => setPruebaVista(null)} className={CLASE_SECUNDARIO}>Cerrar</button>
            </div>
            <ResultadoPrueba prueba={pruebaVista} campos={tipo?.campos || []} />
          </div>
        </div>
      )}
      {pendiente && (
        <ConfirmacionModal titulo={pendiente.titulo} mensaje={pendiente.mensaje} textoConfirmar="Continuar" ocupado={ocupado}
          onCancelar={() => setPendiente(null)}
          onConfirmar={() => { const a = pendiente.accion; setPendiente(null); a(); }} />
      )}
    </div>
  );
};
