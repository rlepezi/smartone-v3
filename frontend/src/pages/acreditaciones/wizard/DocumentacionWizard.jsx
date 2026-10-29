import { useCallback } from "react";
import { FolderOpen } from "lucide-react";
import { ConfiguracionRepositorio } from "../../../components/expedientes/documentacion/ConfiguracionRepositorio";
import { SelectorCarpetaEmpresa } from "../../../components/expedientes/documentacion/SelectorCarpetaEmpresa";
import { useCarpetaBase } from "../../../hooks/useCarpetaBase";
import { etiquetaDeUrl, MAPEO_VACIO } from "../../../utils/repositorioDocumental";

// Paso Empresa de Nueva Acreditación: sección opcional para dejar configurada desde ya la carpeta
// del futuro expediente. El expediente aún no existe: el valor vive en el estado del asistente y el
// handle local en una clave temporal (ver useCarpetaWizard); se guarda en el expediente al confirmar.
// La carpeta local se elige entre las subcarpetas de la carpeta principal del Mandante (Fuentes
// documentales); el selector del navegador queda como alternativa.
// `empresa`: la elegida; la carpeta debe ser suya (si no, advertencia y el asistente no avanza).
export const DocumentacionWizard = ({ valor, carpeta, onCambiar, empresa, usuarioId, mandanteId, puedeConfigurarBase }) => {
  const base = useCarpetaBase(usuarioId, mandanteId);

  const aplicar = useCallback((reg) => {
    if (!reg) return;
    const misma = valor?.tipo === "local" && valor.etiqueta === reg.handle.name;
    onCambiar({ tipo: "local", etiqueta: reg.handle.name, url: null, mapeo: misma ? valor.mapeo : MAPEO_VACIO });
  }, [valor, onCambiar]);

  const vincular = async () => aplicar(await carpeta.vincular());
  const { subcarpeta } = base;
  const { vincularHandle } = carpeta;
  const elegirSubcarpeta = useCallback(async (nombre) => {
    aplicar(await vincularHandle(await subcarpeta(nombre)));
  }, [aplicar, vincularHandle, subcarpeta]);

  const quitar = async () => {
    await carpeta.olvidar();
    onCambiar(null);
  };
  return (
    <section className="pt-5 mt-5 border-t border-slate-100 space-y-2">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-bold text-carbon-dark"><FolderOpen className="w-4 h-4 text-primary" /> Documentación del expediente (opcional)</h4>
        <p className="text-xs text-slate-500">Indica dónde está la carpeta con los documentos de esta empresa. Puedes hacerlo ahora o después desde el expediente.</p>
      </div>
      <ConfiguracionRepositorio
        variante="compacto"
        valor={valor}
        soportado={carpeta.soportado}
        carpetaNombre={carpeta.handle?.name || null}
        permiso={carpeta.permiso}
        onVincular={vincular}
        onReautorizar={carpeta.reautorizar}
        onGuardarSharePoint={async (url) => onCambiar({ tipo: "sharepoint", etiqueta: etiquetaDeUrl(url), url, mapeo: valor?.mapeo || MAPEO_VACIO })}
        onQuitar={quitar}
        error={carpeta.error}
        empresa={empresa}
        selectorLocal={(
          <SelectorCarpetaEmpresa
            base={base}
            empresa={empresa}
            seleccionada={valor?.tipo === "local" ? valor.etiqueta : null}
            onElegir={elegirSubcarpeta}
            onManual={vincular}
            puedeConfigurarBase={puedeConfigurarBase}
          />
        )}
      />
    </section>
  );
};
