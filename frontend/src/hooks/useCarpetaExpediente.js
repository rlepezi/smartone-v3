import { useCallback, useEffect, useState } from "react";
import {
  soportaSelectorCarpeta, obtenerCarpetaExpediente, seleccionarCarpeta, guardarCarpetaExpediente,
  quitarCarpetaExpediente, estadoPermiso, pedirPermiso,
} from "../services/fuentes/carpetaLocal";
import { repositorioDocumentalService } from "../services/repositorioDocumentalService";
import { validarCarpetaEmpresa } from "../utils/carpetaEmpresa";
import { subcarpetaUnicaDeEmpresa, puedeVincularSola } from "../services/fuentes/carpetaBase";

// Carpeta local del Expediente en ESTE navegador (handle en IndexedDB, misma clave que Revisiones IA)
// y su permiso. `vincular` (desde un clic) elige la carpeta, la recuerda y deja su nombre como
// repositorio del expediente; `reautorizar` vuelve a pedir el permiso de lectura.
// Con `empresa`, la carpeta elegida debe ser de esa Empresa (validarCarpetaEmpresa): si no lo es, no
// se recuerda ni se guarda, y queda su nombre en `rechazada` para mostrar la advertencia.
// Vinculación automática (`autoVincular`, con `empresa` y `mandanteId`): si este navegador no tiene
// la carpeta y en la carpeta principal del Mandante hay UNA sola subcarpeta de la Empresa, se
// vincula sola cuando no hay carpeta configurada (`configurada`) o cuando es esa misma; deja el
// texto del aviso en `avisoAuto`. Solo guarda en el expediente si `puedeGuardar`.
export const useCarpetaExpediente = (usuarioId, expedienteId, {
  onRepositorio, empresa = null, mandanteId = null, configurada = null, autoVincular = false, puedeGuardar = false,
} = {}) => {
  const soportado = soportaSelectorCarpeta();
  const [registro, setRegistro] = useState(null);
  const [permiso, setPermiso] = useState(null);
  const [cargando, setCargando] = useState(soportado);
  const [error, setError] = useState(null);
  const [rechazada, setRechazada] = useState(null);
  const [avisoAuto, setAvisoAuto] = useState(null);
  const intentarAuto = autoVincular && Boolean(empresa && mandanteId) && (puedeGuardar || Boolean(configurada));

  useEffect(() => {
    if (!soportado) return undefined;
    let vigente = true;
    (async () => {
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
      return { reg, estado, aviso };
    })()
      .then(({ reg, estado, aviso }) => {
        if (!vigente) return;
        setRegistro(reg);
        setPermiso(estado);
        if (aviso) setAvisoAuto(aviso);
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo vincular la carpeta."); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
    // Solo al abrir (o cambiar de expediente): la vinculación automática no se repite en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soportado, usuarioId, expedienteId, intentarAuto]);

  // Valida, recuerda y guarda `handle` como la carpeta del expediente (p. ej. una subcarpeta de la
  // carpeta principal del Mandante). Devuelve el registro, o null si no se vinculó.
  const vincularHandle = useCallback(async (handle) => {
    setError(null);
    try {
      if (empresa && !validarCarpetaEmpresa(handle.name, empresa).valida) {
        setRechazada(handle.name);
        return null;
      }
      setRechazada(null);
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
  }, [usuarioId, expedienteId, onRepositorio, empresa]);

  // Con el selector del navegador (debe llamarse desde un clic).
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

  const limpiarAvisoAuto = useCallback(() => setAvisoAuto(null), []);

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
    setRechazada(null);
  }, [usuarioId, expedienteId]);

  return {
    soportado, cargando, error, rechazada, avisoAuto,
    limpiarAvisoAuto,
    handle: registro?.handle || null,
    permiso,
    lista: Boolean(registro) && permiso === "granted",
    vincular, vincularHandle, reautorizar, olvidar,
  };
};
