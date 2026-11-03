import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Cloud, Folder, FolderOpen, KeyRound, Search } from "lucide-react";
import { validarCarpetaEmpresa } from "../../../utils/carpetaEmpresa";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

const CLASE_BUSCAR = "w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

// Carpeta de la Empresa dentro de la fuente documental del Mandante: lista sus subcarpetas, primero
// las que contienen el nombre o el RUT de la Empresa. Si coincide una sola y aún no hay carpeta
// elegida, se elige sola.
//  - fuente: fuente activa del Mandante (backend) — null si no tiene; sin el prop (undefined), modo
//    anterior (expedientes legados: carpeta principal de este navegador y "Elegir desde otra
//    ubicación"). Con fuente local, la raíz de este navegador debe ser esa carpeta (si no, se ofrece
//    autorizarla aquí); con SharePoint se pega la URL de la carpeta (sin árbol hasta Graph).
//  - onElegirUrl(url): SharePoint.
//  - errorSeleccion: mensaje del backend para la carpeta elegida (p. ej. ya vinculada).
//  - base: resultado de useCarpetaBase.
//  - seleccionada: nombre de la carpeta vinculada, o null.
//  - onElegir(nombre): vincula esa subcarpeta.
//  - onManual: elegir con el selector del navegador (otra ubicación).
//  - puedeConfigurarBase: muestra el enlace a Fuentes documentales.
//  - autoElegir: en false no vincula sola la única coincidencia (lo hace quien la usa).
//  - onAutoElegida(nombre, motivo): avisa que se vinculó sola (para el toast); motivo "registrada"
//    si es la Carpeta de empresa ya registrada a la empresa, "coincide" si es la única que coincide.
//  - registradas: rutas de las Carpetas de empresa LIBRES ya registradas a esta empresa (p. ej. al
//    crearla). Con UNA, se elige sola; con varias, van primero y no se elige ninguna.
export const SelectorCarpetaEmpresa = ({
  base, empresa, seleccionada, onElegir, onManual, puedeConfigurarBase = false, autoElegir = true, onAutoElegida,
  fuente, onElegirUrl, errorSeleccion = null, registradas = [],
}) => {
  const modoFuente = fuente !== undefined;
  const [url, setUrl] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  const [eligiendo, setEligiendo] = useState(null);
  const autoelegida = useRef(false);

  const registradasMin = registradas.map((r) => r.toLowerCase());
  const subcarpetas = (base.subcarpetas || []).map((c) => ({
    ...c, coincide: validarCarpetaEmpresa(c.nombre, empresa).valida,
    registrada: registradasMin.includes(c.nombre.toLowerCase()),
  }));
  const registradasPresentes = subcarpetas.filter((c) => c.registrada);
  const coincidentes = subcarpetas.filter((c) => c.coincide);

  const elegir = async (nombre) => {
    setEligiendo(nombre);
    try {
      await onElegir(nombre);
    } finally {
      setEligiendo(null);
    }
  };

  // Nada elegido: la ÚNICA Carpeta de empresa libre ya registrada a la empresa se vincula sola; si
  // no hay registradas, la ÚNICA subcarpeta que pasa la validación estricta (una vez por Empresa).
  // Con varias registradas, o 0 o 2+ coincidencias, queda la lista para elegir.
  const local = !modoFuente || fuente?.tipo === "local";
  const unicaRegistrada = registradasPresentes.length === 1 ? registradasPresentes[0].nombre : null;
  const unica = !autoElegir || seleccionada || !local ? null
    : unicaRegistrada || (!registradas.length && coincidentes.length === 1 ? coincidentes[0].nombre : null);
  useEffect(() => {
    if (!unica || autoelegida.current) return;
    autoelegida.current = true;
    const motivo = unica === unicaRegistrada ? "registrada" : "coincide";
    Promise.resolve(onElegir(unica)).then(() => onAutoElegida?.(unica, motivo)).catch(() => {});
  }, [unica, unicaRegistrada, onElegir, onAutoElegida]);

  const enlaceConfigurar = puedeConfigurarBase && (
    <Link to="/configuracion/ia?tab=fuentes" className="font-bold text-primary hover:underline">Configurar en Fuentes documentales</Link>
  );
  const avisoSeleccion = errorSeleccion && <p role="alert" className="text-xs text-red-600">{errorSeleccion}</p>;

  if (modoFuente && !fuente) {
    return (
      <div className="space-y-1.5 text-xs">
        <p className="text-amber-700">Configura la fuente documental del Mandante: es la carpeta que contiene una subcarpeta por empresa y proyecto.</p>
        {enlaceConfigurar}
      </div>
    );
  }

  if (modoFuente && fuente.tipo === "sharepoint") {
    const sitio = fuente.url || "";
    const valida = /^https:\/\//i.test(url.trim()) && (!sitio || url.trim().toLowerCase().startsWith(sitio.toLowerCase()));
    return (
      <div className="space-y-2 text-xs">
        <p className="flex items-center gap-1.5 text-slate-500"><Cloud className="w-3.5 h-3.5 text-primary" /> Fuente SharePoint: <b className="text-carbon-dark">{fuente.etiqueta}</b></p>
        <p className="text-slate-500">Pegue la URL de la carpeta de la empresa dentro del sitio {sitio || "de la fuente"}. La navegación del árbol estará disponible cuando exista la conexión con Microsoft Graph.</p>
        <div className="flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`${sitio || "https://..."}/...`} aria-label="URL de la carpeta en SharePoint" className={`${CLASE_BUSCAR} flex-1 min-w-60 pl-3`} />
          <button type="button" disabled={!valida} onClick={() => onElegirUrl?.(url.trim())} className={CLASE_PRIMARIO}>Usar esta carpeta</button>
        </div>
        {url.trim() && !valida && <p className="text-amber-700">La URL debe ser https y estar dentro del sitio de la fuente.</p>}
        {avisoSeleccion}
      </div>
    );
  }

  if (base.cargando) return <p className="text-xs text-slate-400">Buscando la carpeta principal...</p>;

  if (modoFuente && (!base.handle || !base.coincideFuente)) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-amber-700">
          La fuente documental del Mandante es «{fuente.etiqueta}», pero no está autorizada en este navegador
          {base.handle ? ` (aquí está recordada «${base.handle.name}»)` : ""}. Autorícela para elegir la carpeta de la empresa.
        </p>
        <button type="button" onClick={base.autorizarFuente} disabled={!base.soportado} className={CLASE_PRIMARIO}>
          <KeyRound className="w-3.5 h-3.5" /> Autorizar «{fuente.etiqueta}» en este navegador
        </button>
        {!base.soportado && <p className="text-slate-500">Este navegador no permite leer carpetas locales (use Chrome o Edge).</p>}
        {base.error && <p className="text-red-600">{base.error}</p>}
      </div>
    );
  }

  if (!base.handle) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-amber-700">
          No hay una carpeta principal configurada para este Mandante en este navegador (Configuración → Inteligencia
          Artificial → Fuentes documentales). Es la carpeta que contiene una subcarpeta por empresa.
        </p>
        {base.error && <p className="text-red-600">{base.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {enlaceConfigurar}
          {onManual && <button type="button" onClick={onManual} className={CLASE_SECUNDARIO}><FolderOpen className="w-3.5 h-3.5" /> Elegir carpeta manualmente</button>}
        </div>
      </div>
    );
  }

  if (base.permiso !== "granted") {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-slate-600">El navegador necesita que confirmes el acceso a la carpeta principal «{base.handle.name}».</p>
        <button type="button" onClick={base.autorizar} className={CLASE_PRIMARIO}><KeyRound className="w-3.5 h-3.5" /> Permitir acceso</button>
        {base.error && <p className="text-red-600">{base.error}</p>}
      </div>
    );
  }

  const termino = busqueda.trim().toLowerCase();
  const visibles = (verTodas || coincidentes.length === 0 ? subcarpetas : coincidentes)
    .filter((c) => !termino || c.nombre.toLowerCase().includes(termino))
    .sort((a, b) => Number(b.registrada) - Number(a.registrada) || Number(b.coincide) - Number(a.coincide));

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <FolderOpen className="w-3.5 h-3.5 text-primary" /> {modoFuente ? "Fuente documental" : "Carpeta principal"}: <b className="text-carbon-dark">{base.handle.name}</b>
      </p>
      {avisoSeleccion}
      {coincidentes.length === 0 && (
        <p className="text-xs text-amber-700">
          Ninguna subcarpeta contiene el nombre ni el RUT de {empresa?.razonSocial}. Revisa el nombre de la carpeta de la empresa.
        </p>
      )}
      {(verTodas || coincidentes.length === 0) && subcarpetas.length > 8 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar carpeta..." className={CLASE_BUSCAR} />
        </div>
      )}
      {subcarpetas.length === 0 ? (
        <p className="text-xs text-slate-400">La carpeta principal no tiene subcarpetas.</p>
      ) : (
        <ul className="max-h-60 overflow-y-auto space-y-1">
          {visibles.map((c) => {
            const activa = c.nombre === seleccionada;
            return (
              <li key={c.nombre}>
                <button
                  type="button"
                  onClick={() => elegir(c.nombre)}
                  disabled={Boolean(eligiendo) || activa}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs transition-colors ${activa ? "border-primary bg-primary-lighter/50 font-bold text-carbon-dark" : "border-slate-100 hover:bg-slate-50 text-slate-700"}`}
                >
                  {activa ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0" /> : <Folder className="w-4 h-4 text-slate-400 shrink-0" />}
                  <span className="truncate">{c.nombre}</span>
                  {c.registrada ? <span className="ml-auto shrink-0 px-2 py-0.5 rounded-full bg-primary-lighter text-primary text-[10px] font-bold">Registrada a la empresa</span>
                    : c.coincide && <span className="ml-auto shrink-0 px-2 py-0.5 rounded-full bg-sage-lighter text-sage-darker text-[10px] font-bold">Coincide con la empresa</span>}
                  {eligiendo === c.nombre && <span className="ml-auto text-[10px] text-slate-400">Vinculando...</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {coincidentes.length > 0 && subcarpetas.length > coincidentes.length && (
          <button type="button" onClick={() => setVerTodas((v) => !v)} className="font-bold text-primary hover:underline">
            {verTodas ? "Ver solo las que coinciden" : `Ver todas las carpetas (${subcarpetas.length})`}
          </button>
        )}
        {onManual && !modoFuente && <button type="button" onClick={onManual} className="font-bold text-slate-500 hover:underline">Elegir desde otra ubicación</button>}
      </div>
    </div>
  );
};
