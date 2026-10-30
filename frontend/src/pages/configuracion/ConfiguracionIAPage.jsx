import { Navigate, useSearchParams } from "react-router-dom";
import { BrainCircuit } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { PageHeader } from "../../components/shared/PageHeader";
import { Tabs } from "../../components/shared/Tabs";
import { TabConexion } from "../../components/configuracion-ia/TabConexion";
import { TabFuentes } from "../../components/configuracion-ia/TabFuentes";
import { TabTipos } from "../../components/configuracion-ia/TabTipos";
import { TabMapeoDocumental } from "../../components/configuracion-ia/mapeo/TabMapeoDocumental";
import { TabConsumo } from "../../components/configuracion-ia/TabConsumo";
import { TabReglas } from "../../components/configuracion-ia/TabReglas";

// Pestañas y quién las ve. Las sin permiso no se muestran.
const PESTANAS = [
  { key: "conexion", label: "Conexión IA", roles: ["superadmin"] },
  { key: "fuentes", label: "Fuentes documentales", roles: ["superadmin", "mandante_admin"] },
  // Mapeo documental (reemplaza a "Estructura de carpetas"; la plantilla queda como "Plantilla
  // anterior" dentro de ella): superadmin y evaluador.
  { key: "mapeo", label: "Mapeo documental", roles: ["superadmin", "evaluador"] },
  // Tipos documentales: en desuso, fuera del menú. La URL (?tab=tipos) sigue abriéndola para los
  // enlaces de la revisión por carpetas, que aún usa los tipos (hasta la E5).
  { key: "tipos", label: "Tipos documentales", roles: ["superadmin"], oculta: true },
  { key: "reglas", label: "Reglas de revisión", roles: ["superadmin"] },
  // El gasto de IA es información interna de SmartApplication: solo superadmin.
  { key: "consumo", label: "Consumo", roles: ["superadmin"] },
];

// Configuración → Inteligencia Artificial. La pestaña activa vive en la URL (?tab=), para enlazar
// directo a cada una y recargar sin perderla.
export const ConfiguracionIAPage = () => {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const permitidas = PESTANAS.filter((p) => p.roles.includes(profile?.rol));
  const visibles = permitidas.filter((p) => !p.oculta);

  if (visibles.length === 0) {
    return <Navigate to="/dashboard" replace state={{ mensaje: "No tiene acceso a la configuración de Inteligencia Artificial." }} />;
  }
  // Enlaces anteriores a "Estructura de carpetas" abren la plantilla dentro de Mapeo documental.
  const pedida = params.get("tab") === "estructura" ? "mapeo" : params.get("tab");
  const activa = permitidas.some((p) => p.key === pedida) ? pedida : visibles[0].key;

  return (
    <div className={`space-y-6 ${["mapeo", "reglas"].includes(activa) ? "max-w-7xl" : "max-w-6xl"}`}>
      <PageHeader
        title="Inteligencia Artificial"
        subtitle="Conexión, fuentes documentales, mapeo documental, reglas de revisión y consumo"
        icon={BrainCircuit}
        onRefresh={() => window.location.reload()}
      />
      <Tabs
        tabs={visibles}
        active={activa}
        onChange={(key) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", key); return n; }, { replace: true })}
      />
      {activa === "conexion" && <TabConexion />}
      {activa === "fuentes" && <TabFuentes />}
      {activa === "mapeo" && <TabMapeoDocumental plantillaAnterior={params.get("tab") === "estructura" || params.get("vista") === "plantilla"} />}
      {activa === "tipos" && <TabTipos />}
      {activa === "reglas" && <TabReglas />}
      {activa === "consumo" && <TabConsumo />}
    </div>
  );
};
