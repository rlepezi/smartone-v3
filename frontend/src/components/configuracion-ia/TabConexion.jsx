import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, ExternalLink, KeyRound, Plus, Trash2, XCircle } from "lucide-react";
import { configuracionIAService } from "../../services/configuracionIAService";
import { ErrorBanner } from "../shared/ErrorBanner";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { formatFecha } from "../../utils/fechas";
import { Tarjeta } from "./Tarjeta";
import {
  CLASE_INPUT, CLASE_INPUT_ERROR, CLASE_PRIMARIO, CLASE_SECUNDARIO, URL_PRECIOS_ANTHROPIC, formatUsd,
} from "./estilos";

// Filas editables de la tabla de precios, desde el mapa {modelo: {entrada, salida}}.
const aFilas = (precios) => Object.entries(precios || {}).map(([modelo, p]) => ({
  modelo, entrada: String(p.entrada ?? ""), salida: String(p.salida ?? ""),
}));

const precioValido = (valor) => Number(String(valor).replace(",", ".")) > 0;

// Pestaña "Conexión IA" (superadmin): API key de Anthropic (solo escritura, guardada cifrada en el
// backend), prueba de conexión, modelos con sus precios, modelo por defecto, límite mensual y gasto
// del mes. No hay modelos ni precios en el código: se ingresan los vigentes de Anthropic.
export const TabConexion = () => {
  const [config, setConfig] = useState(null);
  const [gasto, setGasto] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [guardandoKey, setGuardandoKey] = useState(false);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);
  const [desactivando, setDesactivando] = useState(false);
  const [prueba, setPrueba] = useState(null);
  const [probando, setProbando] = useState(false);
  const [modelo, setModelo] = useState("");
  const [filas, setFilas] = useState([]);
  const [limite, setLimite] = useState("");
  const [guardandoParametros, setGuardandoParametros] = useState(false);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [filaAQuitar, setFilaAQuitar] = useState(null);

  const aplicarConfig = (datos) => {
    setConfig(datos);
    setModelo(datos.modeloPorDefecto || "");
    setFilas(aFilas(datos.preciosPorModelo));
    setLimite(datos.limiteGastoMensualUsd === null || datos.limiteGastoMensualUsd === undefined ? "" : String(datos.limiteGastoMensualUsd));
    setIntentoGuardar(false);
  };

  useEffect(() => {
    let vigente = true;
    Promise.all([configuracionIAService.obtener(), configuracionIAService.gastoMes()])
      .then(([datos, gastoMes]) => {
        if (!vigente) return;
        aplicarConfig(datos);
        setGasto(gastoMes);
      })
      .catch((err) => { if (vigente) setError(err.message || "No se pudo cargar la configuración."); });
    return () => { vigente = false; };
  }, []);

  const guardarKey = async (e) => {
    e.preventDefault();
    setGuardandoKey(true);
    setError(null);
    setAviso(null);
    try {
      aplicarConfig(await configuracionIAService.guardarApiKey(apiKey.trim()));
      setApiKey("");
      setPrueba(null);
      setAviso("API key guardada.");
    } catch (err) {
      setError(err.message || "No se pudo guardar la API key.");
    } finally {
      setGuardandoKey(false);
    }
  };

  const desactivar = async () => {
    setDesactivando(true);
    setError(null);
    try {
      aplicarConfig(await configuracionIAService.desactivar());
      setConfirmarDesactivar(false);
      setPrueba(null);
      setAviso("API key desactivada.");
    } catch (err) {
      setError(err.message || "No se pudo desactivar la API key.");
    } finally {
      setDesactivando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      setPrueba(await configuracionIAService.probar());
    } catch (err) {
      setPrueba({ ok: false, mensaje: err.message || "No se pudo probar la conexión." });
    } finally {
      setProbando(false);
    }
  };

  const cambiarFila = (i, campo, valor) => setFilas((actual) => actual.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  // Validaciones de la tabla: identificador obligatorio y sin repetir; precios > 0.
  const ids = filas.map((f) => f.modelo.trim());
  const errorFila = (f, i) => {
    const id = f.modelo.trim();
    if (!id) return "Ingrese el identificador del modelo.";
    if (ids.indexOf(id) !== i) return "Identificador repetido.";
    if (!precioValido(f.entrada) || !precioValido(f.salida)) return "Los precios deben ser mayores que 0.";
    return null;
  };
  const erroresFilas = filas.map(errorFila);
  const hayErrores = erroresFilas.some(Boolean) || filas.length === 0 || !modelo;

  const guardarParametros = async (e) => {
    e.preventDefault();
    setIntentoGuardar(true);
    setError(null);
    setAviso(null);
    if (hayErrores) return;
    setGuardandoParametros(true);
    try {
      const preciosPorModelo = Object.fromEntries(filas.map((f) => [
        f.modelo.trim(),
        { entrada: Number(String(f.entrada).replace(",", ".")), salida: Number(String(f.salida).replace(",", ".")) },
      ]));
      aplicarConfig(await configuracionIAService.actualizar({
        modeloPorDefecto: modelo,
        preciosPorModelo,
        limiteGastoMensualUsd: limite.trim() === "" ? null : Number(limite.replace(",", ".")),
      }));
      setAviso("Parámetros guardados.");
    } catch (err) {
      setError(err.message || "No se pudieron guardar los parámetros.");
    } finally {
      setGuardandoParametros(false);
    }
  };

  if (!config) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        {!error && <div className="h-40 rounded-2xl bg-white border border-slate-100 animate-pulse" aria-hidden="true" />}
      </div>
    );
  }

  const activa = config.estado === "activa" && Boolean(config.apiKeyUltimos4);
  const modelosDisponibles = ids.filter(Boolean);
  // Advertencia con lo GUARDADO: el modelo por defecto sin precios bloquea las revisiones.
  const faltanPrecios = !config.preciosConfigurados;

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      {aviso && <p role="status" className="text-xs font-semibold text-sage-dark">{aviso}</p>}
      {faltanPrecios && (
        <p role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Configura los precios de entrada y salida del modelo{config.modeloPorDefecto ? ` ${config.modeloPorDefecto}` : " por defecto"}.
          Mientras falten, no se pueden estimar ni iniciar revisiones.
        </p>
      )}

      <Tarjeta titulo="API key de Anthropic" Icono={KeyRound}>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {config.apiKeyUltimos4 && (
            <code className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">sk-ant-••••••••{config.apiKeyUltimos4}</code>
          )}
          {activa ? (
            <span className="inline-flex items-center gap-1 font-semibold text-sage-dark">
              <CheckCircle2 className="w-4 h-4" />
              Configurada{config.updatedAt ? ` (actualizada el ${formatFecha(config.updatedAt)}${config.updatedBy?.nombre ? ` por ${config.updatedBy.nombre}` : ""})` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <XCircle className="w-4 h-4" />
              {config.estado === "inactiva" ? "Desactivada" : "No configurada"}
              {!config.apiKeyUltimos4 && config.configurada && " (se usa la variable de respaldo ANTHROPIC_API_KEY)"}
            </span>
          )}
        </div>

        <form onSubmit={guardarKey} className="flex flex-col sm:flex-row gap-2">
          <input
            type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={config.apiKeyUltimos4 ? "Ingrese una nueva API key para reemplazarla" : "sk-ant-..."}
            aria-label="API key de Anthropic" className={`${CLASE_INPUT} sm:flex-1`}
          />
          <button type="submit" disabled={!apiKey.trim() || guardandoKey} className={CLASE_PRIMARIO}>
            {guardandoKey ? "Guardando..." : config.apiKeyUltimos4 ? "Reemplazar" : "Guardar"}
          </button>
          {activa && (
            <button type="button" onClick={() => setConfirmarDesactivar(true)} className={CLASE_SECUNDARIO}>Desactivar</button>
          )}
        </form>
        <p className="text-[11px] text-slate-400">La key se guarda cifrada y nunca vuelve a mostrarse. Para cambiarla, ingrese una nueva.</p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={probar} disabled={!config.configurada || probando} className={CLASE_SECUNDARIO}>
            {probando ? "Probando..." : "Probar conexión"}
          </button>
          {prueba && (
            <span className={`text-xs font-semibold ${prueba.ok ? "text-sage-dark" : "text-red-600"}`}>
              {prueba.ok ? "OK · " : "Error · "}{prueba.mensaje}
            </span>
          )}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Modelos, precios y límite de gasto" Icono={BrainCircuit}>
        <form onSubmit={guardarParametros} className="space-y-4">
          <p className="text-[11px] text-slate-500">
            Verifica identificadores y precios vigentes en la{" "}
            <a href={URL_PRECIOS_ANTHROPIC} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-primary hover:text-primary-dark hover:underline">
              página oficial de precios de Anthropic <ExternalLink className="w-3 h-3" />
            </a>
            . Precios en USD por millón de tokens.
          </p>
          {filas.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">No hay modelos configurados. Agregue al menos uno con sus precios.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2 pr-2">Modelo</th>
                    <th className="py-2 px-2">Entrada (USD / millón)</th>
                    <th className="py-2 px-2">Salida (USD / millón)</th>
                    <th className="py-2 pl-2"><span className="sr-only">Quitar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const esPorDefecto = f.modelo.trim() && f.modelo.trim() === modelo;
                    const errorDeFila = intentoGuardar ? erroresFilas[i] : null;
                    return (
                      <tr key={i} className="align-top">
                        <td className="py-1.5 pr-2">
                          <input value={f.modelo} onChange={(e) => cambiarFila(i, "modelo", e.target.value)} aria-label="Identificador del modelo" placeholder="claude-..." className={errorDeFila ? CLASE_INPUT_ERROR : CLASE_INPUT} />
                          {errorDeFila && <p className="text-[11px] text-red-500 mt-1">{errorDeFila}</p>}
                          {!precioValido(f.entrada) || !precioValido(f.salida) ? (
                            !errorDeFila && <p className="text-[11px] text-amber-700 mt-1">Configura los precios de entrada y salida del modelo.</p>
                          ) : null}
                        </td>
                        <td className="py-1.5 px-2">
                          <input type="number" min="0" step="any" value={f.entrada} onChange={(e) => cambiarFila(i, "entrada", e.target.value)} aria-label="Precio de entrada" className={CLASE_INPUT} />
                        </td>
                        <td className="py-1.5 px-2">
                          <input type="number" min="0" step="any" value={f.salida} onChange={(e) => cambiarFila(i, "salida", e.target.value)} aria-label="Precio de salida" className={CLASE_INPUT} />
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() => setFilaAQuitar(i)}
                            disabled={Boolean(esPorDefecto)}
                            title={esPorDefecto ? "Es el modelo por defecto: elija otro antes de quitarlo." : undefined}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            aria-label={`Quitar ${f.modelo || "modelo"}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={() => setFilas((actual) => [...actual, { modelo: "", entrada: "", salida: "" }])} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dark">
            <Plus className="w-3.5 h-3.5" /> Agregar modelo
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1.5">Modelo por defecto *</span>
              <select value={modelo} onChange={(e) => setModelo(e.target.value)} className={intentoGuardar && !modelo ? CLASE_INPUT_ERROR : CLASE_INPUT}>
                <option value="">Seleccione...</option>
                {modelosDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {intentoGuardar && !modelo && <span className="block text-[11px] text-red-500 mt-1">Elija el modelo por defecto.</span>}
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1.5">Límite de gasto mensual (USD, opcional)</span>
              <input type="number" min="0" step="any" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Sin límite" className={CLASE_INPUT} />
            </label>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={guardandoParametros} className={CLASE_PRIMARIO}>
              {guardandoParametros ? "Guardando..." : "Guardar parámetros"}
            </button>
          </div>
        </form>
      </Tarjeta>

      <div className="bg-white px-6 py-4 rounded-2xl border border-slate-100 shadow-card flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-carbon-dark">
          Gasto del mes actual: <span className="font-black">{gasto ? formatUsd(gasto.gastoUsd) : "…"}</span>
        </p>
        {config.limiteGastoMensualUsd !== null && config.limiteGastoMensualUsd !== undefined && (
          <p className="text-xs text-slate-500">Límite: {formatUsd(config.limiteGastoMensualUsd)}</p>
        )}
      </div>

      {confirmarDesactivar && (
        <ConfirmacionModal
          titulo="Desactivar la API key"
          mensaje="Las revisiones con IA quedarán deshabilitadas hasta que se active una key. La key cifrada se conserva."
          textoConfirmar="Desactivar"
          peligro
          ocupado={desactivando}
          onConfirmar={desactivar}
          onCancelar={() => setConfirmarDesactivar(false)}
        />
      )}
      {filaAQuitar !== null && (
        <ConfirmacionModal
          titulo="Quitar el modelo"
          mensaje={`Se quitará ${filas[filaAQuitar]?.modelo || "este modelo"} de la lista. El cambio se aplica al guardar los parámetros.`}
          textoConfirmar="Quitar"
          peligro
          onConfirmar={() => { setFilas((actual) => actual.filter((_, j) => j !== filaAQuitar)); setFilaAQuitar(null); }}
          onCancelar={() => setFilaAQuitar(null)}
        />
      )}
    </div>
  );
};
