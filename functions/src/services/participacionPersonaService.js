const ParticipacionSujetoService = require("./participacionSujetoServiceBase");
const participacionPersonaRepository =
    require("../repositories/participacionPersonaRepository");
const personaRepository = require("../repositories/personaRepository");

/**
 * Personas en Participaciones (colección participacionPersonas). Ver
 * participacionSujetoServiceBase.js para las reglas.
 */
module.exports = new ParticipacionSujetoService(
    "persona", participacionPersonaRepository, personaRepository,
);
