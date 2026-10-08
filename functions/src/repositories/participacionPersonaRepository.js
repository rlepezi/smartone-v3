const ParticipacionSujetoRepository =
    require("./participacionSujetoRepositoryBase");

/**
 * participacionPersonas: una Persona en una Participación con un Perfil de
 * Recurso (tipo "persona"). Una Persona con dos perfiles tiene dos
 * documentos.
 */
module.exports = new ParticipacionSujetoRepository(
    "participacionPersonas", "personaId",
);
