import { useEffect, useState } from "react";
import { fuenteDocumentalService } from "../services/fuenteDocumentalService";
import { carpetaEmpresaService } from "../services/carpetaEmpresaService";
import { useCarpetaBase } from "./useCarpetaBase";

// Fuente documental del Mandante para "Nueva Empresa desde carpeta": la fuente activa, su raíz en este
// navegador (useCarpetaBase) y las Carpetas de empresa ya registradas (para deshabilitarlas).
// `activo` en false no consulta nada (rol sin permiso o sin Mandante).
export const useFuenteNuevaEmpresa = (usuarioId, mandanteId, activo) => {
  const [estado, setEstado] = useState({ clave: null, fuente: undefined, registradas: [] });
  const clave = activo && mandanteId ? mandanteId : null;
  useEffect(() => {
    if (!clave) return undefined;
    let vigente = true;
    Promise.all([
      fuenteDocumentalService.activa(clave).catch(() => null),
      carpetaEmpresaService.listar({ mandanteId: clave }).catch(() => []),
    ]).then(([fuente, registradas]) => { if (vigente) setEstado({ clave, fuente: fuente || null, registradas: registradas || [] }); });
    return () => { vigente = false; };
  }, [clave]);
  const actual = estado.clave === clave ? estado : { fuente: undefined, registradas: [] };
  const base = useCarpetaBase(usuarioId, clave, { etiquetaFuente: actual.fuente?.tipo === "local" ? actual.fuente.etiqueta : null });
  const autorizada = actual.fuente?.tipo === "local" && Boolean(base.handle) && base.coincideFuente && base.permiso === "granted";
  return { fuente: actual.fuente, registradas: actual.registradas, base, autorizada };
};
