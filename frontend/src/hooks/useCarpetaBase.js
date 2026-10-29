import { useCallback, useEffect, useState } from "react";
import {
  soportaSelectorCarpeta, obtenerCarpetaPredeterminada, guardarCarpetaPredeterminada, estadoPermiso, pedirPermiso,
  listarDirectorio, seleccionarCarpeta,
} from "../services/fuentes/carpetaLocal";

// Raíz de la fuente documental local del Mandante en ESTE navegador (handle en IndexedDB, clave
// `revisionesIA:carpeta:${usuarioId}:${mandanteId}`): la carpeta que contiene una subcarpeta por
// empresa y proyecto. Devuelve { soportado, cargando, handle, permiso, subcarpetas, error,
// coincideFuente, autorizar, autorizarFuente, subcarpeta }:
//  - subcarpetas: [{ nombre }] de primer nivel (solo con el permiso concedido y la raíz correcta).
//  - etiquetaFuente (opcional): nombre de la carpeta registrada como fuente en el backend; si la raíz
//    de este navegador es otra, `coincideFuente` es false y no se listan sus subcarpetas.
//  - autorizar(): pide el permiso de lectura (debe llamarse desde un clic).
//  - autorizarFuente(): elige la raíz con el selector del navegador (desde un clic) y la recuerda
//    en este navegador; con `etiquetaFuente`, debe ser esa carpeta. No escribe en el servidor.
//  - subcarpeta(nombre): handle de esa subcarpeta.
export const useCarpetaBase = (usuarioId, mandanteId, { etiquetaFuente = null } = {}) => {
  const soportado = soportaSelectorCarpeta();
  const clave = soportado && usuarioId && mandanteId ? `${usuarioId}|${mandanteId}` : null;
  const [estado, setEstado] = useState({ clave: null, handle: null, permiso: null, subcarpetas: null, error: null });
  const [recarga, setRecarga] = useState(0);

  const leer = useCallback(async (handle) => {
    const contenido = await listarDirectorio(handle, "");
    return (contenido?.carpetas || []).map((c) => ({ nombre: c.nombre }));
  }, []);

  useEffect(() => {
    if (!clave) return undefined;
    let vigente = true;
    (async () => {
      try {
        const reg = await obtenerCarpetaPredeterminada(usuarioId, mandanteId);
        if (!reg) return { clave, handle: null, permiso: null, subcarpetas: null, error: null };
        const permiso = await estadoPermiso(reg.handle).catch(() => "prompt");
        const subcarpetas = permiso === "granted" ? await leer(reg.handle) : null;
        return { clave, handle: reg.handle, permiso, subcarpetas, error: null };
      } catch {
        return { clave, handle: null, permiso: null, subcarpetas: null, error: "No se pudo leer la carpeta principal (quizás se movió o se eliminó)." };
      }
    })().then((nuevo) => { if (vigente) setEstado(nuevo); });
    return () => { vigente = false; };
  }, [clave, usuarioId, mandanteId, leer, recarga]);

  const actual = estado.clave === clave ? estado : null;
  const coincideFuente = Boolean(actual?.handle) && (!etiquetaFuente || actual.handle.name === etiquetaFuente);

  const autorizar = useCallback(async () => {
    if (!actual?.handle) return false;
    const ok = await pedirPermiso(actual.handle).catch(() => false);
    if (!ok) {
      setEstado((e) => ({ ...e, permiso: "prompt", error: "El navegador no concedió el acceso a la carpeta principal." }));
      return false;
    }
    const subcarpetas = await leer(actual.handle).catch(() => []);
    setEstado((e) => ({ ...e, permiso: "granted", subcarpetas, error: null }));
    return true;
  }, [actual, leer]);

  const autorizarFuente = useCallback(async () => {
    try {
      const handle = await seleccionarCarpeta(actual?.handle || null);
      if (!handle) return false;
      if (etiquetaFuente && handle.name !== etiquetaFuente) {
        setEstado((e) => ({ ...e, error: `Elija la carpeta «${etiquetaFuente}» (la fuente documental del Mandante); eligió «${handle.name}».` }));
        return false;
      }
      await guardarCarpetaPredeterminada(usuarioId, mandanteId, handle);
      setRecarga((n) => n + 1);
      return true;
    } catch {
      setEstado((e) => ({ ...e, error: "Este navegador no permite recordar la carpeta (almacenamiento local no disponible)." }));
      return false;
    }
  }, [actual, etiquetaFuente, usuarioId, mandanteId]);

  const subcarpeta = useCallback((nombre) => actual.handle.getDirectoryHandle(nombre), [actual]);

  return {
    soportado,
    cargando: Boolean(clave) && !actual,
    handle: actual?.handle || null,
    permiso: actual?.permiso || null,
    subcarpetas: coincideFuente ? actual?.subcarpetas || null : null,
    error: actual?.error || null,
    coincideFuente,
    autorizar, autorizarFuente, subcarpeta,
  };
};
