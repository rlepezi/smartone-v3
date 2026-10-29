import { useEffect, useState } from "react";
import { Folder, FolderOpen } from "lucide-react";
import { repositorioDocumentalService } from "../../../services/repositorioDocumentalService";
import { leerDosNiveles } from "../../../services/fuentes/carpetaLocal";
import { useCarpetaExpediente } from "../../../hooks/useCarpetaExpediente";
import { formatFecha } from "../../../utils/fechas";
import { ConfiguracionRepositorio } from "./ConfiguracionRepositorio";

// Pestaña "Documentación" del Expediente: dónde está su documentación (carpeta local o SharePoint).
// La carpeta local se vincula en cada equipo (el navegador recuerda el acceso; en SmartOne solo
// queda su nombre); es la misma carpeta que usa la pestaña Revisiones IA. Con la carpeta vinculada
// se muestra el mapeo de carpetas (personal y maquinarias) y la estructura de primer y segundo nivel.
// `empresa`: la del expediente; la carpeta debe ser suya (si no, advertencia y no se guarda).
export const TabDocumentacion = ({ expedienteId, usuarioId, datos, onActualizado, empresa = null }) => {
  const repo = datos?.repositorioDocumental || null;
  const puedeEditar = Boolean(datos?.puedeEditar);
  const carpeta = useCarpetaExpediente(usuarioId, expedienteId, { onRepositorio: onActualizado, empresa });
  const [error, setError] = useState(null);
  const [niveles, setNiveles] = useState(null);

  // Estructura detectada (primer y segundo nivel), solo con la carpeta local vinculada.
  useEffect(() => {
    if (!carpeta.lista) return undefined;
    let vigente = true;
    leerDosNiveles(carpeta.handle)
      .then((n) => { if (vigente) setNiveles(n); })
      .catch(() => { if (vigente) setNiveles([]); });
    return () => { vigente = false; };
  }, [carpeta.lista, carpeta.handle]);

  const guardarSharePoint = async (url) => {
    setError(null);
    onActualizado(await repositorioDocumentalService.actualizar(expedienteId, { tipo: "sharepoint", url, mapeo: repo?.mapeo }));
  };

  const quitar = async () => {
    setError(null);
    try {
      await carpeta.olvidar();
      onActualizado(await repositorioDocumentalService.actualizar(expedienteId, { tipo: null }));
      setNiveles(null);
    } catch (err) {
      setError(err.message || "No se pudo quitar la configuración.");
    }
  };


  return (
    <div className="space-y-5">
      <div>
        <h3 className="flex items-center gap-2 text-base font-bold text-carbon-dark"><FolderOpen className="w-4 h-4 text-primary" /> Documentación del expediente</h3>
        <p className="text-xs text-slate-500">
          Dónde está la documentación de esta empresa. Desde Empresa, Personas y Recursos podrá ver y abrir los archivos mientras evalúa.
        </p>
        {repo && (
          <p className="text-[11px] text-slate-400 mt-1">
            Configurado: <b className="text-slate-600">{repo.etiqueta}</b> ({repo.tipo === "local" ? "carpeta local" : "SharePoint"}) · {repo.updatedByNombre || "—"} · {formatFecha(repo.updatedAt)}
          </p>
        )}
      </div>

      <ConfiguracionRepositorio
        valor={repo}
        soportado={carpeta.soportado}
        carpetaNombre={carpeta.handle?.name || null}
        permiso={carpeta.permiso}
        onVincular={carpeta.vincular}
        onReautorizar={carpeta.reautorizar}
        onGuardarSharePoint={guardarSharePoint}
        onQuitar={quitar}
        puedeEditar={puedeEditar}
        error={error || carpeta.error}
        empresa={empresa}
        carpetaRechazada={carpeta.rechazada}
      >
        {carpeta.lista && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estructura de la carpeta</h4>
            {!niveles ? <p className="text-xs text-slate-400">Leyendo la carpeta...</p> : niveles.length === 0 ? (
              <p className="text-xs text-slate-400">La carpeta no tiene subcarpetas.</p>
            ) : (
              <ul className="text-xs space-y-1 max-h-80 overflow-y-auto">
                {niveles.map((n) => (
                  <li key={n.ruta}>
                    <span className="flex items-center gap-1.5 font-semibold text-carbon-dark"><Folder className="w-3.5 h-3.5 text-primary" /> {n.nombre}</span>
                    {n.carpetas.length > 0 && (
                      <ul className="pl-6 mt-0.5 space-y-0.5 text-slate-500">
                        {n.carpetas.map((c) => <li key={c.ruta} className="flex items-center gap-1.5"><Folder className="w-3 h-3" /> {c.nombre}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </ConfiguracionRepositorio>
      {!puedeEditar && <p className="text-[11px] text-slate-400">Solo lectura: su rol no puede cambiar el repositorio documental.</p>}
    </div>
  );
};
