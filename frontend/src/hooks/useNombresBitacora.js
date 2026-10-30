import { useEffect, useState } from "react";
import { personaService } from "../services/personaService";
import { recursoService } from "../services/recursoService";
import { empresaService } from "../services/empresaService";
import { proyectoService } from "../services/proyectoService";

// Mapas id → nombre (Personas, Maquinarias, Empresas, Proyectos) para describir eventos de
// Bitácora con nombres en vez de IDs (ver utils/bitacoraContexto.js). Se cargan una vez por sesión
// de navegador y se comparten entre los historiales; cada lista que el rol no pueda leer queda
// vacía sin romper nada.
let cache = null;

const aMapa = (lista, nombre) => Object.fromEntries((lista || []).map((x) => [x.id, nombre(x)]));

const cargar = () => {
  if (!cache) {
    const seguro = (promesa) => promesa.catch(() => []);
    cache = Promise.all([
      seguro(personaService.listar()),
      seguro(recursoService.listar()),
      seguro(empresaService.listar()),
      seguro(proyectoService.listar({})),
    ]).then(([personas, recursos, empresas, proyectos]) => ({
      personas: aMapa(personas, (p) => `${p.nombre} ${p.apellido || ""}`.trim()),
      recursos: aMapa(recursos, (r) => r.nombre),
      empresas: aMapa(empresas, (e) => e.razonSocial),
      proyectos: aMapa(proyectos, (p) => (p.codigo ? `${p.nombre} (${p.codigo})` : p.nombre)),
    }));
  }
  return cache;
};

export const useNombresBitacora = () => {
  const [nombres, setNombres] = useState({});
  useEffect(() => {
    let vigente = true;
    cargar().then((n) => { if (vigente) setNombres(n); });
    return () => { vigente = false; };
  }, []);
  return nombres;
};
