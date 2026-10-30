import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ENTIDADES_IA, ESTADOS_IA_TIPO as ESTADO_IA, TIPOS_CAMPO, aCodigoTipo } from "../../utils/reglasIA";
import { tipoDocumentalService } from "../../services/tipoDocumentalService";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { CLASE_INPUT, CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

// Campos sugeridos para un tipo nuevo (se agregan con un clic).
const CAMPOS_NUEVO = [
  { clave: "rut", etiqueta: "RUT", tipo: "rut" },
  { clave: "fechaEmision", etiqueta: "Fecha de emisión", tipo: "fecha" },
  { clave: "fechaVencimiento", etiqueta: "Fecha de vencimiento", tipo: "fecha" },
];

// Modal de creación (tipo = null) o edición de un tipo documental: el CATÁLOGO de documentos que
// reconoce la revisión por carpetas (p. ej. cédula, licencia) y que un requerimiento puede usar de
// forma OPCIONAL (sus campos se suman a los de las reglas). Las reglas por requerimiento no lo
// necesitan: lo que la IA lee sale de las reglas. Estado IA, modelo preferido, umbral de
// legibilidad, entidades y campos que extrae. El código se completa desde el nombre (solo al crear).
export const EditarTipoModal = ({ tipo: tipoInicial, modelos, onGuardado, onCancelar }) => {
  const esNuevo = !tipoInicial;
  const tipo = tipoInicial || { estadoIA: "piloto", umbralLegibilidad: 0.8, entidades: ["persona"], campos: [] };
  const [datos, setDatos] = useState({
    codigo: "",
    nombre: "",
    estadoIA: tipo.estadoIA || "piloto",
    modeloPreferido: tipo.modeloPreferido || "",
    umbralLegibilidad: String(tipo.umbralLegibilidad ?? 0.8),
    entidades: tipo.entidades || ["persona"],
    campos: (tipo.campos || []).map((c) => ({ ...c })),
  });
  // El código se completa desde el nombre hasta que se edita a mano.
  const [codigoManual, setCodigoManual] = useState(false);
  const alternarEntidad = (e) => setDatos((d) => ({
    ...d, entidades: d.entidades.includes(e) ? d.entidades.filter((x) => x !== e) : [...d.entidades, e],
  }));
  const cambiarCampo = (i, k, v) => setDatos((d) => ({ ...d, campos: d.campos.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const sugeridos = CAMPOS_NUEVO.filter((c) => !datos.campos.some((x) => x.clave === c.clave));
  const [confirmarActivo, setConfirmarActivo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const umbral = Number(String(datos.umbralLegibilidad).replace(",", "."));
  const umbralValido = umbral >= 0.5 && umbral <= 1;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const cambios = {
        estadoIA: datos.estadoIA, modeloPreferido: datos.modeloPreferido || null, umbralLegibilidad: umbral,
        entidades: datos.entidades, campos: datos.campos.map((c) => ({ ...c, clave: c.clave.trim(), etiqueta: c.etiqueta.trim() })),
      };
      onGuardado(esNuevo
        ? await tipoDocumentalService.crear({ ...cambios, codigo: datos.codigo.trim().toUpperCase(), nombre: datos.nombre.trim() })
        : await tipoDocumentalService.actualizar(tipo.id, cambios), esNuevo);
    } catch (err) {
      setError(err.message || "No se pudo guardar el tipo documental.");
      setGuardando(false);
      setConfirmarActivo(false);
    }
  };

  const alEnviar = (e) => {
    e.preventDefault();
    if (!umbralValido) return;
    if (esNuevo && (!/^[A-Z][A-Z0-9_]{1,39}$/.test(datos.codigo.trim()) || !datos.nombre.trim())) {
      setError("Indique un nombre y un código (mayúsculas, números y _, empieza con letra).");
      return;
    }
    if (!datos.entidades.length) { setError("Elija al menos una entidad."); return; }
    if (!datos.campos.length) { setError("Agregue al menos un campo que la IA deba leer del documento."); return; }
    if (datos.campos.some((c) => !c.clave.trim() || !c.etiqueta.trim())) {
      setError("Cada campo necesita clave y etiqueta.");
      return;
    }
    if (datos.estadoIA === "activo" && tipo.estadoIA !== "activo") setConfirmarActivo(true);
    else guardar();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={(e) => { e.stopPropagation(); if (!guardando) onCancelar(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="editar-tipo-titulo" onSubmit={alEnviar} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-dropdown w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <h3 id="editar-tipo-titulo" className="text-sm font-bold text-carbon-dark">{esNuevo ? "Nuevo tipo documental" : `Editar ${tipo.nombre}`}</h3>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {esNuevo && (
          <>
            <p className="text-[11px] text-slate-500">
              Catálogo de documentos (p. ej. cédula o licencia). Las reglas IA de un requerimiento no lo necesitan: lo que la IA lee
              sale de sus reglas; un requerimiento puede usar este tipo de forma opcional.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className={CLASE_LABEL}>Nombre *</span>
                <input value={datos.nombre} maxLength={80} placeholder="Certificado de la empresa" className={CLASE_INPUT}
                  onChange={(e) => { const nombre = e.target.value; setDatos((d) => ({ ...d, nombre, codigo: codigoManual ? d.codigo : aCodigoTipo(nombre) })); }} />
              </label>
              <label className="block">
                <span className={CLASE_LABEL}>Código * (no se puede cambiar)</span>
                <input value={datos.codigo} maxLength={40} placeholder="CERT_EMPRESA" className={`${CLASE_INPUT} font-mono`}
                  onChange={(e) => { setCodigoManual(true); setDatos((d) => ({ ...d, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })); }} />
                <span className="block text-[11px] text-slate-400 mt-1">Se completa desde el nombre.</span>
              </label>
            </div>
          </>
        )}
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
        <fieldset>
          <legend className={CLASE_LABEL}>Aplica a</legend>
          <div className="flex flex-wrap gap-3">
            {ENTIDADES_IA.map((e) => (
              <label key={e.value} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={datos.entidades.includes(e.value)} onChange={() => alternarEntidad(e.value)} className="rounded text-primary" /> {e.label}
              </label>
            ))}
          </div>
          <span className="block text-[11px] text-slate-400 mt-1">Solo los requerimientos de estas entidades podrán usar este tipo.</span>
        </fieldset>
        <div>
          <span className={CLASE_LABEL}>Campos que extrae la IA</span>
          <div className="space-y-1.5">
            {datos.campos.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input value={c.clave} onChange={(e) => cambiarCampo(i, "clave", e.target.value)} placeholder="clave (p. ej. rut)" aria-label="Clave" className={`${CLASE_INPUT} w-36 font-mono`} />
                <input value={c.etiqueta} onChange={(e) => cambiarCampo(i, "etiqueta", e.target.value)} placeholder="Etiqueta" aria-label="Etiqueta" className={`${CLASE_INPUT} flex-1 min-w-[10rem]`} />
                <select value={c.tipo} onChange={(e) => cambiarCampo(i, "tipo", e.target.value)} aria-label="Tipo de campo" className={`${CLASE_INPUT} w-28`}>
                  {TIPOS_CAMPO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button type="button" onClick={() => setDatos((d) => ({ ...d, campos: d.campos.filter((_, j) => j !== i) }))} aria-label={`Quitar ${c.clave || "campo"}`} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setDatos((d) => ({ ...d, campos: [...d.campos, { clave: "", etiqueta: "", tipo: "texto" }] }))} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
            <Plus className="w-3 h-3" /> Agregar campo
          </button>
          {esNuevo && sugeridos.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Sugeridos:</span>
              {sugeridos.map((c) => (
                <button key={c.clave} type="button" onClick={() => setDatos((d) => ({ ...d, campos: [...d.campos, { ...c }] }))}
                  className="px-2 py-0.5 rounded-full border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-primary hover:text-primary">
                  + {c.etiqueta}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={guardando} className={CLASE_SECUNDARIO}>Cancelar</button>
          <button type="submit" disabled={guardando || !umbralValido} className={CLASE_PRIMARIO}>{guardando ? "Guardando..." : esNuevo ? "Crear" : "Guardar"}</button>
        </div>
        {confirmarActivo && (
          <ConfirmacionModal
            titulo="Activar el tipo documental"
            mensaje="Activo indica que el tipo ya está validado. Piloto y Activo permiten usarlo en las reglas IA de los requerimientos."
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
