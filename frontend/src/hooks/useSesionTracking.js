import { useEffect, useRef } from "react";
import { sesionService } from "../services/sesionService";

const INTERVALO_LATIDO_MS = 5 * 60 * 1000; // 5 min
const VENTANA_REANUDAR_MS = 30 * 60 * 1000; // 30 min
const STORAGE_KEY = "smartone_sesion_tracking";

const leerGuardado = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const guardar = (sesionId) => {
  try {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sesionId, ultimoLatidoLocal: Date.now() }),
    );
  } catch {
    // localStorage puede fallar (modo privado, cuota) — el tracking sigue
    // funcionando en memoria para la pestaña actual, solo se pierde la
    // capacidad de "reanudar" tras un reload.
  }
};

const limpiar = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No hace falta manejar el error — ver comentario en guardar().
  }
};

/**
 * Registro de sesiones (accesos y tiempo conectado) — telemetría
 * aproximada, con un margen de ± el intervalo de latido (5 min). NO es
 * tiempo de trabajo efectivo: cuenta el tiempo con la pestaña en primer
 * plano y con latidos activos, nunca en segundo plano.
 *
 * Se monta una sola vez en el layout autenticado. No bloquea la UI: si el
 * tracking falla en cualquier punto, se registra el error en consola y la
 * app sigue funcionando con normalidad (nunca se propaga la excepción).
 */
export function useSesionTracking() {
  const sesionIdRef = useRef(null);
  const iniciandoRef = useRef(false);

  useEffect(() => {
    let cancelado = false;
    let intervalId = null;

    const iniciarNueva = async () => {
      try {
        const { sesionId } = await sesionService.iniciar("web");
        if (cancelado) return;
        sesionIdRef.current = sesionId;
        guardar(sesionId);
      } catch (err) {
        console.error("useSesionTracking: no se pudo iniciar la sesión:", err);
      }
    };

    const enviarLatido = async () => {
      if (!sesionIdRef.current || document.visibilityState !== "visible") return;
      try {
        await sesionService.latido(sesionIdRef.current);
        guardar(sesionIdRef.current);
      } catch (err) {
        // 404/409 (sesión cerrada por timeout/revocación en otro lado, o
        // ya cerrada): se abre una nueva en vez de seguir insistiendo.
        console.error("useSesionTracking: latido falló, abriendo sesión nueva:", err);
        limpiar();
        await iniciarNueva();
      }
    };

    const alVolverVisible = () => {
      if (document.visibilityState !== "visible") return;
      const guardado = leerGuardado();
      const inactivoDemasiado = !guardado ||
          Date.now() - guardado.ultimoLatidoLocal > VENTANA_REANUDAR_MS;
      if (inactivoDemasiado) {
        iniciarNueva();
      } else {
        enviarLatido();
      }
    };

    const arrancar = async () => {
      if (iniciandoRef.current) return;
      iniciandoRef.current = true;
      const guardado = leerGuardado();
      const puedeReanudar = guardado &&
          Date.now() - guardado.ultimoLatidoLocal <= VENTANA_REANUDAR_MS;
      if (puedeReanudar) {
        sesionIdRef.current = guardado.sesionId;
      } else {
        await iniciarNueva();
      }
    };

    arrancar();
    intervalId = setInterval(enviarLatido, INTERVALO_LATIDO_MS);
    document.addEventListener("visibilitychange", alVolverVisible);

    return () => {
      cancelado = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", alVolverVisible);
      if (sesionIdRef.current) {
        sesionService.cerrar(sesionIdRef.current).catch((err) => {
          console.error("useSesionTracking: no se pudo cerrar la sesión:", err);
        });
        limpiar();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
