import { useCallback, useEffect, useState } from "react";
import {
  soportaSelectorCarpeta, seleccionarCarpeta, obtenerCarpetaWizard, guardarCarpetaWizard, quitarCarpetaWizard,
  estadoPermiso, pedirPermiso,
} from "../services/fuentes/carpetaLocal";

// Carpeta local elegida en el asistente Nueva Acreditación, antes de que exista el expediente:
// handle en IndexedDB bajo una clave temporal (usuario + sesión del asistente). Al crear el
// expediente se traspasa con traspasarCarpetaWizard. Mismo contrato que useCarpetaExpediente.
export const useCarpetaWizard = (usuarioId, sesionId) => {
  const soportado = soportaSelectorCarpeta();
  const [registro, setRegistro] = useState(null);
  const [permiso, setPermiso] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!soportado || !usuarioId || !sesionId) return undefined;
    let vigente = true;
    obtenerCarpetaWizard(usuarioId, sesionId)
      .then(async (reg) => {
        const estado = reg ? await estadoPermiso(reg.handle).catch(() => "prompt") : null;
        if (!vigente) return;
        setRegistro(reg);
        setPermiso(estado);
      })
      .catch(() => { if (vigente) setRegistro(null); });
    return () => { vigente = false; };
  }, [soportado, usuarioId, sesionId]);

  // Recuerda `handle` como la carpeta del asistente (p. ej. una subcarpeta de la carpeta principal
  // del Mandante). Devuelve el registro, o null si falló.
  const vincularHandle = useCallback(async (handle) => {
    setError(null);
    try {
      const reg = await guardarCarpetaWizard(usuarioId, sesionId, handle);
      setRegistro(reg);
      setPermiso("granted");
      return reg;
    } catch (err) {
      setError(err.message || "No se pudo vincular la carpeta.");
      return null;
    }
  }, [usuarioId, sesionId]);

  // Con el selector del navegador (debe llamarse desde un clic). Devuelve el registro, o null si se
  // canceló.
  const vincular = useCallback(async () => {
    setError(null);
    try {
      const handle = await seleccionarCarpeta(registro?.handle || null);
      return handle ? vincularHandle(handle) : null;
    } catch (err) {
      setError(err.message || "No se pudo vincular la carpeta.");
      return null;
    }
  }, [registro, vincularHandle]);

  const reautorizar = useCallback(async () => {
    setError(null);
    if (!registro) return false;
    const ok = await pedirPermiso(registro.handle).catch(() => false);
    setPermiso(ok ? "granted" : "prompt");
    if (!ok) setError("El navegador no concedió el acceso a la carpeta.");
    return ok;
  }, [registro]);

  const olvidar = useCallback(async () => {
    if (usuarioId && sesionId) await quitarCarpetaWizard(usuarioId, sesionId).catch(() => null);
    setRegistro(null);
    setPermiso(null);
  }, [usuarioId, sesionId]);

  return {
    soportado, error,
    handle: registro?.handle || null,
    permiso,
    lista: Boolean(registro) && permiso === "granted",
    vincular, vincularHandle, reautorizar, olvidar,
  };
};
