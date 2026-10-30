import { useCallback, useEffect, useState } from "react";
import {
  soportaSelectorCarpeta, obtenerCarpetaExpediente, seleccionarCarpeta, guardarCarpetaExpediente,
  quitarCarpetaExpediente, estadoPermiso, pedirPermiso, obtenerCarpetaPredeterminada, mensajeErrorCarpeta,
} from "../services/fuentes/carpetaLocal";
import { repositorioDocumentalService } from "../services/repositorioDocumentalService";
import { carpetaEmpresaService } from "../services/carpetaEmpresaService";
import { validarCarpetaEmpresa } from "../utils/carpetaEmpresa";
import { subcarpetaUnicaDeEmpresa, puedeVincularSola } from "../services/fuentes/carpetaBase";

// Carpeta local del Expediente en ESTE navegador y su permiso. Dos modos:
//  - Fuente (`usaFuente`: el expediente tiene Carpeta de empresa, o aún no tiene carpeta): el handle
//    sale de la raíz de la fuente autorizada en este navegador (carpeta principal del Mandante, en
//    IndexedDB) con getDirectoryHandle(`rutaFuente`); no se guarda un handle por expediente.
//    Vincular (`vincularHandle`, con una subcarpeta de la raíz) llama a carpetas-empresa/vincular y
//    recarga el repositorio (`onRepositorio`). `faltaRaiz`: la fuente no está autorizada aquí.
//    `version`: cambia cuando la raíz se autoriza en este navegador (se vuelve a abrir la carpeta).
//  - Legado (expediente con la configuración anterior): handle por expediente en IndexedDB y el
//    nombre de la carpeta en el repositorio del expediente, como antes.
// Con `empresa`, la carpeta elegida debe ser de esa Empresa (validarCarpetaEmpresa): si no lo es, no
// se vincula y queda su nombre en `rechazada`. Vinculación automática (`autoVincular`, con `empresa`
// y `mandanteId`): si en la carpeta principal hay UNA sola subcarpeta de la Empresa, se vincula sola
// (en modo fuente, solo si el expediente aún no tiene carpeta y `puedeGuardar`); deja el aviso en
// `avisoAuto`.
export const useCarpetaExpediente = (usuarioId, expedienteId, {
  onRepositorio, empresa = null, mandanteId = null, configurada = null, autoVincular = false, puedeGuardar = false,
  usaFuente = false, rutaFuente = null, version = "",
} = {}) => {
  const soportado = soportaSelectorCarpeta();
  const [registro, setRegistro] = useState(null);
  const [raiz, setRaiz] = useState(null); // handle de la raíz de la fuente (modo fuente)
  const [permiso, setPermiso] = useState(null);
  const [cargando, setCargando] = useState(soportado);
  const [error, setError] = useState(null);
  const [rechazada, setRechazada] = useState(null);
  const [avisoAuto, setAvisoAuto] = useState(null);
  const [faltaRaiz, setFaltaRaiz] = useState(false);
  const intentarAuto = autoVincular && Boolean(empresa && mandanteId) &&
    (usaFuente ? puedeGuardar && !rutaFuente : puedeGuardar || Boolean(configurada));

  // Subcarpeta `ruta` de la raíz (modo fuente), o error legible.
  const derivar = useCallback(async (handleRaiz, ruta) => {
    try {
      return { handle: await handleRaiz.getDirectoryHandle(ruta) };
    } catch (err) {
      throw new Error(err?.name === "NotFoundError"
        ? `La carpeta «${ruta}» no está en «${handleRaiz.name}» en este navegador.`
        : mensajeErrorCarpeta(err, ruta), { cause: err });
    }
  }, []);

  useEffect(() => {
    if (!soportado) return undefined;
    let vigente = true;
    (async () => {
      if (usaFuente) {
        const principal = await obtenerCarpetaPredeterminada(usuarioId, mandanteId).catch(() => null);
        if (!principal) return { reg: null, estado: null, raizHandle: null, sinRaiz: true };
        let estado = await estadoPermiso(principal.handle).catch(() => "prompt");
        let reg = null;
        let aviso = null;
        if (rutaFuente && estado === "granted") reg = await derivar(principal.handle, rutaFuente);
        if (!rutaFuente && intentarAuto) {
          const unica = await subcarpetaUnicaDeEmpresa({ usuarioId, mandanteId, empresa }).catch(() => null);
          if (vigente && unica) {
            // El backend valida y bloquea si la carpeta ya está en otro expediente activo.
            const ok = await carpetaEmpresaService.vincular({ expedienteId, ruta: unica.nombre }).then(() => true).catch(() => false);
            if (ok) {
              reg = { handle: unica.handle };
              estado = "granted";
              aviso = `Se vinculó automáticamente la carpeta «${unica.nombre}» (única de la empresa en la fuente documental).`;
              onRepositorio?.(await repositorioDocumentalService.obtener(expedienteId));
            }
          }
        }
        return { reg, estado, aviso, raizHandle: principal.handle, sinRaiz: false };
      }
      let reg = await obtenerCarpetaExpediente(usuarioId, expedienteId).catch(() => null);
      let estado = reg ? await estadoPermiso(reg.handle).catch(() => "prompt") : null;
      let aviso = null;
      if (!reg && intentarAuto) {
        const unica = await subcarpetaUnicaDeEmpresa({ usuarioId, mandanteId, empresa }).catch(() => null);
        if (vigente && puedeVincularSola(unica, configurada)) {
          reg = await guardarCarpetaExpediente(usuarioId, expedienteId, unica.handle);
          estado = "granted";
          aviso = `Se vinculó automáticamente la carpeta «${unica.nombre}» (única de la empresa en la carpeta principal).`;
          if (!configurada) onRepositorio?.(await repositorioDocumentalService.actualizar(expedienteId, { tipo: "local", etiqueta: unica.nombre }));
        }
      }
      return { reg, estado, aviso, raizHandle: null, sinRaiz: false };
    })()
      .then(({ reg, estado, aviso, raizHandle, sinRaiz }) => {
        if (!vigente) return;
        setRegistro(reg);
        setPermiso(estado);
        setRaiz(raizHandle);
        setFaltaRaiz(sinRaiz);
        setError(null);
        if (aviso) setAvisoAuto(aviso);
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo abrir la carpeta."); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
    // Solo al abrir (o al cambiar de expediente o de carpeta): la vinculación automática no se
    // repite en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soportado, usuarioId, expedienteId, intentarAuto, usaFuente, rutaFuente, mandanteId, version]);

  // Vincula `handle` (en modo fuente, una subcarpeta de la raíz). Devuelve el registro, o null.
  const vincularHandle = useCallback(async (handle) => {
    setError(null);
    try {
      if (empresa && !validarCarpetaEmpresa(handle.name, empresa).valida) {
        setRechazada(handle.name);
        return null;
      }
      setRechazada(null);
      if (usaFuente) {
        await carpetaEmpresaService.vincular({ expedienteId, ruta: handle.name });
        const reg = { handle };
        setRegistro(reg);
        setPermiso("granted");
        onRepositorio?.(await repositorioDocumentalService.obtener(expedienteId));
        return reg;
      }
      const reg = await guardarCarpetaExpediente(usuarioId, expedienteId, handle);
      setRegistro(reg);
      setPermiso("granted");
      const repo = await repositorioDocumentalService.actualizar(expedienteId, { tipo: "local", etiqueta: reg.handle.name });
      onRepositorio?.(repo);
      return reg;
    } catch (err) {
      setError(err.message || "No se pudo vincular la carpeta.");
      return null;
    }
  }, [usuarioId, expedienteId, onRepositorio, empresa, usaFuente]);

  // Con el selector del navegador (debe llamarse desde un clic). Solo legado: en modo fuente la
  // carpeta se elige entre las subcarpetas de la fuente.
  const vincular = useCallback(async () => {
    if (usaFuente) return null;
    setError(null);
    try {
      const handle = await seleccionarCarpeta(registro?.handle || null);
      return handle ? vincularHandle(handle) : null;
    } catch (err) {
      setError(err.message || "No se pudo vincular la carpeta.");
      return null;
    }
  }, [registro, vincularHandle, usaFuente]);

  const limpiarAvisoAuto = useCallback(() => setAvisoAuto(null), []);

  const reautorizar = useCallback(async () => {
    setError(null);
    const objetivo = usaFuente ? raiz : registro?.handle;
    if (!objetivo) return false;
    const ok = await pedirPermiso(objetivo).catch(() => false);
    setPermiso(ok ? "granted" : "prompt");
    if (!ok) {
      setError("El navegador no concedió el acceso a la carpeta.");
      return false;
    }
    if (usaFuente && rutaFuente) {
      try {
        setRegistro(await derivar(raiz, rutaFuente));
      } catch (err) {
        setError(err.message);
        return false;
      }
    }
    return true;
  }, [registro, raiz, usaFuente, rutaFuente, derivar]);

  // Olvida la carpeta en este navegador (no toca archivos ni la configuración del expediente). En
  // modo fuente no hay nada propio del expediente que olvidar.
  const olvidar = useCallback(async () => {
    if (!usaFuente) await quitarCarpetaExpediente(usuarioId, expedienteId).catch(() => null);
    setRegistro(null);
    setPermiso(null);
    setRechazada(null);
  }, [usuarioId, expedienteId, usaFuente]);

  return {
    soportado, cargando, error, rechazada, avisoAuto, faltaRaiz,
    limpiarAvisoAuto,
    handle: registro?.handle || null,
    permiso,
    lista: Boolean(registro) && permiso === "granted",
    vincular, vincularHandle, reautorizar, olvidar,
  };
};
