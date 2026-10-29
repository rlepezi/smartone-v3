// Pauta de validación de cada requerimiento del expediente (ícono IA de la
// planilla): reglas ACTIVAS en su orden, estado IA y tipo documental. Datos
// sintéticos; sin Firestore.
jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {serverTimestamp: () => "AHORA"},
}));
jest.mock("../src/services/expedienteService", () => ({
  getExpedienteById: jest.fn().mockResolvedValue({id: "e1"}),
}));
jest.mock("../src/repositories/expedienteRequerimientoRepository", () => ({
  listByExpediente: jest.fn().mockResolvedValue([
    {id: "i1", requerimientoId: "rCedula"},
    {id: "i2", requerimientoId: "rCedula"},
    {id: "i3", requerimientoId: "rRiosh"},
  ]),
}));
jest.mock("../src/repositories/requerimientoRepository", () => ({
  getByIds: jest.fn().mockResolvedValue([
    {id: "rCedula", estadoIA: "habilitado", tipoDocumentalId: "t1"},
    {id: "rRiosh"},
  ]),
}));
jest.mock("../src/services/requerimientoReglaIAService", () => ({
  _datosTipo: jest.fn(async () => ({tipos: [], plantilla: null})),
  _tipo: jest.fn(async (req) => (req.tipoDocumentalId ?
    {codigo: "CEDULA_CL", nombre: "Cédula de identidad"} : null)),
  _vinculos: jest.fn(async (id) => (id !== "rCedula" ? [] : [
    {vinculo: {activa: true}, regla: {estado: "activa"},
      snapshot: {vinculoId: "v2", reglaId: "g2", nombre: "Vigente",
        tipo: "deterministica", severidad: "bloqueante", orden: 2,
        verificacion: "vigente_a_fecha", parametros: {diasMargen: 0}}},
    {vinculo: {activa: true}, regla: {estado: "activa"},
      snapshot: {vinculoId: "v1", reglaId: "g1", nombre: "RUT",
        tipo: "deterministica", severidad: "bloqueante", orden: 1,
        verificacion: "coincide_rut", parametros: {}}},
    {vinculo: {activa: false}, regla: {estado: "activa"},
      snapshot: {vinculoId: "v3", reglaId: "g3", nombre: "Inactiva",
        orden: 3}},
  ])),
  _aplicables: (items) => items.filter((i) => i.vinculo.activa && i.regla &&
    i.regla.estado === "activa"),
}));
[
  "revisionRequerimientoIARepository", "personaRepository",
  "recursoRepository", "empresaRepository", "proyectoRepository",
  "usuarioRepository",
].forEach((r) => jest.mock(`../src/repositories/${r}`, () => ({})));
jest.mock("../src/services/evaluacionService", () => ({}));
jest.mock("../src/services/registroConsumoIAService", () => ({ORIGENES: {}}));
jest.mock("../src/utils/bitacoraLogger", () => ({}));

const expedienteService = require("../src/services/expedienteService");
const servicio = require("../src/services/revisionRequerimientoIAService");

describe("pautas", () => {
  test("reglas activas en orden, estado IA y tipo; sin reglas: lista vacía",
      async () => {
        const {pautas} = await servicio.pautas("e1",
            {uid: "u1", rol: "mandante_lector", mandanteId: "m1"});
        expect(pautas.rCedula).toMatchObject({estadoIA: "habilitado",
          tipo: {codigo: "CEDULA_CL"}});
        expect(pautas.rCedula.reglas.map((r) => r.vinculoId))
            .toEqual(["v1", "v2"]);
        expect(pautas.rRiosh).toEqual({estadoIA: "sin_reglas", tipo: null,
          reglas: []});
        // El alcance lo decide el expediente (mismas reglas que verlo).
        expect(expedienteService.getExpedienteById).toHaveBeenCalledWith("e1",
            expect.objectContaining({rol: "mandante_lector"}));
      });
});
