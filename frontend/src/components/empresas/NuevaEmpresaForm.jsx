import { useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, HardHat } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { empresaService } from "../../services/empresaService";
import { carpetaEmpresaService } from "../../services/carpetaEmpresaService";
import { listarDirectorio, obtenerArchivo } from "../../services/fuentes/carpetaLocal";
import { extraerTextoDocumento } from "../../utils/textoDocumento";
import {
  carpetasConPalabraClave, documentoPreferido, documentosParaAnalizar, nombreDesdeCarpeta, propuestaRazonSocial, propuestaRut, rutsCandidatos,
} from "../../utils/datosEmpresaCarpeta";
import { BloqueCarpetaEmpresa } from "./BloqueCarpetaEmpresa";
import { useFuenteNuevaEmpresa } from "../../hooks/useFuenteNuevaEmpresa";
import { PanelCarpetaEmpresa } from "./PanelCarpetaEmpresa";
import { storageService } from "../../services/storageService";
import { getMandanteDisplayName } from "../../utils/mandanteDisplay";
import { formatRutDisplay, validateRut, cleanRut } from "../../utils/rutFormatters";
import { aMayusculas } from "../../utils/texto";
import { OPCIONES_ACTIVO_INACTIVO } from "../../utils/opcionesFormulario";
import { useMandanteContexto } from "../../hooks/useMandanteContexto";
import { ConfirmacionModal } from "../shared/ConfirmacionModal";
import { OpcionesRadio } from "../shared/OpcionesRadio";
import { EmpresaLogoUploader } from "../shared/EmpresaLogoUploader";
import { CampoMandante } from "../shared/CampoMandante";

const VACIO = {
  rut: "", razonSocial: "", nombreFantasia: "", giro: "", estado: "activo",
  contactoNombre: "", contactoEmail: "", contactoTelefono: "",
};

// Estilos de cada variante (los de cada pantalla antes de unificarlas).
const ESTILOS = {
  completa: {
    label: "block text-xs font-semibold text-gray-700 mb-1.5",
    input: "w-full px-3.5 py-2.5 bg-gray-50/50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed",
    error: "text-xs text-red-500 mt-1",
    grid: "grid grid-cols-1 md:grid-cols-2 gap-4",
  },
  compacta: {
    label: "block text-[11px] font-semibold text-gray-700 mb-1",
    input: "w-full px-3 py-2 bg-white border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
    error: "text-[11px] text-red-500 mt-1",
    grid: "grid grid-cols-1 md:grid-cols-2 gap-3",
  },
};

// Formulario ÚNICO para crear una Empresa. Lo usan:
//  - la página /empresas/nuevo (variante "completa"): Mandante (fijo, único o elegido), logo,
//    estado y contacto, en tarjetas;
//  - el paso Empresa de Nueva Acreditación (variante "compacta"): Mandante del flujo (`mandanteId`)
//    y solo RUT, giro, razón social y nombre de fantasía (estado activo, sin contacto).
// Mismas validaciones en ambas; el backend valida de nuevo y garantiza el RUT único. Si el RUT ya
// existe (409 RUT_EXISTENTE) no se duplica: "completa" ofrece asociar la Empresa al Mandante (o
// avisa si ya lo está) y "compacta" ofrece usarla (asociándola si hace falta).
// `onCreada(empresa)`: la Empresa creada o la existente que se usa (en "completa", tras asociar,
// sin datos). `onCancelar`: botón Cancelar.
// Nueva Empresa desde carpeta (solo superadmin, con fuente local autorizada): al elegir la carpeta se
// proponen los datos (nombre de fantasía desde la carpeta; RUT jurídico y razón social desde el texto
// de hasta 5 documentos; con IA, a pedido), cada uno con su origen, y el formulario se ensancha con
// los documentos a la izquierda (`onAncho(true)`). Al guardar, la carpeta queda registrada a la
// empresa en el mismo lote. Nada se guarda sin confirmar.
export const NuevaEmpresaForm = ({ variante = "completa", mandanteId: mandanteFijo = null, onCreada, onCancelar, onAncho }) => {
  const completa = variante === "completa";
  const e = ESTILOS[completa ? "completa" : "compacta"];
  const contextoMandante = useMandanteContexto({ activo: completa });
  const mandanteId = completa ? contextoMandante.mandanteId : mandanteFijo;
  const rutRef = useRef(null);
  const { profile } = useAuth();
  const fuenteNE = useFuenteNuevaEmpresa(profile?.uid, mandanteId, profile?.rol === "superadmin");

  const [formData, setFormData] = useState(VACIO);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);
  // 409 RUT_EXISTENTE: Empresa ya registrada con ese RUT.
  const [rutExistente, setRutExistente] = useState(null);
  const [asociando, setAsociando] = useState(false);

  // ── Carpeta de la empresa ──
  const [carpeta, setCarpeta] = useState(null); // ruta en la fuente, o null
  const [docInicial, setDocInicial] = useState(null);
  const [origenes, setOrigenes] = useState({}); // campo → "Desde nombre de carpeta" | "Desde documento «X»" | "Extraído con IA"
  const [analisis, setAnalisis] = useState(null); // { analizando } | { revisados, conTexto }
  const [propuestaIA, setPropuestaIA] = useState(null); // { documento, conflictos, direccion, rutInvalido }
  const [pestana, setPestana] = useState("datos"); // pantallas angostas
  const formRef = useRef(formData);
  useEffect(() => { formRef.current = formData; }, [formData]);
  useEffect(() => { onAncho?.(Boolean(carpeta)); }, [carpeta, onAncho]);

  // Propone un valor si el campo está vacío (o `forzar`), con su origen.
  const aplicar = (campo, valor, origen, forzar = false) => {
    if (!valor || (!forzar && String(formRef.current[campo] || "").trim())) return false;
    const v = campo === "rut" ? formatRutDisplay(valor) : campo === "razonSocial" || campo === "nombreFantasia" ? aMayusculas(valor) : valor;
    formRef.current = { ...formRef.current, [campo]: v };
    setFormData((p) => ({ ...p, [campo]: v }));
    setOrigenes((o) => ({ ...o, [campo]: origen }));
    setErrors((p) => ({ ...p, [campo]: null }));
    return true;
  };

  const elegirCarpeta = async (ruta) => {
    const handle = fuenteNE.base.handle;
    setCarpeta(ruta);
    setPropuestaIA(null);
    setPestana("datos");
    const nombre = nombreDesdeCarpeta(ruta);
    aplicar("nombreFantasia", nombre, "Desde nombre de carpeta");
    setAnalisis({ analizando: true });
    try {
      const raiz = await listarDirectorio(handle, ruta);
      // Archivos de la raíz y de las subcarpetas con palabra clave (certificado, escritura, F30...).
      const archivos = [...(raiz?.archivos || [])];
      for (const c of carpetasConPalabraClave(raiz?.carpetas)) {
        archivos.push(...((await listarDirectorio(handle, c.ruta).catch(() => null))?.archivos || []));
      }
      setDocInicial(documentoPreferido(archivos)?.ruta || null);
      const textos = [];
      for (const d of documentosParaAnalizar(archivos)) {
        const file = await obtenerArchivo(handle, d.ruta).catch(() => null);
        const t = file ? await extraerTextoDocumento(file) : null;
        if (t?.conTexto) textos.push({ texto: t.texto, documento: d.nombre });
      }
      const rut = propuestaRut(rutsCandidatos(textos));
      if (rut) aplicar("rut", rut.rut, `Desde documento «${rut.documentos[0]}»`);
      const rs = propuestaRazonSocial({ textos, rut: rut?.rut, nombreFantasia: nombre });
      if (rs) aplicar("razonSocial", rs.razonSocial, `Desde documento «${rs.documento}»`);
      setAnalisis({ revisados: documentosParaAnalizar(archivos).length, conTexto: textos.length, rut: Boolean(rut), razonSocial: Boolean(rs) });
    } catch {
      setAnalisis({ revisados: 0, conTexto: 0 });
    }
  };
  const quitarCarpeta = () => {
    setCarpeta(null);
    setDocInicial(null);
    setAnalisis(null);
    setPropuestaIA(null);
    setOrigenes({});
  };

  // Datos de la IA: completa los campos vacíos; si difieren de lo propuesto, se muestran ambos.
  const alExtraerIA = (r, documento) => {
    const campos = r.campos || {};
    const conflictos = [];
    ["razonSocial", "rut", "giro"].forEach((campo) => {
      const valor = campos[campo]?.valor;
      if (!valor || (campo === "rut" && !r.rutValido)) return;
      const actual = String(formRef.current[campo] || "").trim();
      const normal = (x) => String(x || "").replace(/[^0-9a-z]/gi, "").toLowerCase();
      if (!actual) aplicar(campo, valor, "Extraído con IA");
      else if (normal(actual) !== normal(valor)) conflictos.push({ campo, actual, ia: valor, confianza: campos[campo]?.confianza ?? null });
    });
    setPropuestaIA({ documento, conflictos, direccion: campos.direccion?.valor || null,
      rutInvalido: campos.rut?.valor && !r.rutValido ? campos.rut.valor : null });
  };

  // Logo elegido antes de crear (solo "completa"): se sube al obtener el ID real.
  const [logoPendiente, setLogoPendiente] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const handleLogoSeleccionado = (archivo) => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPendiente(archivo);
    setLogoPreviewUrl(URL.createObjectURL(archivo));
  };
  useEffect(() => () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    // Solo al desmontar (evita una fuga si se navega fuera sin guardar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (ev) => {
    const { name, value } = ev.target;
    const valor = name === "rut" ? formatRutDisplay(value)
      : name === "razonSocial" || name === "nombreFantasia" ? aMayusculas(value)
        : name === "contactoTelefono" ? value.replace(/\D/g, "").slice(0, 11) : value;
    setFormData((prev) => ({ ...prev, [name]: valor }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
    // Editado a mano: deja de ser una propuesta.
    if (origenes[name]) setOrigenes((o) => { const n = { ...o }; delete n[name]; return n; });
  };

  const validateForm = () => {
    const nuevos = {};
    if (!formData.razonSocial.trim()) nuevos.razonSocial = "La razón social es obligatoria.";
    if (!formData.giro.trim()) nuevos.giro = "El giro es obligatorio.";
    if (completa && !mandanteId) nuevos.mandanteId = "Seleccione el Mandante.";
    if (!formData.rut.trim()) nuevos.rut = "El RUT es obligatorio.";
    else if (!validateRut(formData.rut)) nuevos.rut = "El RUT ingresado no es válido.";
    if (completa && formData.contactoEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactoEmail)) {
      nuevos.contactoEmail = "Email inválido.";
    }
    if (completa && formData.contactoTelefono && !/^\d{1,11}$/.test(formData.contactoTelefono)) {
      nuevos.contactoTelefono = "El teléfono debe contener solo números, sin espacios ni símbolos, máximo 11 dígitos.";
    }
    setErrors(nuevos);
    return Object.keys(nuevos).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setServerError(null);
    if (!validateForm()) return;
    setLoading(true);
    const hayContacto = completa && (formData.contactoNombre || formData.contactoEmail || formData.contactoTelefono);
    try {
      const nueva = await empresaService.crear({
        rut: cleanRut(formData.rut),
        razonSocial: formData.razonSocial.trim(),
        nombreFantasia: formData.nombreFantasia.trim() || formData.razonSocial.trim(),
        giro: formData.giro.trim(),
        estado: completa ? formData.estado : "activo",
        contacto: hayContacto ? {
          nombre: formData.contactoNombre.trim() || null,
          email: formData.contactoEmail.trim() || null,
          telefono: formData.contactoTelefono.trim() || null,
        } : null,
        mandanteId,
        ...(carpeta ? { carpeta: { ruta: carpeta }, origenes } : {}),
      });
      if (completa && logoPendiente) {
        // Best-effort: la Empresa ya quedó creada; si el logo falla no se revierte (se navega fuera,
        // por eso un alert y no el banner).
        try {
          const { url } = await storageService.subirLogoEmpresa(nueva.id, logoPendiente);
          await empresaService.actualizar(nueva.id, { logoUrl: url });
        } catch (logoErr) {
          console.error("Error al subir el logo de la nueva empresa:", logoErr);
          window.alert("La Empresa se creó correctamente, pero no se pudo subir el logo. Puedes intentarlo de nuevo desde 'Editar'.");
        }
      }
      onCreada?.(nueva);
    } catch (err) {
      if (err.codigo === "RUT_EXISTENTE") setRutExistente(err.detalle || {});
      else setServerError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // RUT existente → "completa": asociarla al Mandante elegido; "compacta": usarla (asociándola si
  // hace falta) y devolverla.
  const resolverExistente = async () => {
    setAsociando(true);
    try {
      if (!rutExistente.yaAsociada) await empresaService.asociarMandante(rutExistente.empresaId, mandanteId);
      const empresa = completa ? null : await empresaService.obtenerPorId(rutExistente.empresaId);
      setRutExistente(null);
      onCreada?.(empresa);
    } catch (err) {
      setRutExistente(null);
      setServerError(err.message || "No se pudo asociar la Empresa.");
    } finally {
      setAsociando(false);
    }
  };

  // RUT existente con carpeta elegida: la carpeta se registra a la empresa existente (asociándola al
  // Mandante si hace falta) en vez de crear otra.
  const vincularCarpetaAExistente = async () => {
    setAsociando(true);
    try {
      if (!rutExistente.yaAsociada) await empresaService.asociarMandante(rutExistente.empresaId, mandanteId);
      await carpetaEmpresaService.registrar({ mandanteId, ruta: carpeta, empresaId: rutExistente.empresaId });
      const empresa = completa ? null : await empresaService.obtenerPorId(rutExistente.empresaId);
      setRutExistente(null);
      onCreada?.(empresa);
    } catch (err) {
      setRutExistente(null);
      setServerError(err.message || "No se pudo vincular la carpeta.");
    } finally {
      setAsociando(false);
    }
  };

  const nombreMandante = getMandanteDisplayName(contextoMandante.mandante) || "el Mandante";
  const rutTexto = rutExistente ? `${rutExistente.razonSocial || (completa ? "Una Empresa" : "La Empresa")} (RUT ${formatRutDisplay(rutExistente.rut || "")})` : "";
  const chip = (campo) => origenes[campo] && (
    <span className="ml-1.5 inline-flex items-center px-1.5 py-px rounded-full bg-primary-lighter text-primary text-[10px] font-bold align-middle">{origenes[campo]}</span>
  );
  const conError = (campo) => `${e.input} ${errors[campo] ? (completa ? "border-red-400 bg-red-50/30" : "border-red-400") : "border-gray-200"}`;
  const banner = serverError && (
    <div className={completa ? "flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm" : "flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs"}>
      <AlertCircle className={completa ? "w-5 h-5 flex-shrink-0" : "w-4 h-4 flex-shrink-0"} />
      <span>{serverError}</span>
    </div>
  );

  const camposIdentificacion = (
    <div className={e.grid}>
      <div>
        <label className={e.label}>RUT *{chip("rut")}</label>
        <input ref={rutRef} type="text" name="rut" value={formData.rut} onChange={handleChange} placeholder="76.123.456-7" maxLength={12} className={conError("rut")} />
        {errors.rut && <p className={e.error}>{errors.rut}</p>}
      </div>
      <div>
        <label className={e.label}>Giro *{chip("giro")}</label>
        <input type="text" name="giro" value={formData.giro} onChange={handleChange} placeholder="Ej: Construcción y obras civiles" className={conError("giro")} />
        {errors.giro && <p className={e.error}>{errors.giro}</p>}
      </div>
      <div className="md:col-span-2">
        <label className={e.label}>Razón Social *{chip("razonSocial")}</label>
        <input type="text" name="razonSocial" value={formData.razonSocial} onChange={handleChange} placeholder="Constructora Ejemplo S.A." className={conError("razonSocial")} />
        {errors.razonSocial && <p className={e.error}>{errors.razonSocial}</p>}
      </div>
      <div className={completa ? "" : "md:col-span-2"}>
        <label className={e.label}>Nombre Fantasía{chip("nombreFantasia")}</label>
        <input type="text" name="nombreFantasia" value={formData.nombreFantasia} onChange={handleChange} placeholder="Constructora Ejemplo" className={`${e.input} border-gray-200`} />
      </div>
      {completa && (
        <div>
          <label className={e.label}>Estado</label>
          <OpcionesRadio name="estado" value={formData.estado} onChange={handleChange} opciones={OPCIONES_ACTIVO_INACTIVO} ariaLabel="Estado" />
        </div>
      )}
    </div>
  );

  const ETIQUETAS = { razonSocial: "Razón social", rut: "RUT", giro: "Giro" };
  const bloqueCarpeta = (
    <>
      <BloqueCarpetaEmpresa fuenteNE={fuenteNE} ruta={carpeta} onElegir={elegirCarpeta} onQuitar={quitarCarpeta} compacto={!completa} />
      {carpeta && analisis && (
        <p className="text-[11px] text-slate-500">
          {analisis.analizando ? "Revisando los documentos de la carpeta..."
            : `Se revisaron ${analisis.revisados} documentos (${analisis.conTexto} con texto). ${analisis.rut ? "" : "No hay un RUT de empresa claro: elíjalo en el visor. "}${analisis.razonSocial ? "" : "La razón social no se propuso: cópiela desde el documento."}`}
        </p>
      )}
      {propuestaIA && (
        <div className="p-3 rounded-xl border border-sky-200 bg-sky-50 space-y-1.5 text-[11px] text-sky-900">
          <p className="flex items-center gap-1.5 font-bold"><Bot className="w-3.5 h-3.5" /> Datos de la IA desde «{propuestaIA.documento}»</p>
          {propuestaIA.conflictos.map((c) => (
            <div key={c.campo} className="flex flex-wrap items-center gap-2">
              <span>{ETIQUETAS[c.campo]}: actual <b>{c.actual}</b> · IA <b>{c.ia}</b>{c.confianza !== null ? ` (${Math.round(c.confianza * 100)}%)` : ""}</span>
              <button type="button" onClick={() => { aplicar(c.campo, c.ia, "Extraído con IA", true); setPropuestaIA((p) => ({ ...p, conflictos: p.conflictos.filter((x) => x.campo !== c.campo) })); }}
                className="font-bold text-primary hover:underline">Usar el de la IA</button>
              <button type="button" onClick={() => setPropuestaIA((p) => ({ ...p, conflictos: p.conflictos.filter((x) => x.campo !== c.campo) }))}
                className="font-bold text-slate-500 hover:underline">Mantener el actual</button>
            </div>
          ))}
          {propuestaIA.rutInvalido && <p className="text-amber-800">RUT leído «{propuestaIA.rutInvalido}» con dígito verificador inválido: no se propone.</p>}
          {propuestaIA.direccion && <p>Dirección: {propuestaIA.direccion} (informativa, no se guarda).</p>}
          {!propuestaIA.conflictos.length && !propuestaIA.rutInvalido && <p>Los campos vacíos se completaron con lo leído.</p>}
        </div>
      )}
    </>
  );
  // Con carpeta: documentos a la izquierda y formulario a la derecha (pestañas en pantallas angostas).
  const conPanel = (formulario) => (!carpeta || !fuenteNE.base.handle ? formulario : (
    <div className="space-y-3">
      <div className="lg:hidden inline-flex p-1 rounded-xl bg-slate-100" role="tablist">
        {[["documentos", "Documentos"], ["datos", "Datos de la empresa"]].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${pestana === k ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}>{t}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className={`${pestana === "documentos" ? "" : "hidden"} lg:block lg:sticky lg:top-4 h-[78vh]`}>
          <PanelCarpetaEmpresa
            key={`${carpeta}|${docInicial || ""}`}
            handle={fuenteNE.base.handle}
            ruta={carpeta}
            inicial={docInicial}
            mandanteId={mandanteId}
            onRut={(r, doc) => aplicar("rut", r, `Desde documento «${doc}»`, true)}
            onRazonSocial={(t, doc) => aplicar("razonSocial", t, `Desde documento «${doc}»`, true)}
            onIA={alExtraerIA}
          />
        </div>
        <div className={`${pestana === "datos" ? "" : "hidden"} lg:block min-w-0`}>{formulario}</div>
      </div>
    </div>
  ));

  const modalExistente = rutExistente && carpeta ? (
    <ConfirmacionModal
      titulo="Ya existe una Empresa con este RUT"
      mensaje={`Ya existe ${rutTexto} con este RUT. Puede vincular la carpeta «${carpeta}» a esa empresa en vez de crear otra${rutExistente.yaAsociada ? "" : ` (queda además asociada a ${completa ? nombreMandante : "este Mandante"})`}.`}
      textoConfirmar="Vincular la carpeta a esa empresa"
      ocupado={asociando}
      onCancelar={() => setRutExistente(null)} onConfirmar={vincularCarpetaAExistente}
    />
  ) : rutExistente && (completa && rutExistente.yaAsociada ? (
    <ConfirmacionModal
      titulo="La Empresa ya existe"
      mensaje={`${rutTexto} ya está registrada y asociada a ${nombreMandante}.`}
      textoConfirmar="Entendido" textoCancelar="Cerrar"
      onCancelar={() => setRutExistente(null)} onConfirmar={() => setRutExistente(null)}
    />
  ) : (
    <ConfirmacionModal
      titulo="Ya existe una Empresa con este RUT"
      mensaje={completa
        ? `${rutTexto} ya está registrada. Puede asociarla a ${nombreMandante} en vez de crear un duplicado. Los datos ingresados en este formulario no se aplicarán.`
        : rutExistente.yaAsociada
          ? `${rutTexto} ya está registrada y asociada a este Mandante. Puede usarla directamente.`
          : `${rutTexto} ya está registrada. Puede asociarla a este Mandante y usarla, en vez de crear un duplicado.`}
      textoConfirmar={completa ? "Asociar Empresa existente" : rutExistente.yaAsociada ? "Usar esta Empresa" : "Asociar y usar esta Empresa"}
      ocupado={asociando}
      onCancelar={() => setRutExistente(null)} onConfirmar={resolverExistente}
    />
  ));

  if (!completa) {
    return conPanel(
      <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-primary/20 bg-primary-lighter/40 space-y-3">
        {banner}
        {bloqueCarpeta}
        {camposIdentificacion}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900">Cancelar</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg shadow-sm transition-all disabled:opacity-50">
            {loading ? "Creando..." : "Crear y usar esta Empresa"}
          </button>
        </div>
        {modalExistente}
      </form>
    );
  }

  return conPanel(
    <div className="space-y-6">
      {banner}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <HardHat className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Identificación de la Empresa</h3>
          </div>
          <CampoMandante
            contexto={contextoMandante} error={errors.mandanteId} ayuda="La Empresa quedará asociada a este Mandante." focoRef={rutRef}
            onChange={() => setErrors((prev) => ({ ...prev, mandanteId: null }))}
          />
          {bloqueCarpeta}
          <EmpresaLogoUploader logoUrl={logoPreviewUrl} onArchivoSeleccionado={handleLogoSeleccionado} />
          {camposIdentificacion}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-card space-y-4">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider pb-3 border-b border-gray-100">Contacto (opcional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={e.label}>Nombre Contacto</label>
              <input type="text" name="contactoNombre" value={formData.contactoNombre} onChange={handleChange} placeholder="Juan Pérez" className={`${e.input} border-gray-200`} />
            </div>
            <div>
              <label className={e.label}>Email</label>
              <input type="email" name="contactoEmail" value={formData.contactoEmail} onChange={handleChange} placeholder="contacto@ejemplo.cl" className={conError("contactoEmail")} />
              {errors.contactoEmail && <p className={e.error}>{errors.contactoEmail}</p>}
            </div>
            <div>
              <label className={e.label}>Teléfono</label>
              <input type="text" name="contactoTelefono" value={formData.contactoTelefono} onChange={handleChange} placeholder="56912345678" maxLength={11} className={conError("contactoTelefono")} />
              {errors.contactoTelefono && <p className={e.error}>{errors.contactoTelefono}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onCancelar} className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-sm">Cancelar</button>
          <button
            type="submit" disabled={loading || !contextoMandante.modo || contextoMandante.modo === "ninguno"}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-xl shadow-md shadow-primary/25 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar Empresa"}
          </button>
        </div>
      </form>
      {modalExistente}
    </div>
  );
};
