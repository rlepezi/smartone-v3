import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { participacionService } from "../services/participacionService";

const ROLES_MANDANTE_UNICO = ["mandante_admin", "mandante_lector"];

// Mandante(s) contra los que consultar catálogos (p. ej. Cargo = Perfiles de Recurso) al elegir una
// Empresa: para roles de un solo Mandante es el propio; para el resto, los Mandantes de las
// Participaciones activas de esa Empresa. Sin Empresa elegida devuelve [] (aún no se sabe cuál).
export const useMandantesDeEmpresa = (empresaId) => {
  const { profile } = useAuth();
  const [mandanteIds, setMandanteIds] = useState([]);
  const fijo = ROLES_MANDANTE_UNICO.includes(profile?.rol) ? profile?.mandanteId : null;

  useEffect(() => {
    if (fijo || !empresaId) {
      setMandanteIds([]);
      return undefined;
    }
    let vigente = true;
    participacionService.listar({ empresaId })
      .then((data) => {
        if (!vigente) return;
        const activas = (data || []).filter((p) => p.empresaId === empresaId && p.estado === "activa");
        setMandanteIds([...new Set(activas.map((p) => p.mandanteId).filter(Boolean))]);
      })
      .catch(() => { if (vigente) setMandanteIds([]); });
    return () => { vigente = false; };
  }, [empresaId, fijo]);

  if (fijo) return empresaId ? [fijo] : [];
  return mandanteIds;
};
