const ParticipacionSujetoRepository =
    require("./participacionSujetoRepositoryBase");

/**
 * participacionRecursos: una Maquinaria en una Participación con su Perfil
 * de Recurso (tipo "recurso"). Un único documento activo por Participación.
 */
module.exports = new ParticipacionSujetoRepository(
    "participacionRecursos", "recursoId",
);
