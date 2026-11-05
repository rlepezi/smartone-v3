import { useCallback, useEffect, useState } from "react";
import { carpetaEn, listarDirectorio } from "../services/fuentes/carpetaLocal";

// Una carpeta de la fuente local (p. ej. la del proyecto) con el mismo contrato que useCarpetaBase,
// para listar SUS subcarpetas con SelectorCarpetaEmpresa: `handle` y `subcarpetas` son los de esa
// carpeta y `subcarpeta(nombre)` busca dentro de ella. Mientras la raíz no esté autorizada (o
// `ruta` es null) devuelve la raíz tal cual, para que el selector pida el permiso.
//  - base: resultado de useCarpetaBase (raíz de la fuente en este navegador).
//  - ruta: ruta relativa a la raíz ("Proyecto X").
export const useSubcarpetaBase = (base, ruta) => {
  const lista = Boolean(ruta) && Boolean(base.handle) && base.coincideFuente && base.permiso === "granted";
  const clave = lista ? `${base.handle.name}|${ruta}` : null;
  const [estado, setEstado] = useState({ clave: null, handle: null, subcarpetas: null, error: null });

  useEffect(() => {
    if (!clave) return undefined;
    let vigente = true;
    (async () => {
      const handle = await carpetaEn(base.handle, ruta);
      if (!handle) return { clave, handle: null, subcarpetas: null, error: `No se encontró la carpeta «${ruta}» en la fuente documental.` };
      const contenido = await listarDirectorio(handle, "");
      return { clave, handle, subcarpetas: (contenido?.carpetas || []).map((c) => ({ nombre: c.nombre })), error: null };
    })()
      .catch(() => ({ clave, handle: null, subcarpetas: null, error: `No se pudo leer la carpeta «${ruta}».` }))
      .then((nuevo) => { if (vigente) setEstado(nuevo); });
    return () => { vigente = false; };
  }, [clave, base.handle, ruta]);

  const actual = estado.clave === clave ? estado : null;
  const subcarpeta = useCallback((nombre) => actual.handle.getDirectoryHandle(nombre), [actual]);

  if (!lista) return { ...base, encontrada: null };
  if (!actual) return { ...base, cargando: true, encontrada: null };
  return {
    ...base,
    handle: actual.handle || base.handle,
    subcarpetas: actual.subcarpetas,
    error: actual.error,
    encontrada: Boolean(actual.handle),
    subcarpeta,
  };
};
