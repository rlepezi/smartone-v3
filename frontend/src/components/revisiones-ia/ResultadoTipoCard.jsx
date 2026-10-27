import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, MinusCircle, XCircle } from "lucide-react";
import { formatFecha, formatFechaHora } from "../../utils/fechas";
import {
  CLASE_BADGE, ESTADO_RESULTADO, ETIQUETA_TIPO_DOCUMENTAL, PROPUESTA, RESULTADO_REGLA, formatRun,
} from "../../utils/revisionIA";

const ICONO_REGLA = {
  cumple: CheckCircle2, no_cumple: XCircle, revision: AlertTriangle, informativa: Info, no_aplica: MinusCircle,
};

const esFecha = (campo) => /^fecha/i.test(campo.split(".").pop());

// Campos mostrados por tipo, con su etiqueta. Las fechas se muestran en dd/mm/aaaa.
const CAMPOS = {
  CEDULA_CL: [
    ["run", "RUN"], ["nombres", "Nombres"], ["apellidos", "Apellidos"], ["fechaNacimiento", "Nacimiento"],
    ["cedula.numeroDocumento", "N° documento"], ["cedula.tipoDocumento", "Tipo"],
    ["cedula.fechaEmision", "Emisión"], ["cedula.fechaVencimiento", "Vencimiento"],
  ],
  LICENCIA_CL: [
    ["run", "RUN"], ["nombres", "Nombres"], ["apellidos", "Apellidos"], ["licencia.clases", "Clases"],
    ["licencia.fechaUltimoControl", "Último control"], ["licencia.fechaProximoControl", "Próximo control"],
    ["licencia.municipalidad", "Municipalidad"], ["licencia.restricciones", "Restricciones"],
  ],
};

const leer = (obj, ruta) => ruta.split(".").reduce((v, k) => (v == null ? v : v[k]), obj);

const mostrar = (campo, valor) => {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (Array.isArray(valor)) return valor.join(", ");
  if (campo === "run") return formatRun(String(valor).replace(/\./g, ""));
  if (esFecha(campo)) return formatFecha(valor);
  return String(valor);
};

// Tarjeta de un tipo documental de una persona: propuesta, reglas, datos consolidados, conflictos,
// expedientes donde se evaluaría y las acciones Aceptar / Corregir / Descartar.
export const ResultadoTipoCard = ({ resultado, puedeResolver, onResolver, resolviendo }) => {
  const [verDatos, setVerDatos] = useState(false);
  const propuesta = PROPUESTA[resultado.propuesta] || PROPUESTA.revision_humana;
  const estado = ESTADO_RESULTADO[resultado.estado] || ESTADO_RESULTADO.propuesto;
  const datos = resultado.datosConsolidados || {};
  const requeridos = (resultado.enlaces || []).filter((e) => e.requerido);
  const pendiente = resultado.estado === "propuesto";
  const resolucion = resultado.resolucion;

  return (
    <div className="rounded-xl border border-slate-100 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold text-carbon-dark mr-auto">
          {ETIQUETA_TIPO_DOCUMENTAL[resultado.tipoDocumentalCodigo] || resultado.tipoDocumentalCodigo}
        </p>
        <span className={`${CLASE_BADGE} ${propuesta.clase}`}>Propuesta: {propuesta.label}</span>
        {!pendiente && <span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span>}
      </div>

      <ul className="space-y-1">
        {(resultado.resultadoReglas || []).map((r) => {
          const Icono = ICONO_REGLA[r.resultado] || Info;
          const meta = RESULTADO_REGLA[r.resultado] || RESULTADO_REGLA.informativa;
          return (
            <li key={r.regla} className="flex items-start gap-2 text-[11px]">
              <Icono className={`w-3.5 h-3.5 mt-px shrink-0 ${meta.clase}`} aria-label={meta.label} />
              <span><span className="font-bold text-slate-500">{r.regla}</span> <span className="text-slate-600">{r.detalle}</span></span>
            </li>
          );
        })}
      </ul>

      {(resultado.conflictos || []).length > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-[11px] text-amber-800 space-y-0.5">
          <p className="font-bold">Valores distintos entre archivos</p>
          {resultado.conflictos.map((c) => (
            <p key={c.campo}>{c.campo}: {c.valores.map((v) => mostrar(c.campo, v)).join(" · ")}</p>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setVerDatos((v) => !v)} className="text-[11px] font-bold text-primary hover:text-primary-dark">
        {verDatos ? "Ocultar datos extraídos" : "Ver datos extraídos"}
      </button>
      {verDatos && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[11px]">
          {(CAMPOS[resultado.tipoDocumentalCodigo] || []).map(([campo, etiqueta]) => (
            <div key={campo} className="min-w-0">
              <dt className="text-slate-400">{etiqueta}</dt>
              <dd className="font-semibold text-carbon-dark break-words">{mostrar(campo, leer(datos, campo))}</dd>
            </div>
          ))}
          <div>
            <dt className="text-slate-400">Legibilidad</dt>
            <dd className="font-semibold text-carbon-dark">{typeof datos.legibilidad === "number" ? datos.legibilidad.toFixed(2) : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Lados</dt>
            <dd className="font-semibold text-carbon-dark">{(datos.ladosPresentes || []).join(", ") || "—"}</dd>
          </div>
        </dl>
      )}

      <p className="text-[11px] text-slate-500">
        {requeridos.length
          ? `Se evaluará en ${requeridos.length} ${requeridos.length === 1 ? "requerimiento" : "requerimientos"}: ${requeridos.map((e) => [e.empresaNombre, e.proyectoCodigo].filter(Boolean).join(" · ")).join("; ")}.`
          : "Ningún expediente activo pide este documento: aceptar no crea evaluaciones."}
      </p>

      {resolucion && (
        <p className="text-[11px] text-slate-500">
          {resolucion.automatica
            ? `${estado.label} automáticamente por IA (revisión de ${resolucion.resueltoPor?.nombre || "—"}) el ${formatFechaHora(resolucion.resueltoAt)}`
            : `${estado.label} por ${resolucion.resueltoPor?.nombre || "—"} el ${formatFechaHora(resolucion.resueltoAt)}`}
          {resolucion.resultadoFinal && ` · Resultado: ${PROPUESTA[resolucion.resultadoFinal]?.label || resolucion.resultadoFinal}`}
          {resolucion.observacion && ` · "${resolucion.observacion}"`}
        </p>
      )}

      {puedeResolver && pendiente && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onResolver(resultado, "aceptar")}
            disabled={resolviendo || resultado.propuesta === "revision_humana"}
            title={resultado.propuesta === "revision_humana" ? "La propuesta requiere revisión: use Corregir." : undefined}
            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-white text-[11px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Aceptar
          </button>
          <button type="button" onClick={() => onResolver(resultado, "corregir")} disabled={resolviendo} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-carbon-dark hover:bg-slate-50 disabled:opacity-50">
            Corregir
          </button>
          <button type="button" onClick={() => onResolver(resultado, "descartar")} disabled={resolviendo} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            Descartar
          </button>
        </div>
      )}
    </div>
  );
};
