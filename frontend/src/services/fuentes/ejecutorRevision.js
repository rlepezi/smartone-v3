import { revisionIAService } from "../revisionIAService";
import { prepararArchivo } from "./carpetaLocal";

// Envío de los archivos de una sesión de Revisiones IA desde el navegador: cola en memoria con 3
// envíos en paralelo y un reintento ante errores de red. Al terminar los archivos de una entidad
// (persona) se consolida esa entidad; al terminar todas, se finaliza la sesión. Vive fuera de los
// componentes (un registro por sesión) para que la cola siga al pasar del asistente al detalle de
// la sesión. Si se recarga la página, la cola se pierde: la pantalla avisa con beforeunload.

const CONCURRENCIA = 3;
const ejecuciones = new Map();

const notificar = (ejecucion) => {
  ejecucion.version += 1;
  ejecucion.suscriptores.forEach((fn) => fn(ejecucion));
};

const marcar = (ejecucion, ruta, cambios) => {
  ejecucion.archivos.set(ruta, { ...ejecucion.archivos.get(ruta), ...cambios });
  notificar(ejecucion);
};

const esErrorDeRed = (error) => !error?.status;

const enviarConReintento = async (sesionId, datos) => {
  try {
    return await revisionIAService.enviarArchivo(sesionId, datos);
  } catch (error) {
    if (!esErrorDeRed(error)) throw error;
    return revisionIAService.enviarArchivo(sesionId, datos);
  }
};

// tareas: [{ archivo: File, meta: archivoIA del plan (rutaRelativa, nombre, mime, tamanoBytes,
// entidadClave, empresaCarpeta, seccionClave, entidadCarpeta, documentoClave,
// fechaEnNombreArchivo) }].
export const iniciarEjecucion = (sesionId, tareas) => {
  const archivos = new Map();
  const pendientesPorEntidad = new Map();
  tareas.forEach(({ meta }) => {
    archivos.set(meta.rutaRelativa, {
      ruta: meta.rutaRelativa, nombre: meta.nombre, entidadClave: meta.entidadClave,
      entidadCarpeta: meta.entidadCarpeta, estado: "en_cola", error: null,
    });
    pendientesPorEntidad.set(meta.entidadClave, (pendientesPorEntidad.get(meta.entidadClave) || 0) + 1);
  });
  const ejecucion = { sesionId, estado: "en_curso", archivos, version: 0, error: null, suscriptores: new Set() };
  ejecuciones.set(sesionId, ejecucion);

  const consolidaciones = [];
  const consolidar = async (entidadClave) => {
    try {
      await revisionIAService.consolidar(sesionId, entidadClave);
    } catch (error) {
      ejecucion.error = `No se pudo consolidar una persona: ${error.message}`;
    }
    notificar(ejecucion);
  };

  let indice = 0;
  const trabajador = async () => {
    while (ejecucion.estado === "en_curso" && indice < tareas.length) {
      const { archivo, meta } = tareas[indice];
      indice += 1;
      marcar(ejecucion, meta.rutaRelativa, { estado: "enviando" });
      try {
        // Un Word puede traer varias imágenes (anverso y reverso): una pieza por imagen.
        const piezas = await prepararArchivo({ archivo, mime: meta.mime });
        const errores = [];
        for (const pieza of piezas) {
          const procesamiento = await enviarConReintento(sesionId, {
            entidadClave: meta.entidadClave,
            archivoMeta: {
              rutaRelativa: pieza.parte ? `${meta.rutaRelativa}#imagen-${pieza.parte}` : meta.rutaRelativa,
              nombre: pieza.parte ? `${meta.nombre} (imagen ${pieza.parte})` : meta.nombre,
              mime: pieza.mime,
              tamanoBytes: meta.tamanoBytes,
              hashSha256: pieza.hashSha256,
              ultimaModificacion: meta.ultimaModificacion || null,
              empresaCarpeta: meta.empresaCarpeta,
              seccionClave: meta.seccionClave,
              entidadCarpeta: meta.entidadCarpeta,
              documentoClave: meta.documentoClave,
              fechaEnNombreArchivo: meta.fechaEnNombreArchivo,
            },
            contenidoBase64: pieza.contenidoBase64,
          });
          if (procesamiento?.estado === "error") errores.push(procesamiento.error);
        }
        marcar(ejecucion, meta.rutaRelativa, errores.length === piezas.length
          ? { estado: "error", error: errores[0] }
          : { estado: "procesado" });
      } catch (error) {
        marcar(ejecucion, meta.rutaRelativa, { estado: "error", error: error.message || "Error al enviar." });
      }
      const restantes = pendientesPorEntidad.get(meta.entidadClave) - 1;
      pendientesPorEntidad.set(meta.entidadClave, restantes);
      if (restantes === 0 && ejecucion.estado === "en_curso") consolidaciones.push(consolidar(meta.entidadClave));
    }
  };

  Promise.all(Array.from({ length: CONCURRENCIA }, trabajador))
    .then(() => Promise.all(consolidaciones))
    .then(async () => {
      if (ejecucion.estado !== "en_curso") return;
      try {
        await revisionIAService.finalizar(sesionId);
      } catch (error) {
        ejecucion.error = `No se pudo finalizar la sesión: ${error.message}`;
      }
      ejecucion.estado = "terminada";
      notificar(ejecucion);
    });

  return ejecucion;
};

export const obtenerEjecucion = (sesionId) => ejecuciones.get(sesionId) || null;

// Detiene la cola (los envíos en curso terminan) y cancela la sesión en el backend.
export const cancelarEjecucion = async (sesionId) => {
  const ejecucion = ejecuciones.get(sesionId);
  if (ejecucion && ejecucion.estado === "en_curso") {
    ejecucion.estado = "cancelada";
    ejecucion.archivos.forEach((a, ruta) => {
      if (a.estado === "en_cola") ejecucion.archivos.set(ruta, { ...a, estado: "cancelado" });
    });
    notificar(ejecucion);
  }
  await revisionIAService.cancelar(sesionId);
};

export const suscribirEjecucion = (sesionId, fn) => {
  const ejecucion = ejecuciones.get(sesionId);
  if (!ejecucion) return () => {};
  ejecucion.suscriptores.add(fn);
  return () => ejecucion.suscriptores.delete(fn);
};

// true mientras alguna sesión siga enviando (para beforeunload).
export const hayEjecucionEnCurso = () => [...ejecuciones.values()].some((e) => e.estado === "en_curso");
