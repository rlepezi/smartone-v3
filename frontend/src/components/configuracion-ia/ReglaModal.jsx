import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { reglaIAService } from "../../services/reglaIAService";
import { ENTIDADES_IA, TIPOS_REGLA, MIN_INSTRUCCION } from "../../utils/reglasIA";
import { ChipsInput } from "./ChipsInput";
import { CampoParametro } from "./CampoParametro";
import { CLASE_INPUT, CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

const inicial = (regla, entidad) => ({
  nombre: regla?.nombre || "",
  descripcion: regla?.descripcion || "",
  tipo: regla?.tipo || "deterministica",
  entidades: regla?.entidades || [entidad || "persona"],
  verificacion: regla?.verificacion || "",
  parametros: { ...(regla?.parametros || {}) },
  instruccionIA: regla?.instruccionIA || "",
  camposRequeridos: regla?.camposRequeridos && regla.tipo === "interpretativa" ? regla.camposRequeridos : [],
});

// Crear / editar una regla de la biblioteca (solo superadmin). Determinística: verificación del
// catálogo + parámetros por defecto (formulario desde su esquema). Interpretativa: instrucción en
// lenguaje natural. Editar una regla en uso pide elegir: nueva versión para todos, o duplicar.
export const ReglaModal = ({ regla = null, verificaciones, onGuardada, onCerrar, entidadInicial = null }) => {
  const [datos, setDatos] = useState(() => inicial(regla, entidadInicial));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const verificacion = verificaciones.find((v) => v.clave === datos.verificacion) || null;
  const deterministica = datos.tipo === "deterministica";
  const cambiar = (campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }));

  const elegirVerificacion = (clave) => {
    const v = verificaciones.find((x) => x.clave === clave);
    setDatos((d) => ({
      ...d, verificacion: clave, parametros: {},
      // Solo las entidades que la verificación admite.
      entidades: v ? (d.entidades.filter((e) => v.entidades.includes(e)).length ? d.entidades.filter((e) => v.entidades.includes(e)) : [v.entidades[0]]) : d.entidades,
      nombre: d.nombre || v?.nombre || "",
    }));
  };
  const alternarEntidad = (e) => setDatos((d) => ({
    ...d, entidades: d.entidades.includes(e) ? d.entidades.filter((x) => x !== e) : [...d.entidades, e],
  }));

  const payload = () => (deterministica
    ? { nombre: datos.nombre, descripcion: datos.descripcion, tipo: datos.tipo, entidades: datos.entidades,
      verificacion: datos.verificacion, parametros: datos.parametros }
    : { nombre: datos.nombre, descripcion: datos.descripcion, tipo: datos.tipo, entidades: datos.entidades,
      instruccionIA: datos.instruccionIA, camposRequeridos: datos.camposRequeridos });

  const ejecutar = async (accion) => {
    setGuardando(true);
    setError(null);
    try {
      const guardada = accion === "duplicar"
        ? await reglaIAService.duplicar(regla.id, payload())
        : regla ? await reglaIAService.actualizar(regla.id, payload()) : await reglaIAService.crear(payload());
      onGuardada(guardada, accion);
    } catch (err) {
      setError(err.message || "No se pudo guardar la regla.");
      setEligiendo(false);
      setGuardando(false);
    }
  };

  const alEnviar = (e) => {
    e.preventDefault();
    if (deterministica && !datos.verificacion) { setError("Elija la verificación."); return; }
    if (!deterministica && datos.instruccionIA.trim().length < MIN_INSTRUCCION) {
      setError(`La instrucción debe tener al menos ${MIN_INSTRUCCION} caracteres.`);
      return;
    }
    if (!datos.entidades.length) { setError("Elija al menos una entidad."); return; }
    if (regla?.uso > 0) setEligiendo(true);
    else ejecutar("guardar");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !guardando && onCerrar()}>
      <form role="dialog" aria-modal="true" aria-labelledby="regla-titulo" onSubmit={alEnviar} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 id="regla-titulo" className="text-sm font-bold text-carbon-dark">{regla ? `Editar regla (versión ${regla.version})` : "Nueva regla de revisión"}</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {regla?.uso > 0 && (
            <p className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> Esta regla se usa en {regla.uso} {regla.uso === 1 ? "requerimiento" : "requerimientos"}.
            </p>
          )}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

          <fieldset>
            <legend className={CLASE_LABEL}>Tipo de regla</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(TIPOS_REGLA).map(([valor, t]) => (
                <label key={valor} className={`flex items-start gap-2 p-3 rounded-xl border text-xs cursor-pointer ${datos.tipo === valor ? "border-primary bg-primary-lighter/50" : "border-slate-200"}`}>
                  <input type="radio" name="tipo-regla" checked={datos.tipo === valor} disabled={Boolean(regla)} onChange={() => cambiar("tipo", valor)} className="mt-0.5 text-primary" />
                  <span><b>{t.label}</b><br /><span className="text-slate-500">{t.ayuda}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          {deterministica && (
            <label className="block">
              <span className={CLASE_LABEL}>Verificación *</span>
              <select value={datos.verificacion} onChange={(e) => elegirVerificacion(e.target.value)} className={CLASE_INPUT}>
                <option value="">Seleccione...</option>
                {verificaciones.map((v) => <option key={v.clave} value={v.clave}>{v.nombre}</option>)}
              </select>
              {verificacion && (
                <span className="block text-[11px] text-slate-500 mt-1">
                  {verificacion.descripcion}
                  {verificacion.campos.length > 0 && <> Necesita el campo {verificacion.campos.map((c) => <code key={c} className="px-1 rounded bg-slate-100">{c}</code>)}.</>}
                </span>
              )}
            </label>
          )}

          <label className="block">
            <span className={CLASE_LABEL}>Nombre *</span>
            <input value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} maxLength={120} className={CLASE_INPUT} placeholder="Ej.: RUT coincide con la persona" />
          </label>
          <label className="block">
            <span className={CLASE_LABEL}>Descripción</span>
            <textarea rows={2} value={datos.descripcion} onChange={(e) => cambiar("descripcion", e.target.value)} maxLength={1000} className={`${CLASE_INPUT} resize-none`} />
          </label>

          {deterministica && verificacion && Object.keys(verificacion.parametros).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(verificacion.parametros).map(([nombre, esquema]) => (
                <CampoParametro key={nombre} nombre={nombre} esquema={esquema} valor={datos.parametros[nombre]}
                  onChange={(v) => cambiar("parametros", { ...datos.parametros, [nombre]: v })} />
              ))}
            </div>
          )}
          {deterministica && verificacion && Object.keys(verificacion.parametros).length > 0 && (
            <p className="text-[11px] text-slate-400">Son los valores por defecto: cada requerimiento puede sobrescribirlos.</p>
          )}

          {!deterministica && (
            <>
              <label className="block">
                <span className={CLASE_LABEL}>Instrucción para la IA *</span>
                <textarea rows={5} value={datos.instruccionIA} onChange={(e) => cambiar("instruccionIA", e.target.value)} maxLength={4000}
                  placeholder="Describe qué debe verificar la IA en el documento y qué cuenta como cumplimiento. Ej.: Verifica que el documento sea una cédula de identidad chilena vigente en formato oficial (anverso con foto y reverso con código MRZ). Cumple si ambos lados están presentes y son legibles."
                  className={`${CLASE_INPUT} resize-y`} />
                <span className={`text-[11px] ${datos.instruccionIA.trim().length < MIN_INSTRUCCION ? "text-amber-700" : "text-slate-400"}`}>
                  {datos.instruccionIA.trim().length} caracteres (mínimo {MIN_INSTRUCCION}). Sea concreto: qué mirar y qué cuenta como cumplimiento.
                </span>
              </label>
              <div>
                <span className={CLASE_LABEL}>Campos que necesita (opcional)</span>
                <ChipsInput valores={datos.camposRequeridos} onChange={(v) => cambiar("camposRequeridos", v)} placeholder="Clave del campo y Enter" ariaLabel="Campos requeridos" />
              </div>
            </>
          )}

          <fieldset>
            <legend className={CLASE_LABEL}>Entidades a las que aplica *</legend>
            <div className="flex flex-wrap gap-3">
              {ENTIDADES_IA.map((e) => {
                const admitida = !deterministica || !verificacion || verificacion.entidades.includes(e.value);
                return (
                  <label key={e.value} className={`flex items-center gap-1.5 text-xs ${admitida ? "" : "text-slate-300"}`}>
                    <input type="checkbox" checked={datos.entidades.includes(e.value)} disabled={!admitida} onChange={() => alternarEntidad(e.value)} className="rounded text-primary" />
                    {e.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
          <button type="button" onClick={onCerrar} disabled={guardando} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="submit" disabled={guardando} className={CLASE_PRIMARIO}>{guardando ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>

      {eligiendo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={(e) => { e.stopPropagation(); if (!guardando) setEligiendo(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="regla-en-uso" onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-dropdown w-full max-w-md p-6 space-y-4">
            <h3 id="regla-en-uso" className="text-sm font-bold text-carbon-dark">Esta regla se usa en {regla.uso} {regla.uso === 1 ? "requerimiento" : "requerimientos"}</h3>
            <ul className="text-xs text-slate-600 space-y-2">
              <li><b>Guardar para todos:</b> crea la versión {regla.version + 1}; todos los requerimientos que la usan pasan a usarla.</li>
              <li><b>Duplicar:</b> crea una regla nueva «{datos.nombre} (copia)» con estos cambios; la original no cambia.</li>
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEligiendo(false)} disabled={guardando} className={CLASE_SECUNDARIO}>Cancelar</button>
              <button type="button" onClick={() => ejecutar("duplicar")} disabled={guardando} className={CLASE_SECUNDARIO}>Duplicar</button>
              <button type="button" onClick={() => ejecutar("guardar")} disabled={guardando} className={CLASE_PRIMARIO}>Guardar para todos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
