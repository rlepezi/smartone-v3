import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { mandantesApi } from "../api/mandantes";
import { proyectosApi } from "../api/proyectos";
import { can } from "../permissions/can";
import { View, ActivityIndicator } from "react-native";
import { colors } from "../theme/colors";

// Mandante en contexto de toda la app.
//  - superadmin y evaluador eligen el Mandante en el selector, con la opción
//    "Todos los mandantes" (mandanteId null). Si el sistema tiene uno solo,
//    queda preseleccionado y no se pregunta.
//  - mandante_admin y mandante_lector: el Mandante fijo de su claim (se carga
//    su ficha solo para el nombre y los umbrales de acreditación).
//  - admin_comercial: sin Mandante (solo ve Empresas, como en la web).
// La lógica de rol vive en permissions/can.js.
//
// GET /mandantes (listado completo) está restringido a superadmin y
// admin_comercial: evaluador deriva los Mandantes de sus Proyectos visibles y
// pide cada uno con GET /mandantes/:id (mismo patrón que la web).

const MandanteContext = createContext(null);

export function MandanteProvider({ children }) {
  const { rol, mandanteId: mandanteIdClaim } = useAuth();
  const puedeSeleccionar = can(rol, "seleccionar_mandante");
  const operacional = can(rol, "ver_operacion");
  const puedeListarTodos = can(rol, "listar_mandantes");

  const [mandantes, setMandantes] = useState([]);
  // undefined = aún sin elegir (se resuelve al cargar); null = "Todos".
  const [seleccionado, setSeleccionado] = useState(undefined);
  const [loading, setLoading] = useState(operacional);

  useEffect(() => {
    if (!operacional) return undefined;
    let activo = true;
    // Efecto de carga de datos clásico (ver hooks/useAsync.js).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    let cargar;
    if (!puedeSeleccionar) {
      cargar = mandanteIdClaim ?
        mandantesApi.obtener(mandanteIdClaim).then((m) => (m ? [m] : [])).catch(() => []) :
        Promise.resolve([]);
    } else if (puedeListarTodos) {
      cargar = mandantesApi.listar({ estado: "activo" });
    } else {
      cargar = proyectosApi.listar({}).then(async (proyectos) => {
        const ids = [...new Set(proyectos.map((p) => p.mandanteId).filter(Boolean))];
        const resueltos = await Promise.all(ids.map((id) => mandantesApi.obtener(id).catch(() => null)));
        return resueltos.filter(Boolean);
      });
    }
    cargar
      .then((lista) => {
        if (!activo) return;
        setMandantes(lista || []);
        // Uno solo: preseleccionado. Varios: "Todos los mandantes".
        setSeleccionado((actual) => (actual !== undefined ? actual : (lista?.length === 1 ? lista[0].id : null)));
      })
      .catch((error) => console.error("Error al resolver mandantes:", error))
      .finally(() => activo && setLoading(false));
    return () => { activo = false; };
  }, [operacional, puedeSeleccionar, puedeListarTodos, mandanteIdClaim]);

  const mandanteId = puedeSeleccionar ? (seleccionado ?? null) : (operacional ? mandanteIdClaim : null);

  // Umbrales de acreditación de un Mandante (null = los de defecto).
  const umbralesDe = useCallback(
    (id) => mandantes.find((m) => m.id === id)?.umbralesAcreditacion || null,
    [mandantes],
  );

  const value = useMemo(() => ({
    mandanteId,
    setMandanteId: setSeleccionado,
    mandantes,
    puedeSeleccionar: puedeSeleccionar && mandantes.length > 1,
    puedeVerTodos: can(rol, "ver_todos_mandantes"),
    umbralesDe,
    loading,
  }), [mandanteId, mandantes, puedeSeleccionar, rol, umbralesDe, loading]);

  // Las pantallas se montan con el Mandante ya resuelto (sin una primera carga de "Todos").
  return (
    <MandanteContext.Provider value={value}>
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : children}
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
