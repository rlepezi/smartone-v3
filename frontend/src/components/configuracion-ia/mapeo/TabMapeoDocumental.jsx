import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Cloud, FolderOpen, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { useMandanteContexto } from "../../../hooks/useMandanteContexto";
import { useCarpetaBase } from "../../../hooks/useCarpetaBase";
import { fuenteDocumentalService } from "../../../services/fuenteDocumentalService";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";
import { empresaService } from "../../../services/empresaService";
import { CampoMandante } from "../../shared/CampoMandante";
import { TabEstructura } from "../TabEstructura";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "../estilos";
import { ListaCarpetasFuente } from "./ListaCarpetasFuente";
import { MapeoCarpeta } from "./MapeoCarpeta";

// Pestaña "Mapeo documental" (superadmin y evaluador): el árbol REAL de cada carpeta de empresa de
// la fuente documental del Mandante y la asignación manual de qué carpeta o archivo cumple cada
// requerimiento de nivel Empresa, más la carpeta del personal y la de maquinarias.
//  - Columna izquierda: subcarpetas de primer nivel de la fuente (registradas o no).
//  - Centro y derecha: árbol de la carpeta elegida (por niveles) y sus requerimientos.
// La plantilla de estructura (que el motor de Revisiones IA aún usa) queda como "Plantilla anterior"
// (`plantillaAnterior`), solo para superadmin, con su comportamiento de siempre.
export const TabMapeoDocumental = ({ plantillaAnterior = false }) => {
  const { profile } = useAuth();
  const esSuperadmin = profile?.rol === "superadmin";
  if (plantillaAnterior) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="mr-auto">En desuso: será reemplazada por el mapeo documental. El motor de Revisiones IA aún la usa.</span>
          <Link to="/configuracion/ia?tab=mapeo" className={CLASE_SECUNDARIO}><ArrowLeft className="w-3.5 h-3.5" /> Volver a Mapeo documental</Link>
        </div>
        {esSuperadmin ? <TabEstructura /> : <p className="text-xs text-slate-500">Solo un superadmin puede ver la plantilla anterior.</p>}
      </div>
    );
  }
  return <MapeoDocumental usuarioId={profile?.uid} esSuperadmin={esSuperadmin} />;
};

const MapeoDocumental = ({ usuarioId, esSuperadmin }) => {
  const contexto = useMandanteContexto();
  const { mandanteId, modo } = contexto;
  const [fuente, setFuente] = useState({ mandanteId: null, valor: undefined });
  const [datos, setDatos] = useState({ clave: null, carpetas: null, empresas: null, error: null });
  const [version, setVersion] = useState(0);
  const [seleccionada, setSeleccionada] = useState(null); // ruta
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!mandanteId) return undefined;
    let vigente = true;
    fuenteDocumentalService.activa(mandanteId)
      .then((f) => { if (vigente) setFuente({ mandanteId, valor: f || null }); })
      .catch(() => { if (vigente) setFuente({ mandanteId, valor: null }); });
    return () => { vigente = false; };
  }, [mandanteId]);

  const fuenteActual = fuente.mandanteId === mandanteId ? fuente.valor : undefined;
  const local = fuenteActual?.tipo === "local" ? fuenteActual : null;
  const base = useCarpetaBase(usuarioId, mandanteId, { etiquetaFuente: local?.etiqueta || null });
  const clave = local ? `${mandanteId}|${local.id}|${version}` : null;

  useEffect(() => {
    if (!clave) return undefined;
    let vigente = true;
    Promise.all([
      carpetaEmpresaService.listar({ mandanteId, fuenteId: local.id }),
      empresaService.listar("activo", { mandanteId }),
    ])
      .then(([carpetas, empresas]) => { if (vigente) setDatos({ clave, carpetas: carpetas || [], empresas: empresas || [], error: null }); })
      .catch((err) => { if (vigente) setDatos({ clave, carpetas: [], empresas: [], error: err.message || "No se pudieron cargar las carpetas." }); });
    return () => { vigente = false; };
    // clave resume mandanteId, fuente y versión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const actual = datos.clave === clave ? datos : null;
  const autorizada = Boolean(local) && base.coincideFuente && base.permiso === "granted";
  const registrada = (actual?.carpetas || []).find((c) => c.ruta.toLowerCase() === (seleccionada || "").toLowerCase()) || null;
  // Al guardar una asignación: la carpeta actualizada reemplaza a la del listado (sin recargar).
  const alActualizar = useCallback((c) => setDatos((d) => ({
    ...d, carpetas: (d.carpetas || []).map((x) => (x.id === c.id ? { ...x, ...c } : x)),
  })), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        {modo === "seleccionable" && (
          <div className="w-full max-w-sm"><CampoMandante contexto={contexto} conFoco={false} /></div>
        )}
        {modo === "ninguno" && <CampoMandante contexto={contexto} />}
        {esSuperadmin && (
          <Link to="/configuracion/ia?tab=mapeo&vista=plantilla" className="ml-auto text-xs font-bold text-slate-500 hover:text-primary hover:underline">Plantilla anterior</Link>
        )}
      </div>

      {!mandanteId ? (
        modo === "seleccionable" && <p className="py-8 text-center text-xs text-slate-400">Seleccione un Mandante para ver su mapeo documental.</p>
      ) : fuenteActual === undefined ? (
        <div className="h-16 rounded-2xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : !fuenteActual ? (
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-xs text-amber-800 space-y-1">
          <p className="font-bold">Sin fuente documental.</p>
          {esSuperadmin
            ? <Link to="/configuracion/ia?tab=fuentes" className="font-bold text-primary hover:underline">Configurarla en Fuentes documentales</Link>
            : <p>Un superadmin debe configurarla en Fuentes documentales.</p>}
        </div>
      ) : fuenteActual.tipo === "sharepoint" ? (
        <p className="flex items-center gap-2 p-4 rounded-2xl border border-slate-100 text-xs text-slate-600">
          <Cloud className="w-4 h-4 text-primary" /> El árbol de SharePoint estará disponible cuando se conecte Microsoft Graph.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-slate-100 text-xs">
            <FolderOpen className="w-4 h-4 text-primary" />
            <span>Fuente: <b className="text-carbon-dark">{local.etiqueta}</b></span>
            {autorizada ? (
              <span className="inline-flex items-center gap-1 font-semibold text-sage-dark"><ShieldCheck className="w-4 h-4" /> Autorizada</span>
            ) : base.coincideFuente ? (
              <button type="button" onClick={base.autorizar} className={CLASE_PRIMARIO}><KeyRound className="w-3.5 h-3.5" /> Re-autorizar</button>
            ) : (
              <button type="button" onClick={base.autorizarFuente} disabled={!base.soportado} className={CLASE_PRIMARIO}>
                <KeyRound className="w-3.5 h-3.5" /> Autorizar «{local.etiqueta}» en este navegador
              </button>
            )}
            {!base.soportado && <span className="text-slate-500">Este navegador no permite leer carpetas locales (use Chrome o Edge).</span>}
            {base.error && <span className="text-red-600">{base.error}</span>}
          </div>
          {actual?.error && <p role="alert" className="text-xs text-red-600">{actual.error}</p>}
          {autorizada && (
            <div className="grid grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)] gap-4 items-start">
              <ListaCarpetasFuente
                subcarpetas={base.subcarpetas || []}
                carpetas={actual?.carpetas || null}
                empresas={actual?.empresas || []}
                mandanteId={mandanteId}
                seleccionada={seleccionada}
                onSeleccionar={setSeleccionada}
                onRegistrada={recargar}
              />
              {!seleccionada ? (
                <p className="py-10 text-center text-xs text-slate-400 rounded-2xl border border-dashed border-slate-200">Elija una carpeta para ver su árbol.</p>
              ) : !registrada ? (
                <p className="py-10 text-center text-xs text-slate-500 rounded-2xl border border-dashed border-slate-200">Registra la carpeta para mapearla.</p>
              ) : (
                <MapeoCarpeta key={registrada.id} carpeta={registrada} base={base} onActualizada={alActualizar} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
