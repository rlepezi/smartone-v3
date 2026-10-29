import { FolderOpen } from "lucide-react";
import { ConfiguracionRepositorio } from "../../../components/expedientes/documentacion/ConfiguracionRepositorio";
import { etiquetaDeUrl, MAPEO_VACIO } from "../../../utils/repositorioDocumental";

// Paso Empresa de Nueva Acreditación: sección opcional para dejar configurada desde ya la carpeta
// del futuro expediente. El expediente aún no existe: el valor vive en el estado del asistente y el
// handle local en una clave temporal (ver useCarpetaWizard); se guarda en el expediente al confirmar.
// `empresa`: la elegida; la carpeta debe ser suya (si no, advertencia y el asistente no avanza).
export const DocumentacionWizard = ({ valor, carpeta, onCambiar, empresa }) => {
  const vincular = async () => {
    const reg = await carpeta.vincular();
    if (!reg) return;
    const misma = valor?.tipo === "local" && valor.etiqueta === reg.handle.name;
    onCambiar({ tipo: "local", etiqueta: reg.handle.name, url: null, mapeo: misma ? valor.mapeo : MAPEO_VACIO });
  };
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
      />
    </section>
  );
};
