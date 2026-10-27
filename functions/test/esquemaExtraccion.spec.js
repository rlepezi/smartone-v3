const {ESQUEMA_DOCUMENTO} = require("../config/iaExtraccion");

// La API de salidas estructuradas rechaza `enum` en un nodo cuyo `type` es
// una lista (p. ej. ["string", "null"]). Recorre todo el esquema.
const nodosInvalidos = (nodo, ruta = "$") => {
  if (!nodo || typeof nodo !== "object") return [];
  const propios = Array.isArray(nodo.type) && nodo.enum ? [ruta] : [];
  return [...propios, ...Object.entries(nodo).flatMap(([k, v]) =>
    nodosInvalidos(v, `${ruta}.${k}`))];
};

describe("esquema de extracción", () => {
  it("no combina enum con un tipo que admite null", () => {
    expect(nodosInvalidos(ESQUEMA_DOCUMENTO)).toEqual([]);
  });

  it("lado y tipoDocumento aceptan sus valores o null", () => {
    const lado = ESQUEMA_DOCUMENTO.properties.lado;
    expect(lado.anyOf[0].enum).toEqual(["anverso", "reverso", "ambos"]);
    expect(lado.anyOf[1]).toEqual({type: "null"});
  });
});
