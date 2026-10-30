import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Cloud, FolderOpen, X } from "lucide-react";
import { SelectorCarpetaEmpresa } from "../../../components/expedientes/documentacion/SelectorCarpetaEmpresa";
import { useCarpetaBase } from "../../../hooks/useCarpetaBase";
import { fuenteDocumentalService } from "../../../services/fuenteDocumentalService";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";
import { carpetasLibresDeEmpresa } from "../../../utils/datosEmpresaCarpeta";
import { Toast } from "../../../components/shared/Toast";
import { MAPEO_VACIO } from "../../../utils/repositorioDocumental";
import { CLASE_SECUNDARIO } from "../../../components/expedientes/documentacion/estilos";

// Paso Empresa de Nueva Acreditación: carpeta de la empresa (opcional), elegida entre las subcarpetas
// de la FUENTE DOCUMENTAL del Mandante (primero las que pasan la validación estricta). El expediente
// aún no existe: el valor vive en el estado del asistente ({ tipo, ruta, etiqueta, url, fuenteId,
// mapeo }); al confirmar se vincula la Carpeta de empresa (find-or-create). El handle de la
// subcarpeta queda en la clave temporal del asistente (useCarpetaWizard) para el paso de personal.
// Sin fuente, se avisa y el asistente continúa sin carpeta.
//  - errorCarpeta: mensaje del backend al verificar la carpeta (p. ej. ya vinculada a otro
//    expediente activo); mientras siga elegida, el asistente no avanza.
//  - proyectoId: proyecto de la acreditación (si ya se eligió). Las Carpetas de empresa LIBRES de la
//    empresa (sin expediente; sin proyecto o del mismo) se ofrecen primero: con una sola, viene
//    preseleccionada ("Carpeta registrada al crear la empresa").
export const DocumentacionWizard = ({ valor, carpeta, onCambiar, empresa, usuarioId, mandanteId, puedeConfigurarBase, errorCarpeta = null, verificando = false, proyectoId = null }) => {
  const [fuente, setFuente] = useState(undefined); // undefined: cargando
  const [aviso, setAviso] = useState(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const avisarAuto = useCallback((nombre, motivo) => setAviso(motivo === "registrada"
    ? `Carpeta registrada al crear la empresa: «${nombre}».`
    : `Se eligió automáticamente la carpeta «${nombre}» (única de la empresa en la fuente documental).`), []);
  // Carpetas de empresa libres ya registradas a esta empresa.
  const [libres, setLibres] = useState({ clave: null, rutas: [] });
  const claveLibres = `${mandanteId}|${empresa?.id}|${proyectoId || ""}`;
  useEffect(() => {
    let vigente = true;
    carpetaEmpresaService.listar({ mandanteId })
      .then((l) => { if (vigente) setLibres({ clave: claveLibres, rutas: carpetasLibresDeEmpresa(l, empresa?.id, proyectoId).map((c) => c.ruta) }); })
      .catch(() => { if (vigente) setLibres({ clave: claveLibres, rutas: [] }); });
    return () => { vigente = false; };
  }, [claveLibres, mandanteId, empresa?.id, proyectoId]);
  const rutasLibres = libres.clave === claveLibres ? libres.rutas : null;

  useEffect(() => {
    let vigente = true;
    fuenteDocumentalService.activa(mandanteId)
      .then((f) => { if (vigente) setFuente(f || null); })
      .catch(() => { if (vigente) setFuente(null); });
    return () => { vigente = false; };
  }, [mandanteId]);

  const base = useCarpetaBase(usuarioId, mandanteId, { etiquetaFuente: fuente?.tipo === "local" ? fuente.etiqueta : null });
  const mapeoDe = useCallback((ruta) => (valor?.ruta === ruta ? valor.mapeo : MAPEO_VACIO), [valor]);
  const { subcarpeta } = base;
  const { vincularHandle } = carpeta;
  const elegir = useCallback(async (nombre) => {
    // El handle de la subcarpeta, para listar el personal en el paso Asignaciones.
    await vincularHandle(await subcarpeta(nombre));
    onCambiar({ tipo: "local", ruta: nombre, etiqueta: nombre, url: null, fuenteId: fuente?.id || null, mapeo: mapeoDe(nombre) });
  }, [vincularHandle, subcarpeta, onCambiar, fuente, mapeoDe]);
  const elegirUrl = (url) => {
    const ruta = decodeURIComponent(url.split("?")[0].replace(/\/+$/, "").split("/").pop() || "");
    onCambiar({ tipo: "sharepoint", ruta, etiqueta: ruta, url, fuenteId: fuente?.id || null, mapeo: mapeoDe(ruta) });
  };
  const quitar = async () => {
    await carpeta.olvidar();
    onCambiar(null);
  };

  return (
    <section className="pt-5 mt-5 border-t border-slate-100 space-y-2">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-bold text-carbon-dark"><FolderOpen className="w-4 h-4 text-primary" /> Carpeta de la empresa (opcional)</h4>
        <p className="text-xs text-slate-500">Elige la carpeta de esta empresa en la fuente documental del Mandante. Puedes hacerlo ahora o después desde el expediente.</p>
      </div>
      {valor && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 text-xs">
          {valor.tipo === "sharepoint" ? <Cloud className="w-4 h-4 text-primary" /> : <FolderOpen className="w-4 h-4 text-primary" />}
          <span className="font-bold text-carbon-dark mr-auto">
            {valor.ruta}
            {rutasLibres?.some((r) => r.toLowerCase() === valor.ruta.toLowerCase()) && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-sage-darker"><CheckCircle2 className="w-3.5 h-3.5" /> Carpeta registrada al crear la empresa</span>
            )}
          </span>
          {verificando && <span className="text-slate-400">Verificando...</span>}
          <button type="button" onClick={quitar} className={CLASE_SECUNDARIO}><X className="w-3.5 h-3.5" /> Quitar</button>
        </div>
      )}
      {errorCarpeta && <p role="alert" className="text-xs text-red-600">{errorCarpeta}</p>}
      {fuente === undefined || rutasLibres === null ? (
        <p className="text-xs text-slate-400">Buscando la fuente documental...</p>
      ) : (
        <>
          <SelectorCarpetaEmpresa
            fuente={fuente}
            base={base}
            empresa={empresa}
            seleccionada={valor?.ruta || null}
            onElegir={elegir}
            onElegirUrl={elegirUrl}
            puedeConfigurarBase={puedeConfigurarBase}
            onAutoElegida={avisarAuto}
            registradas={rutasLibres || []}
          />
          {!fuente && <p className="text-xs text-slate-500">Puedes continuar sin vincular la carpeta.</p>}
        </>
      )}
      <Toast mensaje={aviso} onCerrar={cerrarAviso} />
    </section>
  );
};
