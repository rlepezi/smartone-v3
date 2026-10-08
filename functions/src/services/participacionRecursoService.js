const ParticipacionSujetoService = require("./participacionSujetoServiceBase");
const participacionRecursoRepository =
    require("../repositories/participacionRecursoRepository");
const recursoRepository = require("../repositories/recursoRepository");

/**
 * Maquinarias en Participaciones (colección participacionRecursos). Ver
 * participacionSujetoServiceBase.js para las reglas.
 */
module.exports = new ParticipacionSujetoService(
    "recurso", participacionRecursoRepository, recursoRepository,
);
