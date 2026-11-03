// Un ícono fijo por entidad (accesos, avatares, barra inferior) y uno por
// tipo de equipo (components/EquipoIcon.js). El tipo de equipo es texto libre en la Maquinaria
// (recurso.tipo): se reconoce por palabras clave y, si no calza, se usa el
// ícono genérico de maquinaria.
import { FolderKanban, Building2, Users, Truck } from "lucide-react-native";

export const entityIcons = {
  proyectos: FolderKanban,
  empresas: Building2,
  personas: Users,
  equipos: Truck,
};

const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Grupo de un tipo de equipo: vehiculo, minibus, drone o maquinaria.
export function grupoEquipo(tipo) {
  const t = sinTildes(tipo);
  if (/drone|dron\b/.test(t)) return "drone";
  if (/mini ?bus|bus\b|furgon/.test(t)) return "minibus";
  if (/camioneta|auto|automovil|vehiculo|jeep|station|suv|moto/.test(t)) return "vehiculo";
  if (/camion/.test(t)) return "camion";
  if (/tractor/.test(t)) return "tractor";
  if (/grua|horquilla/.test(t)) return "grua";
  return "maquinaria";
}

