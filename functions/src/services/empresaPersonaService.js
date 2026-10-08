const EmpresaSujetoService = require("./empresaSujetoServiceBase");
const empresaPersonaRepository =
    require("../repositories/empresaPersonaRepository");

/**
 * Relaciones laborales Persona-Empresa (colección empresaPersonas). Ver
 * empresaSujetoServiceBase.js para las reglas.
 */
module.exports = new EmpresaSujetoService("persona", empresaPersonaRepository);
