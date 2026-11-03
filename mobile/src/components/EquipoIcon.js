import React from "react";
import { Truck, Car, Bus, Plane, Tractor, Forklift } from "lucide-react-native";
import { grupoEquipo } from "../theme/entityIcons";

// Ícono por tipo de equipo (vehículo, minibús, drone, camión, tractor, grúa o maquinaria).
export function EquipoIcon({ tipo, ...props }) {
  switch (grupoEquipo(tipo)) {
    case "drone": return <Plane {...props} />;
    case "minibus": return <Bus {...props} />;
    case "vehiculo": return <Car {...props} />;
    case "tractor": return <Tractor {...props} />;
    case "grua": return <Forklift {...props} />;
    default: return <Truck {...props} />;
  }
}
