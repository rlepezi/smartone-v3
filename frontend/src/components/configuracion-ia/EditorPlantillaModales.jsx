import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ChipsInput } from "./ChipsInput";
import { claveDesdeNombre } from "../../utils/claveNodo";
import { CLASE_INPUT, CLASE_LABEL, CLASE_PRIMARIO, CLASE_SECUNDARIO, TIPOS_SECCION } from "./estilos";

const RE_CLAVE = /^[a-z0-9_]{2,40}$/;


const Modal = ({ titulo, children, onCancelar, onGuardar, puedeGuardar = true }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCancelar}>
    <form
      role="dialog" aria-modal="true" aria-label={titulo}
      onSubmit={(e) => { e.preventDefault(); if (puedeGuardar) onGuardar(); }}
      onClick={(e) => e.stopPropagation()}
      className="bg-white rounded-2xl shadow-dropdown w-full max-w-xl max-h-[92vh] overflow-y-auto p-6 space-y-4"
    >
      <h3 className="text-sm font-bold text-carbon-dark">{titulo}</h3>
      {children}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancelar} className={CLASE_SECUNDARIO}>Cancelar</button>
        <button type="submit" disabled={!puedeGuardar} className={CLASE_PRIMARIO}>Aplicar</button>
      </div>
    </form>
  </div>
);

const Campo = ({ etiqueta, children, error }) => (
  <label className="block">
    <span className={CLASE_LABEL}>{etiqueta}</span>
    {children}
    {error && <span className="block text-[11px] text-red-500 mt-1">{error}</span>}
  </label>
);

const Check = ({ etiqueta, checked, onChange, ayuda }) => (
  <label className="flex items-start gap-2 cursor-pointer text-xs">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30" />
    <span><span className="font-semibold text-gray-700">{etiqueta}</span>{ayuda && <span className="block text-[11px] text-slate-400">{ayuda}</span>}</span>
  </label>
);

// Modal de una sección de la plantilla. `clavesUsadas`: para no repetir la clave (también las
// retiradas). La clave se genera desde el nombre al crearla y no cambia. Los requerimientos se
// vinculan en la tabla (Mapeo documental), no aquí.
export const SeccionModal = ({ seccion, clavesUsadas, onGuardar, onCancelar }) => {
  const esNueva = !seccion;
  const [d, setD] = useState(() => ({
    nombre: seccion?.nombre || "", alias: seccion?.alias || [],
    numeroSugerido: seccion?.numeroSugerido || "", obligatoria: Boolean(seccion?.obligatoria),
    tipo: seccion?.tipo || "archivos", entidad: seccion?.entidad || "persona", rolEntidad: seccion?.rolEntidad || "",
    min: String(seccion?.cardinalidad?.min ?? 0), max: seccion?.cardinalidad?.max ?? "",
    nota: seccion?.nota || "", multiple: Boolean(seccion?.multiple), datosSensibles: Boolean(seccion?.datosSensibles),
  }));
  const set = (campo, valor) => setD((x) => ({ ...x, [campo]: valor }));
  const clave = seccion?.clave || claveDesdeNombre(d.nombre, clavesUsadas);
  const errorClave = esNueva && !RE_CLAVE.test(clave) ? "Escriba un nombre." : null;
  const min = Number(d.min);
  const max = d.max === "" ? null : Number(d.max);
  const errorCard = !(Number.isInteger(min) && min >= 0) || (max !== null && !(Number.isInteger(max) && max >= min)) ? "Mínimo ≥ 0 y máximo ≥ mínimo (vacío = sin límite)." : null;
  const valido = !errorClave && d.nombre.trim() && !errorCard;

  return (
    <Modal
      titulo={esNueva ? "Nueva sección" : `Editar sección ${seccion.nombre}`}
      onCancelar={onCancelar}
      puedeGuardar={Boolean(valido)}
      onGuardar={() => onGuardar({
        ...(seccion || { archivosSeccion: [], documentos: [], estado: "activo" }),
        clave, nombre: d.nombre.trim(), alias: d.alias,
        numeroSugerido: d.numeroSugerido.trim() || null, obligatoria: d.obligatoria, tipo: d.tipo,
        entidad: d.tipo === "entidades" ? d.entidad : null,
        rolEntidad: d.tipo === "entidades" && d.entidad === "persona" ? d.rolEntidad.trim() || null : null,
        cardinalidad: { min, max }, nota: d.nota.trim() || null, multiple: d.multiple, datosSensibles: d.datosSensibles,
      })}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Campo etiqueta="Nombre de referencia *">
          <input value={d.nombre} onChange={(e) => set("nombre", e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo etiqueta={esNueva ? "Clave (automática, no cambia después)" : "Clave (no cambia)"} error={errorClave}>
          <input value={clave} disabled className={`${CLASE_INPUT} font-mono`} />
        </Campo>
      </div>
      <Campo etiqueta="Alias (palabras clave para reconocer la carpeta)">
        <ChipsInput valores={d.alias} onChange={(v) => set("alias", v)} placeholder="Escriba y presione Enter" ariaLabel="Alias de la sección" />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Campo etiqueta="Número sugerido (solo desempate)">
          <input value={d.numeroSugerido} onChange={(e) => set("numeroSugerido", e.target.value)} placeholder="04" className={CLASE_INPUT} />
        </Campo>
        <Campo etiqueta="Mínimo" error={errorCard}>
          <input type="number" min="0" value={d.min} onChange={(e) => set("min", e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo etiqueta="Máximo (vacío = sin límite)">
          <input type="number" min="0" value={d.max} onChange={(e) => set("max", e.target.value)} className={CLASE_INPUT} />
        </Campo>
      </div>
      <Campo etiqueta="Tipo">
        <select value={d.tipo} onChange={(e) => set("tipo", e.target.value)} className={CLASE_INPUT}>
          {TIPOS_SECCION.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Campo>
      {d.tipo === "entidades" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo etiqueta="Entidad">
            <select value={d.entidad} onChange={(e) => set("entidad", e.target.value)} className={CLASE_INPUT}>
              <option value="persona">Persona</option>
              <option value="maquinaria">Maquinaria</option>
            </select>
          </Campo>
          {d.entidad === "persona" && (
            <Campo etiqueta="Rol">
              <input value={d.rolEntidad} onChange={(e) => set("rolEntidad", e.target.value)} placeholder="trabajador, conductor_operador…" className={CLASE_INPUT} />
            </Campo>
          )}
        </div>
      )}
      <Campo etiqueta="Nota (opcional)">
        <input value={d.nota} onChange={(e) => set("nota", e.target.value)} className={CLASE_INPUT} />
      </Campo>
      <div className="flex flex-wrap gap-6">
        <Check etiqueta="Obligatoria" checked={d.obligatoria} onChange={(v) => set("obligatoria", v)} ayuda="Si falta en la carpeta, la empresa queda incompleta." />
        <Check etiqueta="Múltiple" checked={d.multiple} onChange={(v) => set("multiple", v)} ayuda="La carpeta trae varios documentos del requerimiento." />
        <Check etiqueta="Datos sensibles" checked={d.datosSensibles} onChange={(v) => set("datosSensibles", v)} ayuda="Nunca se envía a la IA: solo se revisa su presencia." />
      </div>
    </Modal>
  );
};

// Modal de un documento esperado (archivo suelto o documento de entidad). La clave se genera desde
// el nombre y no cambia. El tipo documental (opcional) da los campos base de lo que la IA lee.
export const DocumentoModal = ({ documento, clavesUsadas, tiposDocumentales, onGuardar, onCancelar }) => {
  const esNuevo = !documento;
  const [d, setD] = useState(() => ({
    nombre: documento?.nombre || "", alias: documento?.alias || [],
    excluir: documento?.excluir || [], obligatorio: Boolean(documento?.obligatorio), multiple: Boolean(documento?.multiple),
    tipoDocumentalCodigo: documento?.tipoDocumentalCodigo || "",
    datosSensibles: Boolean(documento?.datosSensibles),
  }));
  const set = (campo, valor) => setD((x) => ({ ...x, [campo]: valor }));
  const clave = documento?.clave || claveDesdeNombre(d.nombre, clavesUsadas);
  const errorClave = esNuevo && !RE_CLAVE.test(clave) ? "Escriba un nombre." : null;

  return (
    <Modal
      titulo={esNuevo ? "Nuevo documento" : `Editar ${documento.nombre}`}
      onCancelar={onCancelar}
      puedeGuardar={!errorClave && Boolean(d.nombre.trim())}
      onGuardar={() => onGuardar({
        ...(documento || { estado: "activo" }),
        clave, nombre: d.nombre.trim(), alias: d.alias, excluir: d.excluir,
        obligatorio: d.obligatorio, multiple: d.multiple, tipoDocumentalCodigo: d.tipoDocumentalCodigo || null,
        datosSensibles: d.datosSensibles,
      })}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Campo etiqueta="Nombre *">
          <input value={d.nombre} onChange={(e) => set("nombre", e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo etiqueta={esNuevo ? "Clave (automática, no cambia después)" : "Clave (no cambia)"} error={errorClave}>
          <input value={clave} disabled className={`${CLASE_INPUT} font-mono`} />
        </Campo>
      </div>
      <Campo etiqueta="Alias (palabras clave para reconocer el archivo)">
        <ChipsInput valores={d.alias} onChange={(v) => set("alias", v)} placeholder="c.i., cedula…" ariaLabel="Alias del documento" />
      </Campo>
      <Campo etiqueta="Palabras de exclusión (descartan el calce)">
        <ChipsInput valores={d.excluir} onChange={(v) => set("excluir", v)} placeholder="anexo…" ariaLabel="Palabras de exclusión" clase="bg-red-50 text-red-700" />
      </Campo>
      <Campo etiqueta="Tipo documental (opcional: campos base que la IA lee)">
        <select value={d.tipoDocumentalCodigo} onChange={(e) => set("tipoDocumentalCodigo", e.target.value)} className={CLASE_INPUT}>
          <option value="">Sin tipo</option>
          {tiposDocumentales.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre} ({t.codigo})</option>)}
        </select>
      </Campo>
      <div className="flex flex-wrap gap-6">
        <Check etiqueta="Obligatorio" checked={d.obligatorio} onChange={(v) => set("obligatorio", v)} />
        <Check etiqueta="Múltiple" checked={d.multiple} onChange={(v) => set("multiple", v)} ayuda="Acepta varios archivos (ej. versiones de ODI)." />
      </div>
      <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${d.datosSensibles ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}>
        <input type="checkbox" role="switch" checked={d.datosSensibles} onChange={(e) => set("datosSensibles", e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30" />
        <span className="text-xs">
          <span className="flex items-center gap-1 font-semibold text-gray-700"><ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Datos sensibles</span>
          <span className="block text-[11px] text-amber-700">Nunca se enviará a la IA: solo se revisa su presencia.</span>
        </span>
      </label>
    </Modal>
  );
};
