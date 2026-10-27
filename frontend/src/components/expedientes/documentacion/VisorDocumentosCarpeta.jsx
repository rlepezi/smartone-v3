import { useEffect, useState } from "react";
import { ChevronRight, Eye, File, Folder, FolderSearch } from "lucide-react";
import { listarDirectorio, obtenerArchivo } from "../../../services/fuentes/carpetaLocal";
import { claveTexto, esPosibleListado } from "../../../utils/carpetasSujetos";
import { formatTamano } from "../../../utils/repositorioDocumental";
import { VisorArchivo } from "./VisorArchivo";

// Última elección del grupo "Listados" durante la sesión del asistente: al crear varias personas
// seguidas, el listado queda abierto.
const CLAVE_LISTADO = "smartone.wizard.listadoElegido";
const leerListado = () => {
  try {
    return sessionStorage.getItem(CLAVE_LISTADO);
  } catch {
    return null;
  }
};
const guardarListado = (ruta) => {
  try {
    sessionStorage.setItem(CLAVE_LISTADO, ruta);
  } catch {
    // Sin almacenamiento de sesión: solo no se recuerda.
  }
};

// Palabras de un documento de identidad (persona) o del vehículo (maquinaria), por token.
const IDENTIDAD = { persona: ["cedula", "carnet", "ci", "identidad"], recurso: ["padron", "permiso"] };
const esDeIdentidad = (nombre, tipo) => {
  const tokens = claveTexto(nombre).split(" ");
  return (IDENTIDAD[tipo] || []).some((p) => tokens.includes(p));
};

// Archivo por defecto: 1) de identidad en la carpeta propia; 2) el listado elegido antes en esta
// sesión; 3) el primer "Posible listado"; 4) el primero de la carpeta propia.
const porDefecto = (listados, propios, tipo) => {
  const identidad = propios.find((a) => esDeIdentidad(a.nombre, tipo));
  if (identidad) return identidad.ruta;
  const recordado = leerListado();
  if (recordado && listados.some((a) => a.ruta === recordado)) return recordado;
  return listados[0]?.ruta || propios[0]?.ruta || "";
};

// Selector de documento (grupos "Listados" y "Carpeta de <nombre>") con su visor, para leer el RUT
// o la patente al crear una persona o maquinaria desde su carpeta. Solo lectura.
export const VisorDocumentosCarpeta = ({
  handle, tipo, rutaListados, rutaPropia, nombrePropio, nombreBuscado, onRut, onSugerenciaRut,
}) => {
  const [grupos, setGrupos] = useState(null); // { listados, propios }
  const [elegido, setElegido] = useState("");
  const [archivo, setArchivo] = useState(null);
  // Explorador: cualquier archivo de la carpeta vinculada (los abiertos quedan en "Elegidos").
  const [explorando, setExplorando] = useState(false);
  const [rutaExplorada, setRutaExplorada] = useState(rutaPropia || rutaListados || "");
  const [contenido, setContenido] = useState(null);
  const [elegidos, setElegidos] = useState([]);

  useEffect(() => {
    let vigente = true;
    const leer = (ruta) => (ruta ? listarDirectorio(handle, ruta).then((l) => l?.archivos || []).catch(() => []) : Promise.resolve([]));
    Promise.all([leer(rutaListados), leer(rutaPropia)]).then(([enCarpeta, propios]) => {
      if (!vigente) return;
      const listados = enCarpeta.filter((a) => esPosibleListado(a.nombre));
      setGrupos({ listados, propios });
      setElegido(porDefecto(listados, propios, tipo));
    });
    return () => { vigente = false; };
  }, [handle, rutaListados, rutaPropia, tipo]);

  useEffect(() => {
    if (!elegido) return undefined;
    let vigente = true;
    obtenerArchivo(handle, elegido).then((f) => { if (vigente) setArchivo(f); });
    return () => { vigente = false; };
  }, [handle, elegido]);

  useEffect(() => {
    if (!explorando) return undefined;
    let vigente = true;
    listarDirectorio(handle, rutaExplorada)
      .then((l) => { if (vigente) setContenido(l || { carpetas: [], archivos: [] }); })
      .catch(() => { if (vigente) setContenido({ carpetas: [], archivos: [] }); });
    return () => { vigente = false; };
  }, [explorando, handle, rutaExplorada]);

  const elegir = (ruta) => {
    setElegido(ruta);
    setArchivo(null);
    if (grupos?.listados.some((a) => a.ruta === ruta)) guardarListado(ruta);
  };
  const entrar = (ruta) => {
    setContenido(null);
    setRutaExplorada(ruta);
  };
  const abrirExplorado = (a) => {
    setElegidos((prev) => (prev.some((x) => x.ruta === a.ruta) ? prev : [...prev, a]));
    setExplorando(false);
    elegir(a.ruta);
  };

  if (!grupos) return <p className="p-6 text-xs text-slate-400">Leyendo la carpeta...</p>;
  const enGrupos = new Set([...grupos.listados, ...grupos.propios].map((a) => a.ruta));
  const extras = elegidos.filter((a) => !enGrupos.has(a.ruta));
  const vacio = !grupos.listados.length && !grupos.propios.length && !extras.length;
  const partes = rutaExplorada.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
        <label htmlFor="visor-documento" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Documento</label>
        <div className="flex gap-2">
          <select id="visor-documento" value={elegido} onChange={(e) => { setExplorando(false); elegir(e.target.value); }} disabled={vacio}
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs">
            {vacio && <option value="">No hay listados ni archivos: use «Explorar carpetas»</option>}
            {grupos.listados.length > 0 && (
              <optgroup label="Listados">
                {grupos.listados.map((a) => <option key={a.ruta} value={a.ruta}>{a.nombre}</option>)}
              </optgroup>
            )}
            {grupos.propios.length > 0 && (
              <optgroup label={`Carpeta de ${nombrePropio || "la persona"}`}>
                {grupos.propios.map((a) => <option key={a.ruta} value={a.ruta}>{a.nombre}</option>)}
              </optgroup>
            )}
            {extras.length > 0 && (
              <optgroup label="Elegidos">
                {extras.map((a) => <option key={a.ruta} value={a.ruta}>{a.ruta}</option>)}
              </optgroup>
            )}
          </select>
          <button type="button" onClick={() => setExplorando((v) => !v)} aria-pressed={explorando}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${explorando ? "border-primary bg-primary-lighter text-primary-dark" : "border-slate-200 bg-white text-carbon-dark hover:bg-slate-50"}`}>
            <FolderSearch className="w-3.5 h-3.5" /> Explorar carpetas
          </button>
        </div>
      </div>
      {explorando ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <nav className="flex flex-wrap items-center gap-1 px-3 py-2 text-[11px] text-slate-500 border-b border-slate-100" aria-label="Ruta">
            <button type="button" onClick={() => entrar("")} className="font-bold text-carbon-dark hover:underline">{handle.name}</button>
            {partes.map((p, i) => (
              <span key={`${p}-${i}`} className="flex items-center gap-1"><ChevronRight className="w-3 h-3" />
                <button type="button" onClick={() => entrar(partes.slice(0, i + 1).join("/"))} className="hover:underline">{p}</button>
              </span>
            ))}
          </nav>
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {!contenido && <li className="p-3 text-xs text-slate-400">Leyendo...</li>}
            {contenido && !contenido.carpetas.length && !contenido.archivos.length && <li className="p-3 text-xs text-slate-400">La carpeta está vacía.</li>}
            {contenido?.carpetas.map((c) => (
              <li key={c.ruta}>
                <button type="button" onClick={() => entrar(c.ruta)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-carbon-dark hover:bg-slate-50">
                  <Folder className="w-4 h-4 text-primary" /> <span className="truncate">{c.nombre}</span>
                </button>
              </li>
            ))}
            {contenido?.archivos.map((a) => (
              <li key={a.ruta}>
                <button type="button" onClick={() => abrirExplorado(a)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-primary-lighter/50">
                  <File className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-carbon-dark">{a.nombre}</span>
                  {esPosibleListado(a.nombre) && <span className="shrink-0 px-1.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-700">Posible listado</span>}
                  <span className="shrink-0 text-[10px] text-slate-400">{formatTamano(a.tamanoBytes)}</span>
                  <Eye className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {vacio && !archivo ? (
            <div className="m-auto text-center space-y-2 p-6">
              <p className="text-xs text-slate-500">No hay listados en la carpeta del personal ni archivos propios.</p>
              <button type="button" onClick={() => setExplorando(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-carbon-dark hover:bg-slate-50">
                <FolderSearch className="w-3.5 h-3.5" /> Explorar carpetas
              </button>
            </div>
          ) : (
            <VisorArchivo archivo={archivo} nombreBuscado={nombreBuscado} onRut={onRut} onSugerenciaRut={onSugerenciaRut} />
          )}
        </div>
      )}
    </div>
  );
};
