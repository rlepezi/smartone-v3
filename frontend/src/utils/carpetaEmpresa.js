// ¿La carpeta vinculada como repositorio documental es de la Empresa? Se valida solo por el
// NOMBRE de la carpeta (carpeta local) o el último tramo de la URL (SharePoint). Funciones puras.
// Réplica exacta en el backend: functions/src/utils/carpetaEmpresa.js. Los dos se prueban con los
// mismos casos (functions/test/fixtures/casosCarpetaEmpresa.json) en carpetaEmpresa.spec.js.
// La extensión ".js" del import permite cargar este módulo también desde Node en ese test.
import { limpiarNombreCarpeta } from "./carpetasSujetos.js";

// Sufijos societarios que se quitan al final del nombre de la Empresa (ya normalizados: "S.A."
// queda "s a"). Los más largos primero, para que "y cia" se quite antes que "cia".
export const SUFIJOS_SOCIETARIOS = [
  "sociedad anonima", "s p a", "e i r l", "y cia", "limitada", "ltda", "spa", "eirl", "s a", "sa", "cia",
];

// Nombre de la Empresa normalizado: sin prefijo numérico, minúsculas, sin tildes, solo letras,
// números y espacios simples, y sin sufijos societarios al final ("TECNORED S.A." → "tecnored").
export const normalizarNombreEmpresa = (nombre) => {
  let texto = limpiarNombreCarpeta(nombre).clave;
  let quitado = true;
  while (quitado) {
    quitado = false;
    for (const sufijo of SUFIJOS_SOCIETARIOS) {
      if (texto.endsWith(` ${sufijo}`)) {
        texto = texto.slice(0, -(sufijo.length + 1)).trim();
        quitado = true;
        break;
      }
    }
  }
  return texto;
};

// RUT sin puntos ni guion, en minúsculas ("77.104.219-8" → "771042198"), o null si no parece RUT.
const rutCompacto = (rut) => {
  const limpio = String(rut || "").toLowerCase().replace(/[^0-9k]/g, "");
  return limpio.length >= 7 ? limpio : null;
};
const rutConGuion = (compacto) => `${compacto.slice(0, -1)}-${compacto.slice(-1)}`;

// ¿Contiene la carpeta el RUT, en cualquier formato (con o sin puntos y guion)? Se busca en el
// nombre original: el prefijo numérico de orden no aplica a un RUT al inicio.
const contieneRut = (nombreCarpeta, compacto) => {
  const texto = String(nombreCarpeta || "").toLowerCase().replace(/[.-]/g, "");
  return new RegExp(`(^|[^0-9k])${compacto}([^0-9k]|$)`).test(texto);
};

// { valida, coincidencia: "razonSocial" | "nombreFantasia" | "rut" | null, terminosBuscados }.
// Coincide si la carpeta contiene la razón social o el nombre de fantasía normalizados como
// palabras completas (no como parte de otra: "slv" no calza en "silvestre"), o el RUT. Sin nombre
// de carpeta (p. ej. una URL de SharePoint sin carpeta) no es válida.
export const validarCarpetaEmpresa = (nombreCarpeta, empresa) => {
  const razonSocial = normalizarNombreEmpresa(empresa?.razonSocial);
  const nombreFantasia = normalizarNombreEmpresa(empresa?.nombreFantasia);
  const rut = rutCompacto(empresa?.rut);
  const terminosBuscados = [
    razonSocial || null,
    nombreFantasia && nombreFantasia !== razonSocial ? nombreFantasia : null,
    rut ? rutConGuion(rut) : null,
  ].filter(Boolean);
  const resultado = (coincidencia) => ({ valida: Boolean(coincidencia), coincidencia, terminosBuscados });
  if (!nombreCarpeta) return resultado(null);

  const palabras = ` ${limpiarNombreCarpeta(nombreCarpeta).clave} `;
  if (razonSocial && palabras.includes(` ${razonSocial} `)) return resultado("razonSocial");
  if (nombreFantasia && palabras.includes(` ${nombreFantasia} `)) return resultado("nombreFantasia");
  if (rut && contieneRut(nombreCarpeta, rut)) return resultado("rut");
  return resultado(null);
};

// Carpeta de una URL de SharePoint: el último tramo de la ruta, decodificado. Las vistas de
// biblioteca (".../Forms/AllItems.aspx?id=/sites/.../Carpeta") llevan la carpeta en `id`. Sin
// carpeta (solo el sitio, o una página .aspx) devuelve null.
export const carpetaDeUrlSharePoint = (valor) => {
  let url;
  try {
    url = new URL(String(valor || "").trim());
  } catch {
    return null;
  }
  const decodificar = (s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const ruta = url.searchParams.get("id") || decodificar(url.pathname);
  const tramos = ruta.split("/").filter(Boolean);
  const ultimo = tramos[tramos.length - 1] || null;
  return ultimo && !/\.aspx$/i.test(ultimo) ? ultimo : null;
};
