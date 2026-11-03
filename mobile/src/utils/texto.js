// Pluralización y textos de la interfaz.

// "1 empresa" / "3 empresas". `plural` por defecto: singular + "s".
export const plural = (n, singular, pluralTxt = `${singular}s`) =>
  `${n} ${n === 1 ? singular : pluralTxt}`;

// Iniciales (máximo 2) de un nombre: "Gabriel Jiménez" -> "GJ"; "ADMINISTRADORA PLAZA" -> "AP".
export const iniciales = (...partes) => {
  const palabras = partes.filter(Boolean).join(" ").trim().split(/\s+/)
    .filter((p) => /[A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(p));
  return palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
};

// Comparación de búsqueda: sin tildes, sin mayúsculas, sin puntos ni guiones (para RUT).
export const normalizarBusqueda = (t) => String(t || "").normalize("NFD")
  .replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.\-\s]/g, "");

export const coincide = (consulta, ...campos) => {
  const q = normalizarBusqueda(consulta);
  if (!q) return true;
  return campos.some((c) => normalizarBusqueda(c).includes(q));
};
