import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Gauge, History } from "lucide-react";
import { revisionIAService } from "../../services/revisionIAService";
import { ErrorBanner } from "../shared/ErrorBanner";
import { formatFecha } from "../../utils/fechas";
import { CLASE_BADGE, ESTADO_SESION, ETIQUETA_TIPO_DOCUMENTAL } from "../../utils/revisionIA";
import { Tarjeta } from "./Tarjeta";
import { CLASE_SECUNDARIO, formatUsd } from "./estilos";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const FUENTE = { carpeta_local: "Carpeta local", sharepoint: "SharePoint" };
const ETIQUETA_TIPO = { ...ETIQUETA_TIPO_DOCUMENTAL, sin_tipo: "Con error (sin tipo)" };

// Barra de gasto vs. límite: verde bajo 80 %, ámbar entre 80 % y 100 %, rojo sobre 100 %.
const BarraLimite = ({ gasto, limite }) => {
  const pct = limite > 0 ? (gasto / limite) * 100 : 0;
  const color = pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-400" : "bg-sage-dark";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-slate-600">
        <span>{formatUsd(gasto)} de {formatUsd(limite)}</span>
        <span className="font-bold">{Math.round(pct)}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
};

const TablaSimple = ({ columnas, filas, vacio }) => (
  filas.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">{vacio}</p> : (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {columnas.map((c) => <th key={c.titulo} className={`px-3 py-2 ${c.derecha ? "text-right" : ""}`}>{c.titulo}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filas.map((f, i) => (
          <tr key={i}>{columnas.map((c) => <td key={c.titulo} className={`px-3 py-2 ${c.derecha ? "text-right" : ""}`}>{c.valor(f)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
);

// Pestaña "Consumo" (superadmin; mandante_admin solo su Mandante): gasto del mes vs. límite (el
// límite es global: solo lo ve el superadmin), últimos 6 meses, por tipo documental, por Mandante
// (superadmin) y las últimas sesiones.
export const TabConsumo = ({ esSuperadmin }) => {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;
    revisionIAService.consumo()
      .then((d) => { if (vigente) setDatos(d); })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar el consumo."); });
    return () => { vigente = false; };
  }, []);

  if (!datos) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        {!error && <div className="h-40 rounded-2xl bg-white border border-slate-100 animate-pulse" aria-hidden="true" />}
      </div>
    );
  }

  const maximo = Math.max(...datos.porMes.map((m) => m.gastoUsd), 0);
  const limite = datos.limite;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Tarjeta titulo="Gasto del mes" Icono={Gauge}>
          <p className="text-3xl font-black text-carbon-dark">{formatUsd(datos.gastoMesUsd)}</p>
          {esSuperadmin && limite ? (
            limite.limiteGastoMensualUsd ? (
              <>
                <BarraLimite gasto={limite.gastoTotalMesUsd} limite={limite.limiteGastoMensualUsd} />
                <p className="text-[11px] text-slate-400">El límite es global: se compara con el gasto de todos los Mandantes.</p>
              </>
            ) : <p className="text-xs text-slate-500">Sin límite configurado.</p>
          ) : (
            <p className="text-[11px] text-slate-400">{datos.notaLimite}</p>
          )}
        </Tarjeta>

        <Tarjeta titulo="Gasto por mes (últimos 6 meses)" Icono={BarChart3}>
          {maximo === 0 ? <p className="py-6 text-center text-xs text-slate-400">Sin gasto en los últimos 6 meses.</p> : (
            <div className="flex items-end gap-3 h-40">
              {datos.porMes.map((m) => (
                <div key={m.mes} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${etiquetaMes(m.mes)}: ${formatUsd(m.gastoUsd, 4)}`}>
                  <span className="text-[10px] font-bold text-slate-500">{m.gastoUsd ? formatUsd(m.gastoUsd) : ""}</span>
                  <div className="w-full max-w-10 rounded-t-md bg-primary" style={{ height: `${(m.gastoUsd / maximo) * 75}%`, minHeight: m.gastoUsd ? 2 : 0 }} />
                  <span className="text-[10px] text-slate-400">{etiquetaMes(m.mes)}</span>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>

      <div className={`grid grid-cols-1 ${esSuperadmin ? "lg:grid-cols-2" : ""} gap-6`}>
        <Tarjeta titulo="Gasto por tipo documental (mes actual)">
          <TablaSimple
            vacio="Sin documentos procesados este mes."
            filas={datos.porTipo}
            columnas={[
              { titulo: "Tipo", valor: (f) => ETIQUETA_TIPO[f.tipo] || f.tipo },
              { titulo: "Documentos", derecha: true, valor: (f) => f.documentos },
              { titulo: "Gasto", derecha: true, valor: (f) => formatUsd(f.gastoUsd, 4) },
            ]}
          />
        </Tarjeta>
        {esSuperadmin && (
          <Tarjeta titulo="Gasto por Mandante (mes actual)">
            <TablaSimple
              vacio="Sin documentos procesados este mes."
              filas={datos.porMandante || []}
              columnas={[
                { titulo: "Mandante", valor: (f) => f.mandanteNombre },
                { titulo: "Documentos", derecha: true, valor: (f) => f.documentos },
                { titulo: "Gasto", derecha: true, valor: (f) => formatUsd(f.gastoUsd, 4) },
              ]}
            />
          </Tarjeta>
        )}
      </div>

      <Tarjeta titulo="Últimas sesiones" Icono={History} acciones={<Link to="/revisiones-ia" className={CLASE_SECUNDARIO}>Ver historial completo</Link>}>
        {datos.ultimasSesiones.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-xs text-slate-400">Aún no hay revisiones.</p>
            <Link to="/revisiones-ia" className="text-xs font-bold text-primary hover:text-primary-dark">Ir a Revisiones IA</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Mandante</th>
                  <th className="px-3 py-2">Fuente</th>
                  <th className="px-3 py-2 text-right">Documentos</th>
                  <th className="px-3 py-2 text-right">Cumple / No / Rev.</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datos.ultimasSesiones.map((s) => {
                  const t = s.totales || {};
                  const estado = ESTADO_SESION[s.estado] || ESTADO_SESION.en_proceso;
                  return (
                    <tr key={s.id}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link to={`/revisiones-ia/${s.id}`} className="font-bold text-primary hover:text-primary-dark hover:underline">{formatFecha(s.createdAt)}</Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{s.mandanteNombre}</td>
                      <td className="px-3 py-2 text-slate-600">{FUENTE[s.fuente] || s.fuente}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{t.archivos || 0}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-sage-dark font-bold">{t.cumple || 0}</span> / <span className="text-red-600 font-bold">{t.noCumple || 0}</span> / <span className="text-amber-600 font-bold">{t.revisionHumana || 0}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{formatUsd(s.costoRealUsd, 4)}</td>
                      <td className="px-3 py-2"><span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
};
