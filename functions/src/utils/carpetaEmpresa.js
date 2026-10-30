// ¿La carpeta vinculada como repositorio documental es de la Empresa? Se
// valida solo por el NOMBRE de la carpeta (carpeta local) o el último tramo
// de la URL (SharePoint). Funciones puras.
//
// Réplica exacta de frontend/src/utils/carpetaEmpresa.js (y de la limpieza
// de nombres de frontend/src/utils/carpetasSujetos.js): los dos se prueban
// con los mismos casos (test/fixtures/casosCarpetaEmpresa.json) en
// test/carpetaEmpresa.spec.js. Un cambio aquí va también allá.

// Prefijo numérico de orden, aunque vaya pegado: "0.1. ", "10. ", "18.",
// "11", "01 - ", "2_" (mismo que RE_PREFIJO de carpetasSujetos.js).
const RE_PREFIJO = /^\s*\d+(?:[.,]\d+)*\s*[.\-_)–]*\s*/;

// Sufijos societarios que se quitan al final del nombre de la Empresa (ya
// normalizados: "S.A." queda "s a"). Los más largos primero.
const SUFIJOS_SOCIETARIOS = [
  "sociedad anonima", "s p a", "e i r l", "y cia", "limitada", "ltda", "spa",
  "eirl", "s a", "sa", "cia",
];

/**
 * Minúsculas, sin tildes (la ñ pasa a n), solo letras, números y espacios
 * simples (claveTexto de carpetasSujetos.js).
 * @param {?string} s Texto.
 * @return {string} Texto normalizado.
 */
function claveTexto(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Nombre de carpeta sin prefijo numérico, normalizado (limpiarNombreCarpeta
 * de carpetasSujetos.js, solo su clave).
 * @param {?string} nombre Nombre.
 * @return {string} Clave.
 */
function claveCarpeta(nombre) {
  return claveTexto(String(nombre || "").replace(RE_PREFIJO, "")
      .replace(/\s+/g, " ").trim());
}

/**
 * Nombre de la Empresa normalizado y sin sufijos societarios al final
 * ("TECNORED S.A." → "tecnored").
 * @param {?string} nombre Razón social o nombre de fantasía.
 * @return {string} Nombre normalizado.
 */
function normalizarNombreEmpresa(nombre) {
  let texto = claveCarpeta(nombre);
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
}

/**
 * RUT sin puntos ni guion, en minúsculas, o null si no parece RUT.
 * @param {?string} rut RUT.
 * @return {?string} RUT compacto.
 */
function rutCompacto(rut) {
  const limpio = String(rut || "").toLowerCase().replace(/[^0-9k]/g, "");
  return limpio.length >= 7 ? limpio : null;
}

/**
 * Valida que la carpeta sea de la Empresa: contiene su razón social o su
 * nombre de fantasía (normalizados, como palabras completas) o su RUT.
 * @param {?string} nombreCarpeta Nombre de la carpeta.
 * @param {Object} empresa {razonSocial, nombreFantasia, rut}.
 * @return {{valida: boolean, coincidencia: ?string,
 *     terminosBuscados: string[]}} Resultado.
 */
function validarCarpetaEmpresa(nombreCarpeta, empresa) {
  const razonSocial = normalizarNombreEmpresa(empresa?.razonSocial);
  const nombreFantasia = normalizarNombreEmpresa(empresa?.nombreFantasia);
  const rut = rutCompacto(empresa?.rut);
  const terminosBuscados = [
    razonSocial || null,
    nombreFantasia && nombreFantasia !== razonSocial ? nombreFantasia : null,
    rut ? `${rut.slice(0, -1)}-${rut.slice(-1)}` : null,
  ].filter(Boolean);
  const resultado = (coincidencia) => ({valida: Boolean(coincidencia),
    coincidencia, terminosBuscados});
  if (!nombreCarpeta) return resultado(null);

  const palabras = ` ${claveCarpeta(nombreCarpeta)} `;
  if (razonSocial && palabras.includes(` ${razonSocial} `)) {
    return resultado("razonSocial");
  }
  if (nombreFantasia && palabras.includes(` ${nombreFantasia} `)) {
    return resultado("nombreFantasia");
  }
  // El RUT se busca en el nombre original (el prefijo de orden no aplica).
  const texto = String(nombreCarpeta).toLowerCase().replace(/[.-]/g, "");
  if (rut && new RegExp(`(^|[^0-9k])${rut}([^0-9k]|$)`).test(texto)) {
    return resultado("rut");
  }
  return resultado(null);
}

/**
 * Carpeta de una URL de SharePoint: el último tramo de la ruta,
 * decodificado; en una vista de biblioteca (AllItems.aspx?id=...), el de
 * `id`. Sin carpeta (solo el sitio o una página .aspx) devuelve null.
 * @param {?string} valor URL.
 * @return {?string} Nombre de la carpeta o null.
 */
function carpetaDeUrlSharePoint(valor) {
  let url;
  try {
    url = new URL(String(valor || "").trim());
  } catch (e) {
    return null;
  }
  const decodificar = (s) => {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  };
  const ruta = url.searchParams.get("id") || decodificar(url.pathname);
  const tramos = ruta.split("/").filter(Boolean);
  const ultimo = tramos[tramos.length - 1] || null;
  return ultimo && !/\.aspx$/i.test(ultimo) ? ultimo : null;
}

/**
 * Mensaje de rechazo cuando la carpeta no es de la Empresa.
 * @param {?string} nombreCarpeta Nombre de la carpeta (null: URL sin
 *     carpeta).
 * @param {Object} empresa Empresa.
 * @param {string[]} terminos Términos buscados.
 * @return {string} Mensaje.
 */
function mensajeCarpetaNoCoincide(nombreCarpeta, empresa, terminos) {
  if (!nombreCarpeta) {
    return "Indique la URL de la carpeta específica de la empresa en " +
        "SharePoint, no la del sitio.";
  }
  return `La carpeta «${nombreCarpeta}» no contiene el nombre de la ` +
      `empresa ${empresa?.razonSocial || ""} (se buscó: ` +
      `${terminos.map((t) => `«${t}»`).join(", ")}).`;
}

module.exports = {
  SUFIJOS_SOCIETARIOS, normalizarNombreEmpresa, validarCarpetaEmpresa,
  carpetaDeUrlSharePoint, mensajeCarpetaNoCoincide,
};
