import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { TIPOS_CAMPO } from "../../../utils/reglasIA";
import { CLASE_INPUT, CLASE_PRIMARIO, CLASE_SECUNDARIO } from "../../configuracion-ia/estilos";

// Clave de campo desde la etiqueta: "Fecha de emisión" → "fechaDeEmision".
const claveDe = (etiqueta) => {
  const palabras = String(etiqueta || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const clave = palabras.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase())).join("");
  return /^[a-zA-Z]/.test(clave) ? clave.slice(0, 40) : "";
};

// Campos que la IA lee además de los que piden las reglas. Reemplazan a los del tipo documental:
// mientras el requerimiento no tenga los suyos se usan los del tipo (heredados) y se copian al
// guardarlo un superadmin. `onGuardar(campos)` guarda la lista ([] = solo los de las reglas).
export const CamposAdicionales = ({ datos, ocupado, onGuardar }) => {
  const [borrador, setBorrador] = useState(null); // [{ clave, etiqueta, tipo, claveManual }]
  const campos = datos?.campos || [];

  if (!borrador) {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-carbon-dark">Campos adicionales:</span>
          {campos.length ? campos.map((c) => (
            <span key={c.clave} className="inline-block px-1.5 py-px rounded bg-white border border-slate-200 text-[11px] text-slate-600">{c.etiqueta}</span>
          )) : <span className="text-[11px] text-slate-400">ninguno (solo los de las reglas)</span>}
          <button type="button" disabled={ocupado} onClick={() => setBorrador(campos.map((c) => ({ ...c, claveManual: true })))}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline disabled:opacity-50">
            <Pencil className="w-3 h-3" /> Editar
          </button>
        </div>
        {!datos?.propios && campos.length > 0 && (
          <p className="text-[11px] text-slate-400">
            Heredados de {datos.tipoNombre || "el tipo documental"}; pasan al requerimiento al guardarlo.
          </p>
        )}
      </div>
    );
  }

  const cambiar = (i, cambios) => setBorrador((b) => b.map((c, j) => {
    if (j !== i) return c;
    const n = { ...c, ...cambios };
    if (cambios.etiqueta !== undefined && !c.claveManual) n.clave = claveDe(cambios.etiqueta);
    return n;
  }));
  const claves = borrador.map((c) => c.clave.trim());
  const invalido = borrador.some((c) => !c.etiqueta.trim() || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(c.clave.trim()))
    || new Set(claves).size !== claves.length;

  return (
    <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <p className="text-[11px] font-bold text-carbon-dark">Campos adicionales que la IA debe leer</p>
      {borrador.length === 0 && <p className="text-[11px] text-slate-400">Sin campos adicionales: la IA leerá solo los que piden las reglas.</p>}
      {borrador.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input value={c.etiqueta} onChange={(e) => cambiar(i, { etiqueta: e.target.value })} placeholder="Etiqueta (p. ej. Fecha de emisión)"
            aria-label="Etiqueta del campo" maxLength={60} className={`${CLASE_INPUT} flex-1 min-w-40`} />
          <input value={c.clave} onChange={(e) => cambiar(i, { clave: e.target.value, claveManual: true })} placeholder="clave"
            aria-label="Clave del campo" maxLength={40} className={`${CLASE_INPUT} w-36 font-mono`} />
          <select value={c.tipo} onChange={(e) => cambiar(i, { tipo: e.target.value })} aria-label="Tipo del campo" className={`${CLASE_INPUT} w-auto`}>
            {TIPOS_CAMPO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button type="button" onClick={() => setBorrador((b) => b.filter((_, j) => j !== i))} aria-label={`Quitar ${c.etiqueta || "campo"}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ))}
      <button type="button" onClick={() => setBorrador((b) => [...b, { clave: "", etiqueta: "", tipo: "texto", claveManual: false }])}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
        <Plus className="w-3 h-3" /> Agregar campo
      </button>
      {invalido && <p className="text-[11px] text-amber-700">Cada campo necesita una etiqueta y una clave única (letras, números y _, empieza con letra).</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setBorrador(null)} className={CLASE_SECUNDARIO}>Cancelar</button>
        <button type="button" disabled={ocupado || invalido} className={CLASE_PRIMARIO}
          onClick={() => { onGuardar(borrador.map(({ clave, etiqueta, tipo }) => ({ clave: clave.trim(), etiqueta: etiqueta.trim(), tipo }))); setBorrador(null); }}>
          Guardar campos
        </button>
      </div>
    </div>
  );
};
