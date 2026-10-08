const EmpresaSujetoRepository = require("./empresaSujetoRepositoryBase");

/**
 * empresaPersonas: relación laboral de una Persona con una Empresa
 * (tipoRelacion, cargo, tipoContrato, jornada, fechas, estado).
 */
module.exports = new EmpresaSujetoRepository("empresaPersonas", "personaId");
