// Descripción de las reglas de validación de Revisiones IA (las implementa
// services/reglasService.js) y qué reglas aplica el código a cada tipo
// documental. El alcance de validación muestra la unión de estas reglas con
// las guardadas en tiposDocumentales.reglas (que pueden estar atrasadas si
// se agregó una regla después del seed).

const DESCRIPCION_REGLAS = {
  "CI-01": "El RUN de la cédula es válido (dígito verificador).",
  "CI-02": "El RUN coincide con el de la persona enlazada.",
  "CI-03": "El nombre coincide con el de la persona enlazada.",
  "CI-04": "La cédula está vigente a la fecha de evaluación.",
  "CI-05": "La MRZ es válida y su RUN coincide con el del anverso.",
  "CI-06": "Están ambos lados de la cédula y son legibles.",
  "CI-07": "La fecha del nombre del archivo coincide con la del documento " +
      "(informativa).",
  "LC-01": "El RUN de la licencia es válido (dígito verificador).",
  "LC-02": "El RUN coincide con el de la persona enlazada.",
  "LC-03": "El próximo control de la licencia está vigente.",
  "LC-04": "Alguna clase de la licencia está entre las aceptadas por el " +
      "requerimiento.",
  "LC-05": "Restricciones de la licencia (informativa).",
  "LC-06": "La licencia es legible.",
  "LC-07": "La fecha del nombre del archivo coincide con la del documento " +
      "(informativa).",
};

const REGLAS_POR_TIPO = {
  CEDULA_CL: ["CI-01", "CI-02", "CI-03", "CI-04", "CI-05", "CI-06", "CI-07"],
  LICENCIA_CL: ["LC-01", "LC-02", "LC-03", "LC-04", "LC-05", "LC-06",
    "LC-07"],
};

module.exports = {DESCRIPCION_REGLAS, REGLAS_POR_TIPO};
