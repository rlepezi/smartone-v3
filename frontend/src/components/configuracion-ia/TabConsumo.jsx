import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Building2, Download, FileText, Gauge, History, Wallet, X } from "lucide-react";
import { revisionIAService } from "../../services/revisionIAService";
import {
  configuracionIAService, MANDANTE_INTERNO, ETIQUETA_SIN_MANDANTE, ORIGEN_CONSUMO_IA,
} from "../../services/configuracionIAService";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { ErrorBanner } from "../shared/ErrorBanner";
import { MandanteChip } from "../shared/MandanteChip";
import { DateInput } from "../ui/DateInput";
import { formatFecha, hoyISO, sumarDiasISO } from "../../utils/fechas";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { descargarCsv } from "../../utils/csv";
import { CLASE_BADGE, ESTADO_SESION } from "../../utils/revisionIA";
import { Tarjeta } from "./Tarjeta";
import { CLASE_INPUT, CLASE_LABEL, CLASE_SECUNDARIO, formatUsd } from "./estilos";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const FUENTE = { carpeta_local: "Carpeta local", sharepoint: "SharePoint" };
const formatNumero = (n) => Number(n || 0).toLocaleString("es-CL");
const formatPct = (n) => `${Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 1 })} %`;

// Atajos de período (fechas "aaaa-mm-dd" en hora de Chile).
const inicioMes = (iso) => `${iso.slice(0, 7)}-01`;
const ATAJOS = [
  { key: "mes", label: "Mes actual", rango: (hoy) => ({ desde: inicioMes(hoy), hasta: hoy }) },
  {
    key: "anterior", label: "Mes anterior",
    rango: (hoy) => {
      const fin = sumarDiasISO(inicioMes(hoy), -1);
      return { desde: inicioMes(fin), hasta: fin };
    },
  },
  {
    key: "tres", label: "Últimos 3 meses",
    rango: (hoy) => ({ desde: inicioMes(sumarDiasISO(inicioMes(sumarDiasISO(inicioMes(hoy), -1)), -1)), hasta: hoy }),
  },
  { key: "personalizado", label: "Rango personalizado" },
];

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

const Kpi = ({ Icono, titulo, valor, detalle }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card flex items-center gap-4">
    <span className="w-10 h-10 rounded-xl bg-primary-lighter text-primary flex items-center justify-center shrink-0">
      <Icono className="w-5 h-5" />
    </span>
    <div className="min-w-0">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{titulo}</p>
      <p className="text-2xl font-black text-carbon-dark leading-tight">{valor}</p>
      {detalle && <p className="text-[11px] text-slate-400">{detalle}</p>}
    </div>
  </div>
);

const NombreMandante = ({ fila }) => (
  fila.mandanteId
    ? <MandanteChip nombre={fila.mandanteNombre} logoUrl={fila.logoUrl} />
    : <span className="inline-flex items-center gap-2 text-slate-500 italic"><Building2 className="w-4 h-4" />{ETIQUETA_SIN_MANDANTE}</span>
);

const BarrasPorMes = ({ porMes }) => {
  const maximo = Math.max(...porMes.map((m) => m.costoUsd), 0);
  if (maximo === 0) return <p className="py-6 text-center text-xs text-slate-400">Sin gasto en los últimos 6 meses.</p>;
  return (
    <div className="flex items-end gap-3 h-40">
      {porMes.map((m) => (
        <div key={m.mes} className="flex-1 h-full flex flex-col justify-end items-center gap-1" title={`${etiquetaMes(m.mes)}: ${formatUsd(m.costoUsd, 4)} · ${m.documentos} documentos`}>
          <span className="text-[10px] font-bold text-slate-500">{m.costoUsd ? formatUsd(m.costoUsd) : ""}</span>
          <div className="w-full max-w-10 rounded-t-md bg-primary" style={{ height: `${(m.costoUsd / maximo) * 75}%`, minHeight: m.costoUsd ? 2 : 0 }} />
          <span className="text-[10px] text-slate-400">{etiquetaMes(m.mes)}</span>
        </div>
      ))}
    </div>
  );
};

const exportarCsv = (resumen) => {
  const decimal = (n, d = 6) => Number(n || 0).toFixed(d).replace(".", ",");
  const filas = [
    ["Mandante", "Documentos", "Llamadas", "Tokens entrada", "Tokens salida", "Costo (USD)", "Costo promedio por documento (USD)", "% del total"],
    ...resumen.porMandante.map((f) => [
      f.mandanteId ? f.mandanteNombre : ETIQUETA_SIN_MANDANTE, f.documentos, f.llamadas, f.tokensEntrada,
      f.tokensSalida, decimal(f.costoUsd), decimal(f.costoPromedioDocumentoUsd), decimal(f.porcentaje, 1),
    ]),
    ["Total", resumen.total.documentos, resumen.total.llamadas, resumen.total.tokensEntrada, resumen.total.tokensSalida,
      decimal(resumen.total.costoUsd), decimal(resumen.total.costoPromedioDocumentoUsd), resumen.total.costoUsd ? "100" : "0"],
  ];
  const fecha = (iso) => formatFecha(iso).replace(/\//g, "-");
  descargarCsv(`consumo-ia_${fecha(resumen.desde)}_${fecha(resumen.hasta)}.csv`, filas);
};

// Detalle de un Mandante (o del consumo interno) en el período: gasto por mes (6 meses hasta el fin
// del período), por tipo documental y por origen.
const DetalleMandante = ({ fila, desde, hasta, onCerrar }) => {
  const mandanteId = fila.mandanteId || MANDANTE_INTERNO;
  const clave = `${mandanteId}|${desde}|${hasta}`;
  const [carga, setCarga] = useState({ clave: null, datos: null, error: null });

  useEffect(() => {
    let vigente = true;
    configuracionIAService.resumenConsumo({ desde, hasta, mandanteId })
      .then((d) => { if (vigente) setCarga({ clave, datos: d.detalle, error: null }); })
      .catch((err) => { if (vigente) setCarga({ clave, datos: null, error: err.message || "No se pudo cargar el detalle." }); });
    return () => { vigente = false; };
  }, [clave, mandanteId, desde, hasta]);

  const actual = carga.clave === clave;
  const detalle = actual ? carga.datos : null;

  return (
    <Tarjeta
      titulo={<span className="flex items-center gap-2">Detalle: <NombreMandante fila={fila} /></span>}
      acciones={<button type="button" onClick={onCerrar} className={CLASE_SECUNDARIO}><X className="w-3.5 h-3.5" /> Cerrar</button>}
    >
      {actual && carga.error && <ErrorBanner message={carga.error} />}
      {!detalle ? (
        !carga.error && <div className="h-40 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : (
        <div className="space-y-6">
          <div>
            <p className={CLASE_LABEL}>Gasto por mes (últimos 6 meses)</p>
            <BarrasPorMes porMes={detalle.porMes} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className={CLASE_LABEL}>Por tipo documental (período)</p>
              <TablaSimple
                vacio="Sin consumo en el período."
                filas={detalle.porTipoDocumental}
                columnas={[
                  { titulo: "Tipo documental", valor: (f) => f.tipoDocumentalNombre || "Sin tipo" },
                  { titulo: "Documentos", derecha: true, valor: (f) => formatNumero(f.documentos) },
                  { titulo: "Costo", derecha: true, valor: (f) => formatUsd(f.costoUsd, 4) },
                  { titulo: "% del total", derecha: true, valor: (f) => formatPct(f.porcentaje) },
                ]}
              />
            </div>
            <div>
              <p className={CLASE_LABEL}>Por origen (período)</p>
              <TablaSimple
                vacio="Sin consumo en el período."
                filas={detalle.porOrigen}
                columnas={[
                  { titulo: "Origen", valor: (f) => ORIGEN_CONSUMO_IA[f.origen] || f.origen },
                  { titulo: "Llamadas", derecha: true, valor: (f) => formatNumero(f.llamadas) },
                  { titulo: "Costo", derecha: true, valor: (f) => formatUsd(f.costoUsd, 4) },
                  { titulo: "% del total", derecha: true, valor: (f) => formatPct(f.porcentaje) },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </Tarjeta>
  );
};

// Pestaña "Consumo" (solo superadmin): gasto de IA del período por Mandante, con su detalle, el
// límite mensual global y las últimas sesiones de revisión de carpetas.
export const TabConsumo = () => {
  const contexto = useMandanteContexto();
  const hoy = hoyISO();
  const [atajo, setAtajo] = useState("mes");
  const [rangoPropio, setRangoPropio] = useState(() => ATAJOS[0].rango(hoy));
  // null: el usuario aún no eligió (con un solo Mandante viene preseleccionado).
  const [mandanteElegido, setMandanteElegido] = useState(null);
  const [seleccionado, setSeleccionado] = useState(null);
  const [carga, setCarga] = useState({ clave: null, datos: null, error: null });
  const [general, setGeneral] = useState(null);
  const [errorGeneral, setErrorGeneral] = useState(null);

  const mandanteFiltro = mandanteElegido ?? (contexto.modo === "unico" ? contexto.mandanteId : "");
  const periodoAtajo = ATAJOS.find((a) => a.key === atajo)?.rango;
  const periodo = periodoAtajo ? periodoAtajo(hoy) : rangoPropio;
  const periodoValido = Boolean(periodo.desde && periodo.hasta && periodo.desde <= periodo.hasta);
  const clave = `${periodo.desde}|${periodo.hasta}|${mandanteFiltro}`;

  useEffect(() => {
    if (!periodoValido) return undefined;
    let vigente = true;
    const [desde, hasta, mandanteId] = clave.split("|");
    configuracionIAService.resumenConsumo({ desde, hasta, mandanteId })
      .then((d) => { if (vigente) setCarga({ clave, datos: d, error: null }); })
      .catch((err) => { if (vigente) setCarga({ clave, datos: null, error: err.message || "No se pudo cargar el consumo." }); });
    return () => { vigente = false; };
  }, [clave, periodoValido]);

  useEffect(() => {
    let vigente = true;
    revisionIAService.consumo()
      .then((d) => { if (vigente) setGeneral(d); })
      .catch((err) => { if (vigente) setErrorGeneral(err.message || "No se pudo cargar el límite de gasto."); });
    return () => { vigente = false; };
  }, []);

  const resumen = carga.clave === clave ? carga.datos : null;
  const error = carga.clave === clave ? carga.error : null;
  // Con un Mandante filtrado, su detalle se muestra directo.
  const filaDetalle = seleccionado
    || (mandanteFiltro && resumen?.porMandante.length === 1 ? resumen.porMandante[0] : null);

  const cambiarAtajo = (key) => {
    if (key === "personalizado") setRangoPropio(periodo);
    setAtajo(key);
    setSeleccionado(null);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className={CLASE_LABEL}>Período</p>
            <div className="flex flex-wrap gap-2">
              {ATAJOS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => cambiarAtajo(a.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${atajo === a.key ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          {atajo === "personalizado" && (
            <div className="flex items-end gap-2">
              <label className="block">
                <span className={CLASE_LABEL}>Desde</span>
                <DateInput value={rangoPropio.desde} max={hoy} onChange={(e) => { setRangoPropio((r) => ({ ...r, desde: e.target.value })); setSeleccionado(null); }} className={CLASE_INPUT} />
              </label>
              <label className="block">
                <span className={CLASE_LABEL}>Hasta</span>
                <DateInput value={rangoPropio.hasta} max={hoy} onChange={(e) => { setRangoPropio((r) => ({ ...r, hasta: e.target.value })); setSeleccionado(null); }} className={CLASE_INPUT} />
              </label>
            </div>
          )}
          <label className="block min-w-56">
            <span className={CLASE_LABEL}>Mandante</span>
            <select
              value={mandanteFiltro}
              onChange={(e) => { setMandanteElegido(e.target.value); setSeleccionado(null); }}
              className={`${CLASE_INPUT} bg-white`}
            >
              <option value="">Todos</option>
              {contexto.mandantes.map((m) => <option key={m.id} value={m.id}>{getMandanteDisplayName(m) || m.id}</option>)}
              <option value={MANDANTE_INTERNO}>{ETIQUETA_SIN_MANDANTE}</option>
            </select>
          </label>
        </div>
        {periodoValido ? (
          <p className="text-[11px] text-slate-400">Período: {formatFecha(periodo.desde)} al {formatFecha(periodo.hasta)} (hora de Chile).</p>
        ) : (
          <p className="text-[11px] font-semibold text-red-500">Ingrese un rango válido: la fecha de inicio no puede ser posterior a la de fin.</p>
        )}
      </section>

      <ErrorBanner message={error} />

      {!resumen ? (
        !error && periodoValido && <div className="h-40 rounded-2xl bg-white border border-slate-100 animate-pulse" aria-hidden="true" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Kpi Icono={Wallet} titulo="Gasto del período" valor={formatUsd(resumen.total.costoUsd, resumen.total.costoUsd < 1 ? 4 : 2)} detalle={`${formatNumero(resumen.total.llamadas)} llamadas a la IA`} />
            <Kpi Icono={FileText} titulo="Documentos revisados" valor={formatNumero(resumen.total.documentos)} detalle="Sin contar «Probar conexión»" />
            <Kpi Icono={Gauge} titulo="Costo promedio por documento" valor={formatUsd(resumen.total.costoPromedioDocumentoUsd, 4)} />
          </div>

          <Tarjeta
            titulo="Consumo por Mandante"
            Icono={BarChart3}
            acciones={(
              <button type="button" onClick={() => exportarCsv(resumen)} disabled={resumen.porMandante.length === 0} className={CLASE_SECUNDARIO}>
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
            )}
          >
            {resumen.porMandante.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Sin consumo de IA en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="px-3 py-2">Mandante</th>
                      <th className="px-3 py-2 text-right">Documentos</th>
                      <th className="px-3 py-2 text-right">Llamadas</th>
                      <th className="px-3 py-2 text-right">Tokens (entrada / salida)</th>
                      <th className="px-3 py-2 text-right">Costo</th>
                      <th className="px-3 py-2 text-right">Costo prom. / doc.</th>
                      <th className="px-3 py-2 text-right">% del total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumen.porMandante.map((f) => {
                      const activa = filaDetalle && (filaDetalle.mandanteId ?? null) === (f.mandanteId ?? null);
                      return (
                        <tr
                          key={f.mandanteId || MANDANTE_INTERNO}
                          onClick={() => setSeleccionado(f)}
                          title="Ver el detalle del Mandante"
                          className={`cursor-pointer transition-colors ${activa ? "bg-primary-lighter/60" : "hover:bg-slate-50"}`}
                        >
                          <td className="px-3 py-2.5 font-semibold text-carbon-dark"><NombreMandante fila={f} /></td>
                          <td className="px-3 py-2.5 text-right">{formatNumero(f.documentos)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{formatNumero(f.llamadas)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{formatNumero(f.tokensEntrada)} / {formatNumero(f.tokensSalida)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-carbon-dark">{formatUsd(f.costoUsd, 4)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{formatUsd(f.costoPromedioDocumentoUsd, 4)}</td>
                          <td className="px-3 py-2.5 text-right">{formatPct(f.porcentaje)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          {filaDetalle && (
            <DetalleMandante
              key={`${filaDetalle.mandanteId || MANDANTE_INTERNO}|${clave}`}
              fila={filaDetalle}
              desde={periodo.desde}
              hasta={periodo.hasta}
              onCerrar={() => { setSeleccionado(null); if (mandanteFiltro) setMandanteElegido(""); }}
            />
          )}
        </>
      )}

      <ErrorBanner message={errorGeneral} />
      {general && (
        <>
          <Tarjeta titulo="Límite de gasto mensual" Icono={Gauge}>
            <p className="text-sm text-carbon-dark">Gasto del mes actual: <span className="font-black">{formatUsd(general.gastoMesUsd)}</span></p>
            {general.limite?.limiteGastoMensualUsd ? (
              <>
                <BarraLimite gasto={general.limite.gastoTotalMesUsd} limite={general.limite.limiteGastoMensualUsd} />
                <p className="text-[11px] text-slate-400">El límite es global: se compara con el gasto de todos los Mandantes.</p>
              </>
            ) : <p className="text-xs text-slate-500">Sin límite configurado.</p>}
          </Tarjeta>

          <Tarjeta titulo="Últimas sesiones" Icono={History} acciones={<Link to="/revisiones-ia" className={CLASE_SECUNDARIO}>Ver historial completo</Link>}>
            {general.ultimasSesiones.length === 0 ? (
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
                    {general.ultimasSesiones.map((s) => {
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
        </>
      )}
    </div>
  );
};
