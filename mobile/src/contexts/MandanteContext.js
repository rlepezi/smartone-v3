import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { mandantesApi } from "../api/mandantes";
import { proyectosApi } from "../api/proyectos";

// Roles cross-tenant: eligen el Mandante desde un selector (ver
// permissions/can.js: "seleccionar_mandante"). mandante_admin y
// mandante_lector tienen el Mandante fijo desde su propio claim — no hay
// selector, se usa directo (sin duplicarlo en un state local: derivarlo
// del claim en cada render, nunca "espejarlo" con setState en un efecto).
const ROLES_CROSS_TENANT = ["superadmin", "evaluador", "admin_comercial"];

// GET /mandantes (listado completo) está restringido a
// ["superadmin", "admin_comercial"] en mandanteRoutes.js — "evaluador" NO
// puede llamarlo (403). El frontend web resuelve esto derivando los
// mandanteId distintos de los Proyectos ya cargados y pidiendo cada uno
// por separado vía GET /mandantes/:id (el único endpoint de Mandante al
// que evaluador SÍ tiene acceso) — ver
// frontend/src/pages/proyectos/ProyectosListPage.jsx. Se replica el mismo
// patrón acá en vez de asumir que evaluador puede listar mandantes.
const ROLES_LISTADO_COMPLETO = ["superadmin", "admin_comercial"];

const MandanteContext = createContext(null);

export function MandanteProvider({ children }) {
  const { rol, mandanteId: mandanteIdClaim } = useAuth();
  const esCrossTenant = ROLES_CROSS_TENANT.includes(rol);
  const puedeListarTodos = ROLES_LISTADO_COMPLETO.includes(rol);

  const [mandantes, setMandantes] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [loading, setLoading] = useState(esCrossTenant);

  useEffect(() => {
    if (!esCrossTenant) return;
    let activo = true;
    // Efecto de carga de datos clásico (ver misma justificación en
    // hooks/useAsync.js).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const cargar = puedeListarTodos ?
      mandantesApi.listar({ estado: "activo" }) :
      // evaluador: sin listado directo — se resuelve desde los Proyectos
      // visibles (mismo criterio que el frontend web).
      proyectosApi.listar({}).then(async (proyectos) => {
        const ids = [...new Set(proyectos.map((p) => p.mandanteId).filter(Boolean))];
        const resueltos = await Promise.all(
            ids.map((id) => mandantesApi.obtener(id).catch(() => null)),
        );
        return resueltos.filter(Boolean);
      });

    cargar
        .then((lista) => {
          if (!activo) return;
          setMandantes(lista);
          setSeleccionado((actual) => actual || lista[0]?.id || null);
        })
        .catch((error) => console.error("Error al resolver mandantes:", error))
        .finally(() => activo && setLoading(false));
    return () => { activo = false; };
  }, [esCrossTenant, puedeListarTodos]);

  const mandanteId = esCrossTenant ? seleccionado : mandanteIdClaim;

  const value = useMemo(() => ({
    mandanteId,
    setMandanteId: setSeleccionado,
    mandantes,
    puedeSeleccionar: esCrossTenant,
    loading,
  }), [mandanteId, mandantes, esCrossTenant, loading]);

  return (
    <MandanteContext.Provider value={value}>
      {children}
    </MandanteContext.Provider>
  );
}

export function useMandante() {
  const context = useContext(MandanteContext);
  if (!context) {
    throw new Error("useMandante debe usarse dentro de un MandanteProvider");
  }
  return context;
}
