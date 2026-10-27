import { Building2, CheckCircle2, ShieldAlert, UserRound } from "lucide-react";
import { CLASE_BADGE, ESTADO_COMPLETITUD, SIN_ENLACE, formatRun, semaforoEmpresa } from "../../utils/revisionIA";

const CLASE_SELECT = "w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";
const COLOR_PERSONA = {
  rut: { clase: "bg-sage-dark", texto: "por RUT" },
  nombre: { clase: "bg-amber-400", texto: "por nombre" },
};

// Personas de una empresa del plan: la misma persona en dos secciones (trabajadores, conductores)
// es una sola fila, con los documentos de ambas.
const agruparPersonas = (empresa, nombreDocumento) => {
  const porClave = new Map();
  empresa.entidades.filter((e) => e.entidadTipo === "persona").forEach((e) => {
    const p = porClave.get(e.entidadClave) || {
      entidadClave: e.entidadClave, nombre: e.entidadNombre, runCarpeta: e.runCarpeta,
      sugerida: e.personaSugerida, secciones: [], encontrados: [], faltantes: [], sensibles: [], ignorados: [],
    };
    p.secciones.push(e.seccionClave);
    const fila = empresa.secciones.find((s) => s.entidadCarpeta === e.entidadCarpeta);
    (fila?.documentosEncontrados || []).forEach((d) => (d.sensible ? p.sensibles : p.encontrados).push(d.nombre));
    p.ignorados.push(...(fila?.documentosIgnorados || []).map((d) => d.nombre));
    p.faltantes.push(...(fila?.documentosFaltantes || []).map((clave) => nombreDocumento.get(`${e.seccionClave}|${clave}`) || clave));
    porClave.set(e.entidadClave, p);
  });
  return [...porClave.values()];
};

// Tarjeta de una empresa detectada en la vista previa de Nueva revisión: enlace con Empresa y
// Expediente (obligatorio confirmar), semáforo de completitud, calce de cada carpeta con la sección
// de la plantilla (corregible) y las personas con su enlace sugerido y documentos.
export const PlanEmpresaCard = ({
  empresa, seccionesPlantilla, empresasOpciones, expedientesOpciones, enlace, onEnlace, onCalce, deshabilitado,
}) => {
  const semaforo = semaforoEmpresa(empresa.secciones.filter((s) => !s.entidadCarpeta));
  const nombreSeccion = new Map(seccionesPlantilla.map((s) => [s.clave, s.nombre]));
  const filasSeccion = empresa.secciones.filter((s) => !s.entidadCarpeta);
  const nombreDocumento = new Map(seccionesPlantilla.flatMap((s) =>
    [...(s.documentos || []), ...(s.archivosSeccion || [])].map((d) => [`${s.clave}|${d.clave}`, d.nombre])));
  const personas = agruparPersonas(empresa, nombreDocumento);
  const maquinarias = empresa.entidades.filter((e) => e.entidadTipo === "maquinaria");
  const expedientesEmpresa = expedientesOpciones.filter((x) => x.empresaId === enlace.empresaId);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Building2 className="w-5 h-5 text-primary mt-0.5" />
        <div className="min-w-0 mr-auto">
          <p className="text-sm font-bold text-carbon-dark">
            {empresa.nombreEmpresaDetectado}
            {empresa.esSubcontrato && <span className="ml-2 text-[11px] font-semibold text-slate-500">(subcontrato)</span>}
          </p>
          <p className="text-[11px] text-slate-400">{empresa.empresaCarpeta}{empresa.textoProyecto ? ` · ${empresa.textoProyecto}` : ""}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <span className={`w-2.5 h-2.5 rounded-full ${semaforo.clase}`} aria-hidden="true" /> {semaforo.label}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end p-3 rounded-xl bg-slate-50 border border-slate-100">
        <label className="block">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Empresa</span>
          <select
            value={enlace.empresaId || ""} disabled={deshabilitado}
            onChange={(e) => onEnlace({ empresaId: e.target.value, expedienteId: "", confirmado: false })}
            className={CLASE_SELECT}
          >
            <option value="">Seleccione…</option>
            <option value={SIN_ENLACE}>Sin enlace (solo completitud)</option>
            {empresasOpciones.map((x) => <option key={x.id} value={x.id}>{x.razonSocial}</option>)}
          </select>
          {empresa.enlaceSugerido && (
            <span className="block text-[10px] text-slate-400 mt-1">
              Sugerida: {empresa.enlaceSugerido.empresaNombre} ({empresa.enlaceSugerido.por === "rut" ? "por RUT" : `${Math.round(empresa.enlaceSugerido.similitud * 100)}% por nombre`})
            </span>
          )}
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expediente</span>
          <select
            value={enlace.expedienteId || ""} disabled={deshabilitado || !enlace.empresaId || enlace.empresaId === SIN_ENLACE}
            onChange={(e) => onEnlace({ ...enlace, expedienteId: e.target.value, confirmado: false })}
            className={CLASE_SELECT}
          >
            <option value="">Sin expediente</option>
            {expedientesEmpresa.map((x) => <option key={x.id} value={x.id}>{x.proyectoNombre}{x.estado ? ` (${x.estado})` : ""}</option>)}
          </select>
        </label>
        <label className={`flex items-center gap-2 text-xs font-semibold ${enlace.confirmado ? "text-sage-dark" : "text-amber-700"}`}>
          <input
            type="checkbox" checked={Boolean(enlace.confirmado)} disabled={deshabilitado || !enlace.empresaId}
            onChange={(e) => onEnlace({ ...enlace, confirmado: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
          />
          Confirmo el enlace
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead>
            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <th className="py-1.5 pr-2">Carpeta encontrada</th>
              <th className="py-1.5 px-2">Sección de la plantilla</th>
              <th className="py-1.5 px-2 text-right">Archivos / entidades</th>
              <th className="py-1.5 pl-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filasSeccion.map((s, i) => {
              const estado = ESTADO_COMPLETITUD[s.estado] || ESTADO_COMPLETITUD.no_aplica;
              return (
                <tr key={`${s.seccionCarpeta || s.seccionClave}-${i}`} className={["no_reconocida", "deshabilitada"].includes(s.estado) ? "text-slate-400" : ""}>
                  <td className="py-1.5 pr-2">{s.seccionCarpeta || <span className="text-slate-300">—</span>}</td>
                  <td className="py-1.5 px-2">
                    {s.seccionCarpeta ? (
                      <select
                        aria-label={`Sección para ${s.seccionCarpeta}`} value={s.seccionClave || ""} disabled={deshabilitado}
                        onChange={(e) => onCalce(s.seccionCarpeta, e.target.value)}
                        className="w-full max-w-56 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px]"
                      >
                        <option value="">No reconocida</option>
                        {seccionesPlantilla.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
                      </select>
                    ) : nombreSeccion.get(s.seccionClave)}
                    {s.calce?.metodo && s.calce.metodo !== "manual" && (
                      <span className="ml-1 text-[10px] text-slate-400">{Math.round((s.calce.similitud || 0) * 100)}%{s.calce.metodo === "numero" ? " · por número" : ""}</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right">{s.encontrado}</td>
                  <td className="py-1.5 pl-2"><span className={`${CLASE_BADGE} ${estado.clase}`}>{estado.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {personas.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Personas ({personas.length})</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {personas.map((p) => {
              const color = COLOR_PERSONA[p.sugerida?.por] || { clase: "bg-slate-300", texto: "sin enlace" };
              return (
                <li key={p.entidadClave} className="px-3 py-2 text-[11px] space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserRound className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-carbon-dark">{p.nombre}</span>
                    {p.runCarpeta && <span className="text-slate-500">{formatRun(p.runCarpeta)}</span>}
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <span className={`w-2 h-2 rounded-full ${color.clase}`} aria-hidden="true" />
                      {p.sugerida ? `${p.sugerida.nombre} (${color.texto})` : color.texto}
                    </span>
                    <span className="text-slate-400 ml-auto">{p.secciones.map((s) => nombreSeccion.get(s) || s).join(" · ")}</span>
                  </div>
                  <p className="text-slate-500">
                    <CheckCircle2 className="inline w-3 h-3 text-sage-dark mr-1" />{p.encontrados.length} documentos
                    {p.faltantes.length > 0 && <span className="text-red-600"> · Faltan: {p.faltantes.join(", ")}</span>}
                    {p.ignorados.length > 0 && <span className="text-slate-400"> · Ignorado: {p.ignorados.join(", ")}</span>}
                    {p.sensibles.length > 0 && (
                      <span className="text-slate-500"> · <ShieldAlert className="inline w-3 h-3 text-slate-400" /> Revisión manual (dato sensible): {p.sensibles.join(", ")}</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {maquinarias.length > 0 && (
        <p className="text-[11px] text-slate-500">Maquinaria: {maquinarias.length} {maquinarias.length === 1 ? "carpeta" : "carpetas"} (solo se cuentan).</p>
      )}
    </section>
  );
};
