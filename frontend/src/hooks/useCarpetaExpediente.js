import { useCallback, useEffect, useState } from "react";
import {
  soportaSelectorCarpeta, obtenerCarpetaExpediente, vincularCarpetaExpediente, quitarCarpetaExpediente,
  estadoPermiso, pedirPermiso,
} from "../services/fuentes/carpetaLocal";
import { repositorioDocumentalService } from "../services/repositorioDocumentalService";

// Carpeta local del Expediente en ESTE navegador (handle en IndexedDB, misma clave que Revisiones IA)
// y su permiso. `vincular` (desde un clic) elige la carpeta, la recuerda y deja su nombre como
// repositorio del expediente; `reautorizar` vuelve a pedir el permiso de lectura.
export const useCarpetaExpediente = (usuarioId, expedienteId, { onRepositorio } = {}) => {
  const soportado = soportaSelectorCarpeta();
  const [registro, setRegistro] = useState(null);
  const [permiso, setPermiso] = useState(null);
  const [cargando, setCargando] = useState(soportado);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!soportado) return undefined;
    let vigente = true;
    obtenerCarpetaExpediente(usuarioId, expedienteId)
      .then(async (reg) => {
        const estado = reg ? await estadoPermiso(reg.handle).catch(() => "prompt") : null;
        if (!vigente) return;
        setRegistro(reg);
        setPermiso(estado);
      })
      .catch(() => { if (vigente) setRegistro(null); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [soportado, usuarioId, expedienteId]);

  const vincular = useCallback(async () => {
    setError(null);
    try {
      const reg = await vincularCarpetaExpediente(usuarioId, expedienteId, registro?.handle || null);
      if (!reg) return null;
      setRegistro(reg);
      setPermiso("granted");
      const repo = await repositorioDocumentalService.actualizar(expedienteId, { tipo: "local", etiqueta: reg.handle.name });
      onRepositorio?.(repo);
      return reg;
    } catch (err) {
      setError(err.message || "No se pudo vincular la carpeta.");
      return null;
    }
  }, [usuarioId, expedienteId, registro, onRepositorio]);

  const reautorizar = useCallback(async () => {
    setError(null);
    if (!registro) return false;
    const ok = await pedirPermiso(registro.handle).catch(() => false);
    setPermiso(ok ? "granted" : "prompt");
    if (!ok) setError("El navegador no concedió el acceso a la carpeta.");
    return ok;
  }, [registro]);

  // Olvida la carpeta en este navegador (no toca archivos ni la configuración del expediente).
  const olvidar = useCallback(async () => {
    await quitarCarpetaExpediente(usuarioId, expedienteId).catch(() => null);
    setRegistro(null);
    setPermiso(null);
  }, [usuarioId, expedienteId]);

  return {
    soportado, cargando, error,
    handle: registro?.handle || null,
    permiso,
    lista: Boolean(registro) && permiso === "granted",
    vincular, reautorizar, olvidar,
  };
};
