import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { mandanteService } from "../services/mandanteService";
import { perfilParticipacionService } from "../services/perfilParticipacionService";
import { getMandanteDisplayName } from "../utils/mandanteDisplay";

// Roles cuyo Mandante es el propio: nunca eligen.
export const ROLES_MANDANTE_FIJO = ["mandante_admin", "mandante_lector"];

const porNombre = (a, b) =>
  (getMandanteDisplayName(a) || "").localeCompare(getMandanteDisplayName(b) || "", "es");

// Mandantes ACTIVOS dentro del alcance de un rol transversal, ordenados por nombre. El listado de
// Mandantes es de superadmin y admin_comercial; los demás (evaluador) los obtienen desde los
// Perfiles de Participación que sí pueden leer.
const cargarMandantesEnAlcance = async () => {
  let lista;
  try {
    lista = await mandanteService.listar("activo");
  } catch (errorListado) {
    const perfiles = await perfilParticipacionService.listar({}).catch(() => null);
    if (!perfiles) throw errorListado;
    const ids = [...new Set(perfiles.map((p) => p.mandanteId).filter(Boolean))];
    lista = (await Promise.all(ids.map((id) => mandanteService.obtenerPorId(id).catch(() => null))))
      .filter((m) => m && m.estado === "activo");
  }
  return [...(lista || [])].sort(porNombre);
};

// Mandante en contexto de un formulario o pantalla que lo necesita. Único lugar que decide si hay
// que pedirlo. Devuelve { mandanteId, mandante, modo, cargando, mandantes, elegir, error }:
//  - modo "fijo": rol con Mandante propio (o Mandante impuesto por quien llama, con `fijo`).
//  - modo "unico": el usuario tiene disponible un solo Mandante activo; viene asignado.
//  - modo "seleccionable": hay más de uno; `elegir(id)` cambia el elegido.
//  - modo "ninguno": no hay Mandantes activos.
//  - modo null: todavía cargando (solo roles sin Mandante fijo).
// Opciones:
//  - `mandanteId`: el que trae la pantalla (URL o props); se respeta si está en el alcance.
//  - `fijo`: ese `mandanteId` viene impuesto y no se puede cambiar (alta desde una asignación).
//  - `activo`: en false no consulta nada (formularios de edición).
// La lista se consulta una vez y se comparte entre pantallas (caché de mandanteService).
export const useMandanteContexto = ({ mandanteId: preferido = null, fijo = false, activo = true } = {}) => {
  const { profile } = useAuth();
  const usuario = profile?.uid || "";
  const rolFijo = ROLES_MANDANTE_FIJO.includes(profile?.rol);
  const idFijo = rolFijo ? profile?.mandanteId || null : (fijo && preferido) || null;
  const clave = idFijo ? `uno|${idFijo}` : `alcance|${usuario}`;

  const [carga, setCarga] = useState({ clave: null, lista: null, error: null });
  const [elegido, setElegido] = useState("");

  useEffect(() => {
    if (!activo || !usuario) return undefined;
    let vigente = true;
    const promesa = idFijo
      ? mandanteService.enCache(clave, () => mandanteService.obtenerPorId(idFijo))
        .then((m) => [m || { id: idFijo }])
        // Sin acceso al detalle: igual queda fijo, mostrando su ID.
        .catch(() => [{ id: idFijo }])
      : mandanteService.enCache(clave, cargarMandantesEnAlcance);
    promesa
      .then((lista) => { if (vigente) setCarga({ clave, lista, error: null }); })
      .catch((err) => {
        if (vigente) setCarga({ clave, lista: [], error: err.message || "No se pudieron cargar los Mandantes." });
      });
    return () => { vigente = false; };
  }, [activo, usuario, idFijo, clave]);

  const lista = activo && carga.clave === clave ? carga.lista : null;
  const error = activo && carga.clave === clave ? carga.error : null;
  const cargando = activo && lista === null;
  const enAlcance = (id) => Boolean(id) && (lista || []).some((m) => m.id === id);

  let modo = null;
  if (idFijo) modo = "fijo";
  else if (lista) modo = lista.length === 0 ? "ninguno" : lista.length === 1 ? "unico" : "seleccionable";

  let mandanteId = "";
  if (idFijo) mandanteId = idFijo;
  else if (modo === "unico") mandanteId = lista[0].id;
  else if (modo === "seleccionable") {
    mandanteId = enAlcance(elegido) ? elegido : enAlcance(preferido) ? preferido : "";
  }

  return {
    mandanteId,
    mandante: (lista || []).find((m) => m.id === mandanteId) || null,
    modo,
    cargando,
    mandantes: lista || [],
    elegir: setElegido,
    error,
  };
};
