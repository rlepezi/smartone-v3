import { useCallback, useEffect, useState } from "react";
import {
  soportaSelectorCarpeta, obtenerCarpetaPredeterminada, estadoPermiso, pedirPermiso, listarDirectorio,
} from "../services/fuentes/carpetaLocal";

// Carpeta principal del Mandante en ESTE navegador (Configuración → Inteligencia Artificial →
// Fuentes documentales → Carpeta local): la que contiene una subcarpeta por Empresa. Devuelve
// { soportado, cargando, handle, permiso, subcarpetas, error, autorizar, subcarpeta }:
//  - subcarpetas: [{ nombre }] de primer nivel (solo con el permiso concedido), o null.
//  - autorizar(): pide el permiso de lectura (debe llamarse desde un clic).
//  - subcarpeta(nombre): handle de esa subcarpeta, para vincularla como carpeta del expediente.
export const useCarpetaBase = (usuarioId, mandanteId) => {
  const soportado = soportaSelectorCarpeta();
  const clave = soportado && usuarioId && mandanteId ? `${usuarioId}|${mandanteId}` : null;
  const [estado, setEstado] = useState({ clave: null, handle: null, permiso: null, subcarpetas: null, error: null });

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
  }, [clave, usuarioId, mandanteId, leer]);

  const actual = estado.clave === clave ? estado : null;

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

  const subcarpeta = useCallback((nombre) => actual.handle.getDirectoryHandle(nombre), [actual]);

  return {
    soportado,
    cargando: Boolean(clave) && !actual,
    handle: actual?.handle || null,
    permiso: actual?.permiso || null,
    subcarpetas: actual?.subcarpetas || null,
    error: actual?.error || null,
    autorizar, subcarpeta,
  };
};
