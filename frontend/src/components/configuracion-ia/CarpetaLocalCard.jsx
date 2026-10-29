import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  soportaSelectorCarpeta, obtenerCarpetaPredeterminada, guardarCarpetaPredeterminada,
  quitarCarpetaPredeterminada, estadoPermiso, pedirPermiso, seleccionarCarpeta, vistaRapida,
} from "../../services/fuentes/carpetaLocal";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { formatFechaHora } from "../../utils/fechas";
import { Tarjeta } from "./Tarjeta";
import { CLASE_PRIMARIO, CLASE_SECUNDARIO } from "./estilos";

const SIN_INDEXEDDB = "Este navegador no permite guardar la carpeta (almacenamiento local no disponible). Podrás elegirla en cada revisión.";

// Carpeta local predeterminada de Revisiones IA, por usuario y Mandante, en ESTE navegador
// (IndexedDB). Nunca se guarda en el servidor.
export const CarpetaLocalCard = ({ usuarioId, mandanteId }) => {
  const soportado = soportaSelectorCarpeta();
  const [registro, setRegistro] = useState(null);
  const [cargado, setCargado] = useState(false);
  const [permiso, setPermiso] = useState(null);
  const [vista, setVista] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState(null);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  const calcularVista = useCallback(async (handle) => {
    setCalculando(true);
    try {
      setVista(await vistaRapida(handle));
    } catch {
      setError("No se pudo leer la carpeta (quizás se movió o se eliminó). Elíjala de nuevo.");
    } finally {
      setCalculando(false);
    }
  }, []);

  const actualizarEstado = useCallback(async (reg) => {
    setRegistro(reg);
    setVista(null);
    if (!reg) { setPermiso(null); return; }
    const estado = await estadoPermiso(reg.handle).catch(() => "prompt");
    setPermiso(estado);
    if (estado === "granted") await calcularVista(reg.handle);
  }, [calcularVista]);

  useEffect(() => {
    if (!soportado || !usuarioId || !mandanteId) return undefined;
    let vigente = true;
    obtenerCarpetaPredeterminada(usuarioId, mandanteId)
      .then((reg) => { if (vigente) { setError(null); actualizarEstado(reg); } })
      .catch(() => { if (vigente) setError(SIN_INDEXEDDB); })
      .finally(() => { if (vigente) setCargado(true); });
    return () => { vigente = false; };
  }, [soportado, usuarioId, mandanteId, actualizarEstado]);

  const elegir = async () => {
    setError(null);
    try {
      const handle = await seleccionarCarpeta(registro?.handle || null);
      if (!handle) return;
      await actualizarEstado(await guardarCarpetaPredeterminada(usuarioId, mandanteId, handle));
    } catch {
      setError(SIN_INDEXEDDB);
    }
  };

  const confirmarAcceso = async () => {
    if (await pedirPermiso(registro.handle).catch(() => false)) await actualizarEstado(registro);
    else setError("El navegador no concedió el acceso a la carpeta.");
  };

  const quitar = async () => {
    try {
      await quitarCarpetaPredeterminada(usuarioId, mandanteId);
      await actualizarEstado(null);
    } catch {
      setError(SIN_INDEXEDDB);
    }
    setConfirmarQuitar(false);
  };

  return (
    <Tarjeta titulo="Carpeta local" Icono={FolderOpen}>
      <p className="text-[11px] text-slate-500">
        Elige la carpeta principal que contiene una subcarpeta por empresa (por ejemplo, «Repositorio Empresas»). En Nueva
        Acreditación, la carpeta de cada expediente se elige entre esas subcarpetas. Por seguridad, el navegador no permite
        guardar la ruta de la carpeta (C:\...): SmartOne recuerda el acceso en este navegador y te pedirá confirmar el
        permiso con un clic.
      </p>
      {!soportado ? (
        <p className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
          Tu navegador no permite recordar carpetas. Podrás elegirla en cada revisión.
        </p>
      ) : !cargado ? (
        <div className="h-16 rounded-xl bg-slate-50 animate-pulse" aria-hidden="true" />
      ) : registro ? (
        <div className="p-4 rounded-xl border border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-bold text-carbon-dark mr-auto">{registro.handle.name}</p>
            {permiso === "granted" ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-sage-dark"><ShieldCheck className="w-4 h-4" /> Acceso concedido</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><ShieldAlert className="w-4 h-4" /> Requiere confirmar acceso</span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Configurada el {formatFechaHora(registro.configuradaEn)}</p>
          {permiso === "granted" ? (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              {vista ? (
                <span>{vista.subcarpetas} {vista.subcarpetas === 1 ? "subcarpeta" : "subcarpetas"} · {vista.archivosValidos} archivos válidos</span>
              ) : <span className="text-slate-400">{calculando ? "Contando…" : "Sin vista rápida"}</span>}
              <button type="button" onClick={() => calcularVista(registro.handle)} disabled={calculando} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark disabled:opacity-50">
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar
              </button>
            </div>
          ) : (
            <button type="button" onClick={confirmarAcceso} className={CLASE_PRIMARIO}>Confirmar acceso</button>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">Aún no hay una carpeta predeterminada para este Mandante en este navegador.</p>
      )}
      {error && <p role="alert" className="text-xs text-amber-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={elegir} disabled={!soportado} className={registro ? CLASE_SECUNDARIO : CLASE_PRIMARIO}>
          <FolderOpen className="w-4 h-4" /> {registro ? "Cambiar carpeta" : "Elegir carpeta predeterminada"}
        </button>
        {registro && (
          <button type="button" onClick={() => setConfirmarQuitar(true)} disabled={!soportado} className={CLASE_SECUNDARIO}>Quitar</button>
        )}
      </div>
      {confirmarQuitar && (
        <ConfirmacionModal
          titulo="Quitar la carpeta predeterminada"
          mensaje="Solo se olvida la carpeta en este navegador; los archivos no se tocan."
          textoConfirmar="Quitar"
          onConfirmar={quitar}
          onCancelar={() => setConfirmarQuitar(false)}
        />
      )}
    </Tarjeta>
  );
};
