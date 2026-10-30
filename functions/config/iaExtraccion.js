// Prompt de sistema y esquema de salida de la extracción con IA (Revisiones
// IA). Versionados: VERSION_ESQUEMA debe coincidir con
// tiposDocumentales.version de CEDULA_CL y LICENCIA_CL; si cambia el
// esquema o el prompt, se sube la versión en ambos lados.
//
// El esquema va como salida estructurada (output_config.format json_schema)
// y no como herramienta forzada: los modelos actuales (Claude Sonnet 5.5)
// rechazan tool_choice "tool"/"any" y temperature distinta de la por
// defecto. Restricciones de esa modalidad: additionalProperties false en
// cada objeto y sin minimum/maximum (la legibilidad se acota al leerla).

const VERSION_ESQUEMA = 2;

const PROMPT_SISTEMA = [
  "Eres un extractor de datos de documentos chilenos para un sistema de " +
    "acreditación.",
  "Recibirás UN archivo (imagen o PDF). Puede ser una cédula de identidad " +
    "chilena (diseño 2013 o diseño nuevo con chip, desde dic-2024; chilenos " +
    "tipo IN o extranjeros tipo IE), una licencia de conducir chilena " +
    "(series anteriores o serie 2025) u otro documento.",
  "Reglas:",
  "- Clasifica el documento en tipoDetectado. Si no es cédula ni licencia, " +
    "usa OTRO y describe brevemente qué es en tipoDetectadoDescripcion.",
  "- Extrae SOLO lo que se lee en el documento. Si un dato no es legible o " +
    "no está, usa null. No infieras ni completes.",
  "- Fechas en formato AAAA-MM-DD. Las cédulas nuevas muestran fechas como " +
    "\"DD MMM AAAA\".",
  "- RUN con puntos y guion (ej. 12.345.678-5).",
  "- Si ves la zona MRZ (reverso de la cédula), transcríbela línea por " +
    "línea, exactamente, incluyendo los caracteres \"<\".",
  "- Indica qué lado(s) del documento ves y una legibilidad de 0 a 1.",
  "- El archivo puede contener ambos lados del documento en una sola " +
    "página; en ese caso, lado = ambos.",
  "- No evalúes si el documento cumple ni está vigente. Solo extrae.",
].join("\n");

const texto = {type: ["string", "null"]};
const listaTexto = {type: ["array", "null"], items: {type: "string"}};
// Valores cerrados o null: la API no admite enum junto a un tipo con null
// (["string", "null"]); se expresa con anyOf.
const opcional = (valores) =>
  ({anyOf: [{type: "string", enum: valores}, {type: "null"}]});

const ESQUEMA_DOCUMENTO = {
  type: "object",
  properties: {
    tipoDetectado: {type: "string", enum: ["CEDULA_CL", "LICENCIA_CL", "OTRO"]},
    tipoDetectadoDescripcion: texto,
    lado: opcional(["anverso", "reverso", "ambos"]),
    legibilidad: {type: "number", description: "Entre 0 y 1."},
    run: texto,
    nombres: texto,
    apellidos: texto,
    fechaNacimiento: texto,
    cedula: {
      type: ["object", "null"],
      properties: {
        fechaEmision: texto,
        fechaVencimiento: texto,
        numeroDocumento: texto,
        tipoDocumento: opcional(["IN", "IE"]),
        mrz: listaTexto,
      },
      required: [
        "fechaEmision", "fechaVencimiento", "numeroDocumento",
        "tipoDocumento", "mrz",
      ],
      additionalProperties: false,
    },
    licencia: {
      type: ["object", "null"],
      properties: {
        clases: listaTexto,
        fechaUltimoControl: texto,
        fechaProximoControl: texto,
        municipalidad: texto,
        restricciones: texto,
      },
      required: [
        "clases", "fechaUltimoControl", "fechaProximoControl",
        "municipalidad", "restricciones",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "tipoDetectado", "tipoDetectadoDescripcion", "lado", "legibilidad", "run",
    "nombres", "apellidos", "fechaNacimiento", "cedula", "licencia",
  ],
  additionalProperties: false,
};

module.exports = {VERSION_ESQUEMA, PROMPT_SISTEMA, ESQUEMA_DOCUMENTO};
