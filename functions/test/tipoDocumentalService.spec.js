// Creación de tipos documentales con repositorios simulados (datos
// sintéticos; sin Firestore).
jest.mock("../src/repositories/tipoDocumentalRepository", () => ({
  getById: jest.fn(), getByCodigo: jest.fn(), create: jest.fn(),
  update: jest.fn(), list: jest.fn(),
}));
jest.mock("../src/repositories/requerimientoRepository", () => ({}));
jest.mock("../src/repositories/procesamientoIARepository", () => ({}));
jest.mock("../src/repositories/mandanteRepository", () => ({}));
jest.mock("../src/repositories/plantillaEstructuraRepository", () => ({}));
jest.mock("../src/repositories/resultadoCompletitudRepository", () => ({}));
jest.mock("../src/services/aiConfigService", () => ({
  obtenerParametros: jest.fn().mockResolvedValue({
    preciosPorModelo: {"modelo-demo": {}}}),
}));
jest.mock("../src/utils/bitacoraLogger", () => ({
  registrarEvento: jest.fn().mockResolvedValue(),
}));

const repo = require("../src/repositories/tipoDocumentalRepository");
const bitacoraLogger = require("../src/utils/bitacoraLogger");
const servicio = require("../src/services/tipoDocumentalService");
const {calcularAlcance} = require("../src/utils/alcanceValidacion");

const ACTOR = {uid: "u1", rol: "superadmin"};
const PAYLOAD = {
  codigo: "cert_demo", nombre: "Certificado demo",
  entidades: ["empresa"],
  campos: [{clave: "certificado", etiqueta: "Certificado", tipo: "texto"}],
};

beforeEach(() => {
  jest.clearAllMocks();
  repo.getById.mockResolvedValue(null);
  repo.getByCodigo.mockResolvedValue(null);
  repo.create.mockImplementation(async (id, d) => ({id, ...d}));
});

describe("crear", () => {
  it("crea en piloto, activo, soloReglas y registra en la bitácora",
      async () => {
        const t = await servicio.crear(PAYLOAD, ACTOR);
        expect(repo.create).toHaveBeenCalledWith("CERT_DEMO",
            expect.objectContaining({codigo: "CERT_DEMO", estado: "activo",
              estadoIA: "piloto", soloReglas: true, reglas: []}));
        expect(t).toMatchObject({entidades: ["empresa"],
          campos: [{clave: "certificado"}]});
        expect(bitacoraLogger.registrarEvento).toHaveBeenCalledWith(
            expect.objectContaining({accion: "creado",
              entidadId: "CERT_DEMO"}));
      });

  it("rechaza código repetido, código inválido y datos incompletos",
      async () => {
        repo.getByCodigo.mockResolvedValue({id: "x"});
        await expect(servicio.crear(PAYLOAD, ACTOR))
            .rejects.toThrow(/Ya existe/);
        repo.getByCodigo.mockResolvedValue(null);
        await expect(servicio.crear({...PAYLOAD, codigo: "1 mal"}, ACTOR))
            .rejects.toThrow(/Código no válido/);
        await expect(servicio.crear({...PAYLOAD, entidades: undefined},
            ACTOR)).rejects.toThrow(/entidades y los campos/);
        await expect(servicio.crear({...PAYLOAD, entidades: ["otra"]},
            ACTOR)).rejects.toThrow(/Entidad no válida/);
        expect(repo.create).not.toHaveBeenCalled();
      });
});

describe("alcance de la revisión por carpetas", () => {
  it("un tipo soloReglas queda en solo completitud", () => {
    const plantilla = {secciones: [{clave: "s", nombre: "S",
      habilitada: true, documentos: [{clave: "d", nombre: "D",
        habilitado: true, tipoDocumentalCodigo: "CERT_DEMO"}]}]};
    const alcance = calcularAlcance(plantilla, [{codigo: "CERT_DEMO",
      nombre: "Certificado demo", estado: "activo", estadoIA: "piloto",
      soloReglas: true}]);
    const docs = JSON.stringify(alcance);
    expect(docs).toContain("solo_completitud");
    expect(docs).not.toContain("\"modalidad\":\"ia\"");
  });
});
