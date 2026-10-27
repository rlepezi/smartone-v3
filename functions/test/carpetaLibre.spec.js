const {analizarLibre, MIME_DOCX} = require("../src/utils/estructuraPlan");

const archivo = (ruta, tamanoBytes = 1000) =>
  ({nombre: ruta.split("/").pop(), ruta, tamanoBytes});

// Árbol sintético: proyecto con una carpeta de trabajadores y dos personas
// ficticias, más un archivo suelto en la raíz.
const arbol = {
  nombre: "9. PROYECTO PRUEBA", ruta: "",
  archivos: [archivo("Cedula Ana Prueba.pdf")],
  carpetas: [{
    nombre: "02. Trabajadores", ruta: "02. Trabajadores", archivos: [],
    carpetas: [
      {
        nombre: "Juan Ficticio", ruta: "02. Trabajadores/Juan Ficticio",
        carpetas: [],
        archivos: [
          archivo("02. Trabajadores/Juan Ficticio/CI Juan.docx"),
          archivo("02. Trabajadores/Juan Ficticio/notas.txt"),
          archivo("02. Trabajadores/Juan Ficticio/grande.jpg",
              20 * 1024 * 1024),
        ],
      },
      {
        nombre: "11.111.111-1 Pedro Demo",
        ruta: "02. Trabajadores/11.111.111-1 Pedro Demo", carpetas: [],
        archivos: [
          archivo("02. Trabajadores/11.111.111-1 Pedro Demo/anverso.png"),
          archivo("02. Trabajadores/11.111.111-1 Pedro Demo/reverso.png"),
        ],
      },
    ],
  }],
};

describe("analizarLibre (carpeta sin estructura)", () => {
  const plan = analizarLibre(arbol);
  const empresa = plan.empresas[0];

  it("devuelve una sola empresa de tipo libre, sin completitud", () => {
    expect(plan.tipo).toBe("libre");
    expect(plan.empresas).toHaveLength(1);
    expect(empresa.secciones).toEqual([]);
  });

  it("envía a la IA los formatos aceptados, incluido Word", () => {
    const nombres = empresa.archivosIA.map((a) => a.nombre).sort();
    expect(nombres).toEqual(
        ["CI Juan.docx", "Cedula Ana Prueba.pdf", "anverso.png",
          "reverso.png"]);
    expect(empresa.archivosIA.find((a) => a.nombre === "CI Juan.docx").mime)
        .toBe(MIME_DOCX);
  });

  it("excluye formatos no soportados y archivos grandes", () => {
    const motivos = Object.fromEntries(empresa.archivosExcluidosIA
        .map((x) => [x.nombre, x.motivo]));
    expect(motivos).toEqual(
        {"notas.txt": "formato_no_soportado", "grande.jpg": "tamano"});
  });

  it("agrupa por carpeta de persona y toma el RUN del nombre", () => {
    const pedro = empresa.archivosIA.filter((a) =>
      a.entidadCarpeta === "02. Trabajadores/11.111.111-1 Pedro Demo");
    expect(new Set(pedro.map((a) => a.entidadClave)).size).toBe(1);
    const entidad = empresa.entidades.find((e) =>
      e.entidadCarpeta === "02. Trabajadores/11.111.111-1 Pedro Demo");
    expect(entidad.runCarpeta).toBeTruthy();
    expect(entidad.entidadNombre).toBe("Pedro Demo");
  });

  it("cada archivo suelto de la raíz es su propia entidad", () => {
    const suelto = empresa.archivosIA.find((a) => !a.entidadCarpeta);
    expect(suelto.nombre).toBe("Cedula Ana Prueba.pdf");
    const claves = new Set(empresa.archivosIA.map((a) => a.entidadClave));
    expect(claves.size).toBe(3);
  });
});
