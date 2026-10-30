import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../services/firebase";

// Sesión de Revisiones IA en vivo (onSnapshot): la sesión, sus procesamientos (uno por archivo) y
// sus resultados (uno por carpeta y tipo documental). Las consultas llevan el mandanteId porque las
// Security Rules solo dejan leer a los roles de Mandante los documentos de su propio Mandante.
// Devuelve { sesion, procesamientos, resultados, error }; null mientras no llega el primer dato.
export const useSesionRevisionEnVivo = (sesionId, mandanteId) => {
  const [estado, setEstado] = useState({ clave: null, sesion: null, procesamientos: null, resultados: null, error: null });
  const clave = sesionId && mandanteId ? `${sesionId}|${mandanteId}` : null;

  useEffect(() => {
    if (!clave) return undefined;
    const actualizar = (cambios) => setEstado((previo) => ({
      ...(previo.clave === clave ? previo : { sesion: null, procesamientos: null, resultados: null, error: null }),
      clave,
      ...cambios,
    }));
    const alFallar = (error) => actualizar({ error: error.message || "No se pudo leer el progreso en vivo." });
    const porSesion = (coleccion) => query(collection(db, coleccion),
      where("sesionId", "==", sesionId), where("mandanteId", "==", mandanteId));

    const cancelar = [
      onSnapshot(doc(db, "sesionesRevision", sesionId),
        (snap) => actualizar({ sesion: snap.exists() ? { id: snap.id, ...snap.data() } : null }), alFallar),
      onSnapshot(porSesion("procesamientosIA"),
        (snap) => actualizar({ procesamientos: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }), alFallar),
      onSnapshot(porSesion("resultadosRevision"),
        (snap) => actualizar({ resultados: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }), alFallar),
    ];
    return () => cancelar.forEach((fn) => fn());
  }, [clave, sesionId, mandanteId]);

  if (estado.clave !== clave) return { sesion: null, procesamientos: null, resultados: null, error: null };
  return estado;
};
