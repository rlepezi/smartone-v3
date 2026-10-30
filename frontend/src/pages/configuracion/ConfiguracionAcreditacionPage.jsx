import { useEffect, useState } from "react";
import { Gauge, AlertCircle, CheckCircle2, RotateCcw, Save } from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { CampoMandante } from "../../components/shared/CampoMandante";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { mandanteService } from "../../services/mandanteService";
import { UMBRALES_ACREDITACION_DEFECTO, nivelAcreditacion } from "../../utils/cumplimientoCalculos";

const CLASE_CAMPO = "w-24 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

// Mismas reglas que el backend (functions/src/utils/umbralesAcreditacion.js).
const errorUmbrales = ({ acreditada, aceptable }) => {
  const esPct = (v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100;
  if (!esPct(acreditada) || !esPct(aceptable)) return "Los umbrales deben ser números enteros entre 1 y 100.";
  if (Number(aceptable) >= Number(acreditada)) return "El umbral de Aceptable debe ser menor que el de Acreditada.";
  return null;
};

const aTexto = (u) => ({ acreditada: String(u.acreditada), aceptable: String(u.aceptable) });

// Niveles de acreditación de un Mandante: desde qué % de cumplimiento un Expediente, persona o
// maquinaria queda Acreditada, Aceptable o Rechazada. Se guardan en el Mandante.
const FormularioUmbrales = ({ mandanteId }) => {
  const [guardados, setGuardados] = useState(undefined); // undefined: cargando; null: sin configurar
  const [valores, setValores] = useState(aTexto(UMBRALES_ACREDITACION_DEFECTO));
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    mandanteService.obtenerPorId(mandanteId)
      .then((m) => {
        if (!vigente) return;
        const u = m?.umbralesAcreditacion || null;
        setGuardados(u);
        setValores(aTexto(u || UMBRALES_ACREDITACION_DEFECTO));
      })
      .catch((err) => { if (vigente) { setGuardados(null); setError(err.message || "No se pudo cargar el Mandante."); } });
    return () => { vigente = false; };
  }, [mandanteId]);

  const cambiar = (campo, valor) => {
    setValores((v) => ({ ...v, [campo]: valor.replace(/\D/g, "").slice(0, 3) }));
    setError(null);
    setAviso(null);
  };

  const guardar = async (umbrales) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await mandanteService.actualizar(mandanteId, { umbralesAcreditacion: umbrales });
      setGuardados(umbrales);
      setValores(aTexto(umbrales || UMBRALES_ACREDITACION_DEFECTO));
      setAviso(umbrales ? "Umbrales guardados." : "Se restablecieron los valores por defecto.");
    } catch (err) {
      setError(err.message || "No se pudieron guardar los umbrales.");
    } finally {
      setOcupado(false);
    }
  };

  const onGuardar = () => {
    const e = errorUmbrales(valores);
    if (e) return setError(e);
    return guardar({ acreditada: Number(valores.acreditada), aceptable: Number(valores.aceptable) });
  };

  if (guardados === undefined) {
    return <p className="py-8 text-center text-xs text-slate-400">Cargando...</p>;
  }

  const invalido = Boolean(errorUmbrales(valores));
  const vista = invalido ? null : { acreditada: Number(valores.acreditada), aceptable: Number(valores.aceptable) };
  const niveles = vista && [
    { pct: vista.acreditada, rango: `${vista.acreditada} %${vista.acreditada < 100 ? " o más" : ""}` },
    { pct: vista.aceptable, rango: `${vista.aceptable} % a ${vista.acreditada - 1} %` },
    { pct: vista.aceptable - 1, rango: `Menos de ${vista.aceptable} %` },
  ];

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5 max-w-2xl">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-carbon-dark uppercase tracking-wider">Umbrales de cumplimiento</h3>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${guardados ? "bg-primary-lighter text-primary border-primary/20" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
          {guardados ? "Configurados para este Mandante" : "Valores por defecto"}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Acreditada desde (%)</span>
          <input inputMode="numeric" value={valores.acreditada} onChange={(e) => cambiar("acreditada", e.target.value)} className={CLASE_CAMPO} />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Aceptable desde (%)</span>
          <input inputMode="numeric" value={valores.aceptable} onChange={(e) => cambiar("aceptable", e.target.value)} className={CLASE_CAMPO} />
        </label>
        <p className="text-xs text-slate-500 pb-2">Rechazada: bajo el umbral de Aceptable.</p>
      </div>

      {niveles && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {niveles.map((n) => {
            const nivel = nivelAcreditacion(n.pct, vista);
            return (
              <div key={nivel.etiqueta} className={`p-3 rounded-xl border ${nivel.caja}`}>
                <p className={`text-sm font-black ${nivel.texto}`}>{nivel.etiqueta}</p>
                <p className={`text-xs font-semibold mt-0.5 ${nivel.texto}`}>{n.rango}</p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Se aplican al % de cumplimiento de los Expedientes de este Mandante y de cada persona y maquinaria
        en ellos. Por defecto: Acreditada {UMBRALES_ACREDITACION_DEFECTO.acreditada} %, Aceptable desde {UMBRALES_ACREDITACION_DEFECTO.aceptable} %.
      </p>

      {error && (
        <p className="flex items-center gap-2 text-xs font-semibold text-red-600"><AlertCircle className="w-4 h-4" />{error}</p>
      )}
      {aviso && (
        <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" />{aviso}</p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        {guardados && (
          <ActionButton icon={RotateCcw} disabled={ocupado} onClick={() => guardar(null)}>
            Restablecer valores por defecto
          </ActionButton>
        )}
        <ActionButton variant="primary" icon={Save} busy={ocupado} busyLabel="Guardando..." disabled={invalido} onClick={onGuardar}>
          Guardar
        </ActionButton>
      </div>
    </div>
  );
};

// Configuración → Niveles de acreditación (superadmin elige el Mandante; mandante_admin, el suyo).
export const ConfiguracionAcreditacionPage = () => {
  const contexto = useMandanteContexto();
  const { mandanteId, modo } = contexto;

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Niveles de acreditación"
        subtitle="Desde qué % de cumplimiento se considera Acreditada, Aceptable o Rechazada"
        icon={Gauge}
      />
      {(modo === "seleccionable" || modo === "fijo" || modo === "unico") && (
        <div className="max-w-sm">
          <CampoMandante contexto={contexto} conFoco={false} />
        </div>
      )}
      {modo === "ninguno" && <CampoMandante contexto={contexto} />}
      {!mandanteId ? (
        modo === "seleccionable" && <p className="py-8 text-center text-xs text-slate-400">Seleccione un Mandante para configurar sus niveles de acreditación.</p>
      ) : (
        <FormularioUmbrales key={mandanteId} mandanteId={mandanteId} />
      )}
    </div>
  );
};
