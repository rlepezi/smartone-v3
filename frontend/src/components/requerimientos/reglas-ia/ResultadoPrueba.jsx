import { RESULTADOS_PROPUESTOS, RESULTADOS_REGLA, SEVERIDADES, TIPOS_REGLA, fechaDMA } from "../../../utils/reglasIA";
import { formatUsd } from "../../configuracion-ia/estilos";

const CLASE_BADGE = "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap";
const pct = (x) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "—");

// Resultado de una prueba de reglas: propuesta final (con motivos), tabla por regla y campos
// extraídos con su confianza. Solo lectura.
export const ResultadoPrueba = ({ prueba, campos = [] }) => {
  if (prueba.error) {
    return (
      <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700">
        La prueba falló: {prueba.error} (costo registrado: {formatUsd(prueba.costoEstimado, 4)}).
      </div>
    );
  }
  const propuesto = RESULTADOS_PROPUESTOS[prueba.resultadoPropuesto?.resultado];
  const etiquetaCampo = (clave) => campos.find((c) => c.clave === clave)?.etiqueta || clave;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-carbon-dark">Resultado propuesto:</span>
        {propuesto && <span className={`${CLASE_BADGE} ${propuesto.clase}`}>{propuesto.label}</span>}
        <span className="ml-auto text-[11px] text-slate-500">
          {fechaDMA(prueba.createdAt, true)} · {prueba.modelo} · {prueba.tokensEntrada} + {prueba.tokensSalida} tokens · {formatUsd(prueba.costoEstimado, 4)}
          {prueba.intentos > 1 ? ` · ${prueba.intentos} intentos` : ""}
        </span>
      </div>
      {(prueba.resultadoPropuesto?.motivos || []).length > 0 && (
        <ul className="text-[11px] text-slate-600 list-disc pl-5">
          {prueba.resultadoPropuesto.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      <p className="text-[11px] text-slate-400">La IA solo propone: en la revisión real, el evaluador siempre confirma.</p>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="px-3 py-2">Regla</th>
              <th className="px-3 py-2">Severidad</th>
              <th className="px-3 py-2">Resultado</th>
              <th className="px-3 py-2 text-right">Confianza</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(prueba.resultadosReglas || []).map((r) => (
              <tr key={r.vinculoId || r.reglaId}>
                <td className="px-3 py-2">
                  <p className="font-bold text-carbon-dark">{r.nombre}</p>
                  <p className="text-[10px] text-slate-400">{TIPOS_REGLA[r.tipo]?.label} · v{r.version}</p>
                </td>
                <td className="px-3 py-2"><span className={`${CLASE_BADGE} ${SEVERIDADES[r.severidad]?.clase || ""}`}>{SEVERIDADES[r.severidad]?.label || r.severidad}</span></td>
                <td className={`px-3 py-2 font-bold ${RESULTADOS_REGLA[r.resultado]?.clase || ""}`}>{RESULTADOS_REGLA[r.resultado]?.label || r.resultado}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{pct(r.confianza)}</td>
                <td className="px-3 py-2 text-slate-600">{r.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-xl border border-slate-100">
        <summary className="px-3 py-2 text-xs font-bold text-carbon-dark cursor-pointer">Campos extraídos</summary>
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-slate-100">
            {Object.entries(prueba.camposExtraidos || {}).map(([clave, v]) => (
              <tr key={clave}>
                <td className="px-3 py-1.5 text-slate-500">{etiquetaCampo(clave)} <span className="font-mono text-[10px] text-slate-400">{clave}</span></td>
                <td className="px-3 py-1.5 font-semibold text-carbon-dark">{v?.valor ?? <span className="text-slate-400 font-normal">sin dato</span>}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{pct(v?.confianza)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};
