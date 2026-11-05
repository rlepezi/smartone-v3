import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, FolderOpen, X } from "lucide-react";
import { SelectorCarpetaEmpresa } from "../../../components/expedientes/documentacion/SelectorCarpetaEmpresa";
import { useCarpetaBase } from "../../../hooks/useCarpetaBase";
import { useSubcarpetaBase } from "../../../hooks/useSubcarpetaBase";
import { fuenteDocumentalService } from "../../../services/fuenteDocumentalService";
import { carpetaEmpresaService } from "../../../services/carpetaEmpresaService";
import { empresaService } from "../../../services/empresaService";
import { empresasDeCarpeta, nombreDeRuta } from "../../../utils/deduccionEmpresaCarpeta";
import { carpetaDeUrlSharePoint } from "../../../utils/carpetaEmpresa";
import { MAPEO_VACIO } from "../../../utils/repositorioDocumental";
import { CLASE_SECUNDARIO } from "../../../components/expedientes/documentacion/estilos";

const sinBarraFinal = (url) => String(url || "").trim().replace(/\/+$/, "").toLowerCase();

// Paso "Carpeta de la empresa" de Nueva Acreditación (opcional). Con carpeta del proyecto local, lista
// sus subcarpetas (un clic) y permite "Elegir otra ubicación" (la fuente completa); sin ella, el
// selector de la fuente documental. El expediente aún no existe: el valor vive en el asistente
// ({ tipo, ruta, etiqueta, url, fuenteId, mapeo }) y al confirmar se registra en `carpetas` y se
// vincula. Al elegir:
//  - si la carpeta ya está registrada para OTRO proyecto, se rechaza ("Cada proyecto usa su propia
//    carpeta");
//  - si ya está registrada para este proyecto, se reutiliza (y su empresa queda elegida);
//  - si no, se deduce la empresa por el nombre de la carpeta: una → se elige; varias → se elige
//    entre ellas aquí; ninguna → aviso (se elige en el paso Empresa).
//  - carpetaProyecto: { tipo, ruta, url } del proyecto, o null.
//  - carpeta: useCarpetaWizard (handle temporal de la carpeta elegida, para la vista previa y el
//    paso de personal).
//  - onElegirEmpresa(empresa): empresa deducida o elegida entre las coincidentes.
// La carpeta del proyecto también puede ser la de la empresa (toda su documentación está en ella,
// con subcarpetas por tipo de documento): "Usar la carpeta del proyecto". Con `autoProyecto`, y sin
// carpeta elegida, se usa sola al entrar al paso; `onDescartar` avisa que se quitó (no se vuelve a
// elegir sola).
export const PasoCarpetaEmpresa = ({
  mandanteId, usuarioId, puedeConfigurarBase, proyectoId, carpetaProyecto, valor, carpeta, onCambiar,
  empresaSel, onElegirEmpresa, onOmitir, errorCarpeta = null, verificando = false, autoProyecto = false, onDescartar,
}) => {
  const [fuente, setFuente] = useState(undefined); // undefined: cargando
  const [registradas, setRegistradas] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [otraUbicacion, setOtraUbicacion] = useState(false);
  const [rechazo, setRechazo] = useState(null);
  const [deduccion, setDeduccion] = useState(null); // { tipo, empresas } de la última carpeta elegida
  const [verSubcarpetas, setVerSubcarpetas] = useState(false);

  useEffect(() => {
    let vigente = true;
    Promise.all([
      fuenteDocumentalService.activa(mandanteId).catch(() => null),
      carpetaEmpresaService.listar({ mandanteId }).catch(() => []),
      empresaService.listar("activo", { mandanteId }).catch(() => []),
    ]).then(([f, c, e]) => {
      if (!vigente) return;
      setFuente(f || null);
      setRegistradas(c || []);
      setEmpresas(e || []);
    });
    return () => { vigente = false; };
  }, [mandanteId]);

  const base = useCarpetaBase(usuarioId, mandanteId, { etiquetaFuente: fuente?.tipo === "local" ? fuente.etiqueta : null });
  // Con carpeta del proyecto local (y en la misma fuente), se listan sus subcarpetas.
  const enProyecto = !otraUbicacion && carpetaProyecto?.tipo === "local" && fuente?.tipo === "local"
    && (!carpetaProyecto.fuenteId || carpetaProyecto.fuenteId === fuente.id);
  const baseProyecto = useSubcarpetaBase(base, enProyecto ? carpetaProyecto.ruta : null);
  const proyectoNoEncontrado = enProyecto && baseProyecto.encontrada === false;
  const baseActiva = enProyecto && !proyectoNoEncontrado ? baseProyecto : base;
  const prefijo = enProyecto && !proyectoNoEncontrado ? `${carpetaProyecto.ruta}/` : "";

  // Carpeta ya registrada (misma fuente y ruta, o misma URL).
  const registroDe = useCallback((nuevo) => (registradas || []).find((c) => (c.fuenteId === nuevo.fuenteId || !nuevo.fuenteId) && (
    nuevo.tipo === "sharepoint" ? sinBarraFinal(c.url) === sinBarraFinal(nuevo.url) : c.ruta.toLowerCase() === nuevo.ruta.toLowerCase()
  )) || null, [registradas]);

  const aceptar = useCallback(async (nuevo, handle = null) => {
    setRechazo(null);
    const registro = registroDe(nuevo);
    if (registro?.proyectoId && registro.proyectoId !== proyectoId) {
      setRechazo(`La carpeta «${nuevo.ruta}» ya está registrada en ${registro.proyectoNombre || "otro proyecto"}${registro.empresaNombre ? ` (${registro.empresaNombre})` : ""}. Cada proyecto usa su propia carpeta.`);
      return;
    }
    if (handle) await carpeta.vincularHandle(handle);
    onCambiar({ ...nuevo, mapeo: valor?.ruta === nuevo.ruta ? valor.mapeo : MAPEO_VACIO });
    // La del proyecto no cambia la empresa ya elegida (su nombre es el del proyecto).
    if (nuevo.esCarpetaProyecto && empresaSel) {
      setDeduccion(null);
      return;
    }
    // Ya registrada para este proyecto: su empresa (se reutiliza el registro).
    const registrada = registro?.empresaId ? empresas.find((e) => e.id === registro.empresaId) : null;
    const d = registrada ? { tipo: "una", empresas: [registrada] } : empresasDeCarpeta(nombreDeRuta(nuevo.ruta), empresas);
    setDeduccion(d);
    if (d.tipo === "una") onElegirEmpresa(d.empresas[0]);
  }, [registroDe, proyectoId, carpeta, onCambiar, valor, empresas, onElegirEmpresa, empresaSel]);

  // Usa la carpeta del proyecto como la de la empresa (con su handle si está autorizada aquí, para la
  // vista previa y el paso de personal).
  const usarProyecto = useCallback(async () => {
    if (!carpetaProyecto) return;
    const etiqueta = nombreDeRuta(carpetaProyecto.ruta) || carpetaProyecto.ruta;
    await aceptar({
      tipo: carpetaProyecto.tipo, ruta: carpetaProyecto.ruta, etiqueta, url: carpetaProyecto.url || null,
      fuenteId: fuente?.id || carpetaProyecto.fuenteId || null, esCarpetaProyecto: true,
    }, carpetaProyecto.tipo === "local" && baseProyecto.encontrada ? baseProyecto.handle : null);
  }, [carpetaProyecto, aceptar, fuente, baseProyecto.encontrada, baseProyecto.handle]);
  // Elegida sola al entrar, cuando se sabe si hay acceso a la carpeta (local) o de inmediato
  // (SharePoint).
  const autoHecho = useRef(false);
  const accesoResuelto = carpetaProyecto?.tipo !== "local" || baseProyecto.encontrada !== null
    || !(base.handle && base.coincideFuente && base.permiso === "granted");
  // ¿Alguna subcarpeta del proyecto lleva el nombre de una empresa del Mandante? Si ninguna (sus
  // subcarpetas son tipos de documento: «00. Revisión…», «01. Cronograma…»), la carpeta del proyecto
  // ES la de la empresa: se usa sola y no hace falta listar sus subcarpetas. null: no se sabe (sin
  // acceso aquí o SharePoint).
  const subcarpetasDeEmpresas = enProyecto && baseProyecto.encontrada && baseProyecto.subcarpetas
    ? baseProyecto.subcarpetas.filter((c) => empresasDeCarpeta(c.nombre, empresas).tipo !== "ninguna") : null;
  const proyectoEsDeLaEmpresa = subcarpetasDeEmpresas !== null && subcarpetasDeEmpresas.length === 0;
  const listarSubcarpetas = !enProyecto || proyectoNoEncontrado || !proyectoEsDeLaEmpresa || verSubcarpetas;
  useEffect(() => {
    if (!autoProyecto || valor || !carpetaProyecto || fuente === undefined || registradas === null || !accesoResuelto || autoHecho.current) return;
    // Con subcarpetas de empresas dentro del proyecto, se elige la de la empresa (no la del proyecto).
    if (subcarpetasDeEmpresas?.length) return;
    autoHecho.current = true;
    Promise.resolve().then(usarProyecto).catch(() => {});
  }, [autoProyecto, valor, carpetaProyecto, fuente, registradas, accesoResuelto, usarProyecto, subcarpetasDeEmpresas]);

  const { subcarpeta } = baseActiva;
  const elegir = useCallback(async (nombre) => {
    const ruta = `${prefijo}${nombre}`;
    await aceptar({ tipo: "local", ruta, etiqueta: nombre, url: null, fuenteId: fuente?.id || null }, await subcarpeta(nombre));
  }, [prefijo, aceptar, fuente, subcarpeta]);
  const elegirUrl = (url) => {
    const ruta = carpetaDeUrlSharePoint(url) || "";
    aceptar({ tipo: "sharepoint", ruta, etiqueta: ruta, url, fuenteId: fuente?.id || null });
  };
  const quitar = async () => {
    await carpeta.olvidar();
    setDeduccion(null);
    setRechazo(null);
    onCambiar(null);
    onDescartar?.();
  };

  const cargando = fuente === undefined || registradas === null;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto">
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900"><FolderOpen className="w-4 h-4 text-primary" /> Carpeta de la empresa (opcional)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Elige la carpeta de la empresa {enProyecto ? "dentro de la carpeta del proyecto" : "en la fuente documental del Mandante"}: el sistema
            busca la empresa por su nombre. Puedes omitirla y vincularla después desde el expediente.
          </p>
        </div>
        <button type="button" onClick={onOmitir} className={CLASE_SECUNDARIO}>Omitir este paso</button>
      </div>

      {valor && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 text-xs">
          {valor.tipo === "sharepoint" ? <Cloud className="w-4 h-4 text-primary" /> : <FolderOpen className="w-4 h-4 text-primary" />}
          <span className="min-w-0 mr-auto">
            <b className="block text-carbon-dark truncate">{valor.etiqueta || nombreDeRuta(valor.ruta)}</b>
            <span className="block truncate text-slate-500">
              {valor.esCarpetaProyecto ? "Carpeta del proyecto · " : ""}{valor.tipo === "sharepoint" ? valor.url : valor.ruta}
            </span>
          </span>
          {verificando && <span className="text-slate-400">Verificando...</span>}
          <button type="button" onClick={quitar} className={CLASE_SECUNDARIO}><X className="w-3.5 h-3.5" /> Quitar</button>
        </div>
      )}

      {valor && deduccion?.tipo === "una" && empresaSel?.id === deduccion.empresas[0].id && (
        <p className="text-xs text-sage-darker">Empresa: <b>{deduccion.empresas[0].razonSocial}</b> (por el nombre de la carpeta).</p>
      )}
      {valor && deduccion?.tipo === "varias" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-600">Varias empresas coinciden con la carpeta:</span>
          <select value={deduccion.empresas.some((e) => e.id === empresaSel?.id) ? empresaSel.id : ""}
            onChange={(e) => { const emp = deduccion.empresas.find((x) => x.id === e.target.value); if (emp) onElegirEmpresa(emp); }}
            aria-label="Empresa de la carpeta" className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs">
            <option value="">Elija la empresa…</option>
            {deduccion.empresas.map((e) => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
          </select>
        </div>
      )}
      {valor && deduccion?.tipo === "ninguna" && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Ninguna empresa del Mandante coincide con el nombre de la carpeta: elígela en el paso siguiente.
        </p>
      )}
      {rechazo && <p role="alert" className="text-xs text-red-600">{rechazo}</p>}
      {errorCarpeta && <p role="alert" className="text-xs text-red-600">{errorCarpeta}</p>}

      {cargando ? (
        <p className="text-xs text-slate-400">Buscando la fuente documental...</p>
      ) : (
        <>
          {carpetaProyecto && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-100 bg-slate-50/60 text-xs">
              <span className="mr-auto text-slate-600">
                ¿La documentación de la empresa está directamente en la carpeta del proyecto
                «{nombreDeRuta(carpetaProyecto.ruta) || carpetaProyecto.ruta}»?
              </span>
              {valor?.esCarpetaProyecto ? (
                <span className="inline-flex items-center gap-1 font-bold text-sage-darker"><CheckCircle2 className="w-4 h-4" /> En uso</span>
              ) : (
                <button type="button" onClick={usarProyecto} className={CLASE_SECUNDARIO}><FolderOpen className="w-3.5 h-3.5" /> Usar la carpeta del proyecto</button>
              )}
            </div>
          )}
          {proyectoEsDeLaEmpresa && !verSubcarpetas && (
            <p className="text-[11px] text-slate-500">
              Ninguna subcarpeta del proyecto lleva el nombre de una empresa: la documentación de la empresa está en la carpeta del
              proyecto.{" "}
              <button type="button" onClick={() => setVerSubcarpetas(true)} className="font-bold text-primary hover:underline">Ver subcarpetas igualmente</button>
            </p>
          )}
          {carpetaProyecto && listarSubcarpetas && <p className="text-[11px] text-slate-500">O elige una subcarpeta si la empresa tiene la suya dentro del proyecto:</p>}
          {proyectoNoEncontrado && (
            <p className="text-xs text-amber-700">{baseProyecto.error} Se muestra la fuente documental completa.</p>
          )}
          {listarSubcarpetas && <SelectorCarpetaEmpresa
            fuente={fuente}
            base={baseActiva}
            empresa={null}
            autoElegir={false}
            seleccionada={valor?.tipo === "local" && valor.ruta.startsWith(prefijo) ? valor.ruta.slice(prefijo.length) : null}
            onElegir={elegir}
            onElegirUrl={elegirUrl}
            puedeConfigurarBase={puedeConfigurarBase}
            etiquetaRaiz={enProyecto && !proyectoNoEncontrado ? "Carpeta del proyecto" : null}
          />}
          {enProyecto && !proyectoNoEncontrado && (
            <button type="button" onClick={() => setOtraUbicacion(true)} className="text-xs font-bold text-primary hover:underline">Elegir otra ubicación</button>
          )}
          {otraUbicacion && carpetaProyecto?.tipo === "local" && (
            <button type="button" onClick={() => setOtraUbicacion(false)} className="text-xs font-bold text-primary hover:underline">Volver a la carpeta del proyecto</button>
          )}
          {!fuente && <p className="text-xs text-slate-500">Puedes continuar sin carpeta.</p>}
        </>
      )}
    </section>
  );
};
