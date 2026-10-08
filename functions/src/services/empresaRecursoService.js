const EmpresaSujetoService = require("./empresaSujetoServiceBase");
const empresaRecursoRepository =
    require("../repositories/empresaRecursoRepository");

/**
 * Relaciones Recurso-Empresa (colección empresaRecursos). Ver
 * empresaSujetoServiceBase.js para las reglas.
 */
module.exports = new EmpresaSujetoService("recurso", empresaRecursoRepository);
