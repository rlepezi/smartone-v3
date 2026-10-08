const EmpresaSujetoRepository = require("./empresaSujetoRepositoryBase");

/**
 * empresaRecursos: relación de un Recurso (maquinaria) con una Empresa
 * (tipoRelacion, fechas, estado).
 */
module.exports = new EmpresaSujetoRepository("empresaRecursos", "recursoId");
