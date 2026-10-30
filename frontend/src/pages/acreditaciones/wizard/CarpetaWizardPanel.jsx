import { FolderOpen, KeyRound, X } from "lucide-react";
import { PanelCarpetaEmpresa } from "../../../components/empresas/PanelCarpetaEmpresa";

// Vista previa (solo consulta) de la carpeta local de la empresa elegida en el paso Empresa: queda
// abierta mientras se avanza por los pasos. En pantallas anchas es una columna fija a la izquierda;
// en angostas, una ventana. No escribe nada ni usa IA.
//  - carpeta: useCarpetaWizard (handle de la carpeta de la empresa y su permiso).
//  - abrirCarpeta: subcarpeta a desplegar según el paso (p. ej. la del personal).
export const CarpetaWizardPanel = ({ carpeta, etiqueta, mandanteId, abrirCarpeta = null, onCerrar }) => {
  let contenido;
  if (!carpeta.soportado) {
    contenido = <p className="m-auto p-6 text-xs text-slate-500">Este navegador no permite leer carpetas locales.</p>;
  } else if (!carpeta.handle) {
    contenido = <p className="m-auto p-6 text-xs text-slate-500">No hay acceso a la carpeta en este navegador: vuelva a elegirla en el paso Empresa.</p>;
  } else if (carpeta.permiso !== "granted") {
    contenido = (
      <div className="m-auto p-6 text-center space-y-2">
        <p className="text-xs text-slate-600">El navegador necesita su permiso para leer la carpeta.</p>
        <button type="button" onClick={carpeta.reautorizar}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-carbon-dark hover:bg-slate-50">
          <KeyRound className="w-3.5 h-3.5" /> Autorizar carpeta
        </button>
        {carpeta.error && <p className="text-[11px] text-red-600">{carpeta.error}</p>}
      </div>
    );
  } else {
    contenido = (
      <PanelCarpetaEmpresa handle={carpeta.handle} ruta="" titulo={etiqueta} mandanteId={mandanteId}
        sinIA abrirCarpeta={abrirCarpeta} />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex p-4 bg-black/40 xl:sticky xl:inset-auto xl:top-4 xl:z-auto xl:p-0 xl:bg-transparent" onClick={onCerrar}>
      <div className="w-full h-full xl:h-[82vh] flex flex-col gap-2 p-3 rounded-2xl bg-white border border-gray-100 shadow-xl xl:shadow-card"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-primary shrink-0" />
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Carpeta de la empresa</h3>
          <span className="text-[11px] text-slate-400">Solo consulta</span>
          <button type="button" onClick={onCerrar} className="ml-auto p-1 rounded-lg hover:bg-slate-100" aria-label="Ocultar carpeta">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{contenido}</div>
      </div>
    </div>
  );
};
