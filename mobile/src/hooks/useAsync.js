import { useEffect, useRef, useState } from "react";

// Hook genérico para las 4 pantallas de estado obligatorias en todo el
// diseño: cargando (skeleton), vacío, error con reintento, pull-to-refresh.
// `fetcher` se re-ejecuta cuando cambia algo en `deps`.
//
// No usa useCallback con `deps` reenviado: las reglas nuevas de
// react-hooks (eslint-config-expo ~57) exigen que la lista de
// dependencias sea un array LITERAL en el propio call site, así que un
// hook genérico no puede reenviar un array variable a useCallback/
// useEffect. Se resuelve derivando una `key` (string) de `deps` y
// dependiendo solo de esa key, literal, en el único useEffect.
export function useAsync(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const montado = useRef(true);
  const fetcherRef = useRef(fetcher);

  // Actualizar un ref durante el render está prohibido por la regla nueva
  // (react-hooks/refs) aunque no dispare un re-render — se mueve a un
  // efecto sin deps, que corre después de cada render.
  useEffect(() => { fetcherRef.current = fetcher; });

  useEffect(() => () => { montado.current = false; }, []);

  const ejecutar = async (modo) => {
    if (modo === "refresh") setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const resultado = await fetcherRef.current();
      if (montado.current) setData(resultado);
    } catch (err) {
      if (montado.current) setError(err);
    } finally {
      if (montado.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const key = JSON.stringify(deps);
  useEffect(() => {
    // Efecto de carga de datos clásico (fetch al montar / cuando cambian
    // las deps): la propia documentación de React lo reconoce como un uso
    // legítimo de useEffect, aunque la regla experimental
    // react-hooks/set-state-in-effect lo marque por defecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    ejecutar("load");
  }, [key]);

  return {
    data,
    loading,
    refreshing,
    error,
    reload: () => ejecutar("load"),
    refresh: () => ejecutar("refresh"),
  };
}
