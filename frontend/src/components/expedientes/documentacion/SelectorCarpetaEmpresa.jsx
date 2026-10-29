import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Folder, FolderOpen, KeyRound, Search } from "lucide-react";
import { validarCarpetaEmpresa } from "../../../utils/carpetaEmpresa";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

const CLASE_BUSCAR = "w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

// Carpeta de la Empresa dentro de la carpeta principal del Mandante (Fuentes documentales): lista
// sus subcarpetas, primero las que contienen el nombre o el RUT de la Empresa. Si coincide una
// sola y aún no hay carpeta elegida, se elige sola.
//  - base: resultado de useCarpetaBase.
//  - seleccionada: nombre de la carpeta vinculada, o null.
//  - onElegir(nombre): vincula esa subcarpeta.
//  - onManual: elegir con el selector del navegador (otra ubicación).
//  - puedeConfigurarBase: muestra el enlace a Fuentes documentales.
//  - autoElegir: en false no vincula sola la única coincidencia (lo hace quien la usa).
//  - onAutoElegida(nombre): avisa que se vinculó sola (para el toast).
export const SelectorCarpetaEmpresa = ({
  base, empresa, seleccionada, onElegir, onManual, puedeConfigurarBase = false, autoElegir = true, onAutoElegida,
}) => {
  const [busqueda, setBusqueda] = useState("");
  const [verTodas, setVerTodas] = useState(false);
  const [eligiendo, setEligiendo] = useState(null);
  const autoelegida = useRef(false);

  const subcarpetas = (base.subcarpetas || []).map((c) => ({
    ...c, coincide: validarCarpetaEmpresa(c.nombre, empresa).valida,
  }));
  const coincidentes = subcarpetas.filter((c) => c.coincide);

  const elegir = async (nombre) => {
    setEligiendo(nombre);
    try {
      await onElegir(nombre);
    } finally {
      setEligiendo(null);
    }
  };

  // UNA sola subcarpeta que pasa la validación estricta y nada elegido: se vincula sola (una vez por
  // Empresa). Con 0 o 2+ coincidencias queda la lista para elegir.
  const unica = autoElegir && !seleccionada && coincidentes.length === 1 ? coincidentes[0].nombre : null;
  useEffect(() => {
    if (!unica || autoelegida.current) return;
    autoelegida.current = true;
    Promise.resolve(onElegir(unica)).then(() => onAutoElegida?.(unica)).catch(() => {});
  }, [unica, onElegir, onAutoElegida]);

  if (base.cargando) return <p className="text-xs text-slate-400">Buscando la carpeta principal...</p>;

  const enlaceConfigurar = puedeConfigurarBase && (
    <Link to="/configuracion/ia?tab=fuentes" className="font-bold text-primary hover:underline">Configurar en Fuentes documentales</Link>
  );

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
    .sort((a, b) => Number(b.coincide) - Number(a.coincide));

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <FolderOpen className="w-3.5 h-3.5 text-primary" /> Carpeta principal: <b className="text-carbon-dark">{base.handle.name}</b>
      </p>
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
                  {c.coincide && <span className="ml-auto shrink-0 px-2 py-0.5 rounded-full bg-sage-lighter text-sage-darker text-[10px] font-bold">Coincide con la empresa</span>}
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
        {onManual && <button type="button" onClick={onManual} className="font-bold text-slate-500 hover:underline">Elegir desde otra ubicación</button>}
      </div>
    </div>
  );
};
