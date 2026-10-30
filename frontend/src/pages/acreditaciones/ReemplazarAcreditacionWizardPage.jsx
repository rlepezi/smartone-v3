import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, Repeat } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { personaService } from "../../services/personaService";
import { recursoService } from "../../services/recursoService";
import { empresaService } from "../../services/empresaService";
import { participacionService } from "../../services/participacionService";
import { sujetoService } from "../../services/participacionSujetoService";
import { proyectoService } from "../../services/proyectoService";
import { perfilParticipacionService } from "../../services/perfilParticipacionService";
import { acreditacionService } from "../../services/acreditacionService";
import { PasoProyecto } from "./wizard/PasoProyecto";
import { PasoEntidad } from "./wizard-reemplazo/PasoEntidad";
import { PasoPerfilOEmpresa } from "./wizard-reemplazo/PasoPerfilOEmpresa";
import { PasoParticipacionFechas } from "./wizard-reemplazo/PasoParticipacionFechas";
import { PasoRequerimientosPreview } from "./wizard-reemplazo/PasoRequerimientosPreview";
import { PasoConfirmacionReemplazo } from "./wizard-reemplazo/PasoConfirmacionReemplazo";
import { ResumenReemplazoPanel } from "../../components/acreditaciones/ResumenReemplazoPanel";
import { ConfirmacionModal } from "../../components/shared/ConfirmacionModal";
import { hoyISO } from "../../utils/fechas";

const aMillis = (valor) => {
  if (!valor) return 0;
  if (valor._seconds) return valor._seconds * 1000;
  const parsed = new Date(valor).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

const masReciente = (lista) =>
  [...lista].sort((a, b) => aMillis(b.fechaInicio) - aMillis(a.fechaInicio))[0] || null;

// Paso 3 se relabela según el tipo de entidad — Empresa mantiene el
// selector de Perfil de siempre, Persona/Maquinaria muestran su Empresa
// actual (no seleccionable, decisión de negocio confirmada) en su lugar.
const ETIQUETA_PASO_PERFIL = {
  persona: "Empresa y Rol",
  maquinaria: "Empresa",
  empresa: "Perfil",
};

const StepIndicator = ({ pasos, step }) => (
  <div className="flex items-center">
    {pasos.map((p, i) => (
      <React.Fragment key={p.key}>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
              i + 1 < step
                ? "bg-primary border-primary text-white"
                : i + 1 === step
                  ? "bg-white border-primary text-primary"
                  : "bg-white border-slate-200 text-slate-400"
            }`}
          >
            {i + 1 < step ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-[11px] font-semibold whitespace-nowrap ${i + 1 <= step ? "text-carbon-dark" : "text-slate-400"}`}>
            {p.label}
          </span>
        </div>
        {i < pasos.length - 1 && (
          <div className={`flex-1 h-0.5 mx-2 mb-5 transition-colors ${i + 1 < step ? "bg-primary" : "bg-slate-200"}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

export const ReemplazarAcreditacionWizardPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const esSuperAdmin = profile?.rol === "superadmin";
  const [searchParams] = useSearchParams();

  const entidadTipoInicial = searchParams.get("entidadTipo") || "persona";
  const entidadIdPrefiltrado = searchParams.get("entidadId") || null;
  const entidadPrefiltrada = Boolean(entidadIdPrefiltrado);

  const [entidadTipo, setEntidadTipo] = useState(entidadTipoInicial);
  const [entidadSel, setEntidadSel] = useState(null);
  const [cargandoEntidadPrefiltrada, setCargandoEntidadPrefiltrada] = useState(entidadPrefiltrada);

  const [mandanteIdWizard, setMandanteIdWizard] = useState("");
  const [proyectoSel, setProyectoSel] = useState(null);
  const [perfilSel, setPerfilSel] = useState(null);
  // Perfiles de Recurso (por ID) del sujeto en el Proyecto destino: Persona uno o más, Maquinaria uno.
  const [perfilRecursoIds, setPerfilRecursoIds] = useState([]);
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState("");

  const [perfilEstado, setPerfilEstado] = useState({
    necesitaPerfil: entidadTipo === "empresa", participacionExistente: null, cargando: false,
  });
  const [perfilExistenteNombre, setPerfilExistenteNombre] = useState(null);

  const [empresaNombre, setEmpresaNombre] = useState(null);
  const [origen, setOrigen] = useState(null);
  const [cargandoOrigen, setCargandoOrigen] = useState(false);
  const [conflictoDestino, setConflictoDestino] = useState(false);

  const [step, setStep] = useState(1);
  const [ejecutando, setEjecutando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);
  // Asignaciones vigentes que se finalizarán (409 CONFIRMACION_REQUERIDA): se listan con la
  // Empresa actual y se pide confirmación explícita antes de reenviar con confirmado: true.
  const [afectados, setAfectados] = useState(null);

  const mandanteEfectivo = esSuperAdmin ? mandanteIdWizard : profile?.mandanteId;
  const mandanteId = proyectoSel?.mandanteId || mandanteEfectivo;

  // Carga la entidad prefiltrada (entrada desde el detalle de una
  // Persona/Recurso/Empresa) y la adapta a la misma forma "fila" que
  // devuelve acreditacionService.listarEntidades, para que el resto del
  // wizard no necesite distinguir el origen del dato.
  useEffect(() => {
    if (!entidadIdPrefiltrado) return;
    setCargandoEntidadPrefiltrada(true);
    const cargar = async () => {
      try {
        if (entidadTipoInicial === "persona") {
          const p = await personaService.obtenerPorId(entidadIdPrefiltrado);
          setEntidadSel({
            id: p.id, nombre: `${p.nombre} ${p.apellido}`.trim(), rut: p.rut,
            cargo: p.empresaActual?.cargo || null, empresaId: p.empresaActual?.empresaId || null, estado: p.estado,
          });
        } else if (entidadTipoInicial === "maquinaria") {
          const r = await recursoService.obtenerPorId(entidadIdPrefiltrado);
          setEntidadSel({
            id: r.id, nombre: r.nombre, rut: r.patente,
            cargo: r.tipo, empresaId: r.empresaActual?.empresaId || null, estado: r.estado,
          });
        } else {
          const e = await empresaService.obtenerPorId(entidadIdPrefiltrado);
          setEntidadSel({
            id: e.id, nombre: e.razonSocial, rut: e.rut,
            cargo: null, empresaId: e.id, estado: e.estado,
          });
        }
      } catch (err) {
        setError(err.message || "No se pudo cargar la entidad seleccionada.");
      } finally {
        setCargandoEntidadPrefiltrada(false);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nombre de la Empresa para el panel lateral: la propia si entidadTipo
  // es "empresa", o la Empresa actual de la Persona/Recurso.
  useEffect(() => {
    const empresaId = entidadTipo === "empresa" ? entidadSel?.id : entidadSel?.empresaId;
    if (!empresaId) {
      setEmpresaNombre(null);
      return;
    }
    empresaService
      .obtenerPorId(empresaId)
      .then((e) => setEmpresaNombre(e?.razonSocial || null))
      .catch(() => setEmpresaNombre(null));
  }, [entidadTipo, entidadSel]);

  // Nombre del Perfil de una Participación EXISTENTE que se va a
  // reutilizar (persona/maquinaria cuya Empresa ya participa en el
  // Proyecto destino) — solo para mostrarlo en el panel lateral.
  useEffect(() => {
    const id = perfilEstado.participacionExistente?.perfilParticipacionId;
    if (!id) {
      setPerfilExistenteNombre(null);
      return;
    }
    perfilParticipacionService
      .obtenerPorId(id)
      .then((p) => setPerfilExistenteNombre(p?.nombre || null))
      .catch(() => setPerfilExistenteNombre(null));
  }, [perfilEstado.participacionExistente]);

  // Origen (acreditación actual a cerrar): misma regla de desempate que
  // usa el backend — la más reciente por fechaInicio entre las
  // Participaciones activas de la entidad, en cualquier Proyecto. También
  // detecta si ya está activa en el Proyecto destino CON SU MISMA Empresa
  // (el backend lo rechaza con 409; con otra Empresa es un cambio de
  // empresa dentro del Proyecto y se permite).
  useEffect(() => {
    if (!entidadSel) {
      setOrigen(null);
      setConflictoDestino(false);
      return undefined;
    }
    let vigente = true;
    setCargandoOrigen(true);
    const cargar = async () => {
      try {
        const activas = entidadTipo === "empresa" ?
            (await participacionService.listar({ empresaId: entidadSel.id }))
                .filter((p) => p.estado === "activa") :
            (await sujetoService.listar(
                entidadTipo === "persona" ?
                    { personaId: entidadSel.id, estado: "activa" } :
                    { recursoId: entidadSel.id, estado: "activa" },
            ));

        if (!vigente) return;

        const empresaDelSujeto = entidadTipo === "empresa" ? entidadSel.id : entidadSel.empresaId;
        const conflicto = proyectoSel
          ? activas.some((a) => a.proyectoId === proyectoSel.id && a.empresaId === empresaDelSujeto)
          : false;
        setConflictoDestino(conflicto);

        const origenActivo = masReciente(activas);
        if (origenActivo) {
          const proyecto = await proyectoService.obtenerPorId(origenActivo.proyectoId);
          if (!vigente) return;
          setOrigen({
            proyectoNombre: proyecto?.nombre || origenActivo.proyectoId,
            fechaInicio: origenActivo.fechaInicio,
            fechaTermino: origenActivo.fechaTermino,
          });
        } else {
          setOrigen(null);
        }
      } catch {
        if (vigente) {
          setOrigen(null);
          setConflictoDestino(false);
        }
      } finally {
        if (vigente) setCargandoOrigen(false);
      }
    };
    cargar();
    return () => {
      vigente = false;
    };
  }, [entidadTipo, entidadSel, proyectoSel]);

  const handleCambiarTipo = (tipo) => {
    setEntidadTipo(tipo);
    setEntidadSel(null);
    setPerfilSel(null);
    setPerfilRecursoIds([]);
  };

  const pasosActivos = useMemo(() => {
    const base = [
      { key: "proyecto", label: "Proyecto" },
      { key: "entidad", label: "Entidad" },
      { key: "perfil", label: ETIQUETA_PASO_PERFIL[entidadTipo] },
      { key: "participacion", label: "Participación" },
      { key: "requerimientos", label: "Requerimientos" },
      { key: "confirmacion", label: "Confirmación" },
    ];
    return entidadPrefiltrada ? base.filter((p) => p.key !== "entidad") : base;
  }, [entidadTipo, entidadPrefiltrada]);

  const pasoActualKey = pasosActivos[step - 1]?.key;
  const perfilEfectivoId = perfilSel?.id || perfilEstado.participacionExistente?.perfilParticipacionId || null;

  const puedeContinuar =
    pasoActualKey === "proyecto" ? Boolean(proyectoSel) :
    pasoActualKey === "entidad" ? Boolean(entidadSel) :
    pasoActualKey === "perfil" ?
        (entidadTipo === "empresa" ? true : perfilRecursoIds.length > 0) &&
        (!perfilEstado.necesitaPerfil || Boolean(perfilSel)) &&
        !perfilEstado.cargando :
    pasoActualKey === "participacion" ? Boolean(fechaInicio) && !conflictoDestino :
    pasoActualKey === "requerimientos" ? true :
    false;

  const handleAtras = () => {
    if (resultado) return;
    if (step === 1) {
      navigate(-1);
      return;
    }
    setStep((s) => s - 1);
  };

  const handleContinuar = () => {
    if (!puedeContinuar) return;
    setStep((s) => s + 1);
  };

  const handleConfirmar = async (confirmado = false) => {
    setEjecutando(true);
    setError(null);
    try {
      const payload = {
        entidadTipo,
        entidadId: entidadSel.id,
        proyectoDestinoId: proyectoSel.id,
        fechaInicio,
        fechaFin: fechaFin || undefined,
        confirmado,
      };
      if (entidadTipo === "empresa") {
        payload.perfilParticipacionId = perfilSel?.id;
      } else {
        payload.perfilRecursoIds = perfilRecursoIds;
        if (perfilEstado.necesitaPerfil) payload.perfilParticipacionId = perfilSel?.id;
      }
      const data = await acreditacionService.reemplazar(payload);
      setAfectados(null);
      setResultado(data);
    } catch (err) {
      if (err.codigo === "CONFIRMACION_REQUERIDA") {
        setAfectados(err.detalle?.afectados || []);
      } else {
        setAfectados(null);
        setError(err.message || "No se pudo reemplazar la acreditación.");
      }
    } finally {
      setEjecutando(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary-lighter text-primary-dark flex items-center justify-center flex-shrink-0">
            <Repeat className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-carbon-dark tracking-tight">Reemplazar Acreditación</h2>
            <p className="text-xs text-gray-500 mt-1">
              Mueve una Persona, Maquinaria o Empresa a otro Proyecto, cerrando su acreditación actual y
              reutilizando la documentación vigente.
            </p>
          </div>
        </div>
      </div>

      <StepIndicator pasos={pasosActivos} step={step} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 min-w-0 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card">
            {pasoActualKey === "proyecto" && (
              <PasoProyecto
                esSuperAdmin={esSuperAdmin}
                actorMandanteId={profile?.mandanteId}
                mandanteIdWizard={mandanteIdWizard}
                onElegirMandante={setMandanteIdWizard}
                proyectoId={proyectoSel?.id}
                onSeleccionar={setProyectoSel}
              />
            )}
            {pasoActualKey === "entidad" && (
              <PasoEntidad
                entidadTipo={entidadTipo}
                onCambiarTipo={handleCambiarTipo}
                entidadSel={entidadSel}
                onSeleccionar={setEntidadSel}
              />
            )}
            {pasoActualKey === "perfil" && (
              cargandoEntidadPrefiltrada ? (
                <p className="text-xs text-slate-400 py-8 text-center">Cargando...</p>
              ) : (
                <PasoPerfilOEmpresa
                  entidadTipo={entidadTipo}
                  entidadSel={entidadSel}
                  proyectoSel={proyectoSel}
                  mandanteId={mandanteId}
                  perfilSel={perfilSel}
                  onSeleccionarPerfil={setPerfilSel}
                  perfilRecursoIds={perfilRecursoIds}
                  onCambiarPerfiles={setPerfilRecursoIds}
                  onEstadoChange={setPerfilEstado}
                />
              )
            )}
            {pasoActualKey === "participacion" && (
              <PasoParticipacionFechas
                entidadSel={entidadSel}
                origen={origen}
                cargandoOrigen={cargandoOrigen}
                conflictoDestino={conflictoDestino}
                fechaInicio={fechaInicio}
                onFechaInicioChange={setFechaInicio}
                fechaFin={fechaFin}
                onFechaFinChange={setFechaFin}
              />
            )}
            {pasoActualKey === "requerimientos" && (
              <PasoRequerimientosPreview
                entidadTipo={entidadTipo}
                entidadId={entidadSel?.id}
                perfilParticipacionId={perfilEfectivoId}
                fechaInicio={fechaInicio}
                perfilRecursoIds={perfilRecursoIds}
              />
            )}
            {pasoActualKey === "confirmacion" && (
              <PasoConfirmacionReemplazo
                entidadTipo={entidadTipo}
                entidadSel={entidadSel}
                proyectoSel={proyectoSel}
                perfilSel={perfilSel}
                perfilRecursoIds={perfilRecursoIds}
                fechaInicio={fechaInicio}
                fechaFin={fechaFin}
                ejecutando={ejecutando}
                error={error}
                resultado={resultado}
                onConfirmar={() => handleConfirmar(false)}
              />
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleAtras}
              disabled={Boolean(resultado)}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-40"
            >
              Atrás
            </button>
            {pasoActualKey !== "confirmacion" ? (
              <button
                type="button"
                onClick={handleContinuar}
                disabled={!puedeContinuar}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all disabled:opacity-50"
              >
                Continuar
              </button>
            ) : resultado && (
              <button
                type="button"
                onClick={() => navigate(`/expedientes/${resultado.expedienteNuevoId || resultado.expedienteId}`)}
                className="px-4 py-2 text-xs font-bold text-primary hover:text-primary-dark"
              >
                Ver Expediente →
              </button>
            )}
          </div>
        </div>

        <ResumenReemplazoPanel
          entidadTipo={entidadTipo}
          entidadSel={entidadSel}
          empresaNombre={empresaNombre}
          origen={origen}
          cargandoOrigen={cargandoOrigen}
          proyectoSel={proyectoSel}
          perfilSel={perfilSel}
          perfilExistenteNombre={perfilExistenteNombre}
          perfilRecursoIds={perfilRecursoIds}
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
        />
      </div>
      {afectados && (
        <ConfirmacionModal
          peligro
          titulo="Se finalizarán asignaciones vigentes"
          mensaje={`Para continuar con ${proyectoSel?.nombre || "el Proyecto destino"} se finalizarán las siguientes asignaciones. Revise la lista y confirme.`}
          items={afectados.map((a) => ({
            key: `${a.tipo}-${a.id}-${a.proyectoId}`,
            principal: a.nombre,
            secundario: `Empresa actual: ${a.empresaNombre || "—"} · Proyecto: ${a.proyectoNombre || "—"}`,
          }))}
          textoConfirmar="Confirmar reemplazo"
          ocupado={ejecutando}
          onCancelar={() => setAfectados(null)}
          onConfirmar={() => handleConfirmar(true)}
        />
      )}
    </div>
  );
};
