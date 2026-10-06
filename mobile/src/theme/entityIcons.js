// Un ícono fijo por entidad, reutilizado en todas partes (EntityCard,
// ListRow, tab bar) — nunca un mapeo nombre->ícono inventado por fila.
//
// Nota: lucide no tiene un ícono literal de "excavadora". `Truck` es el
// más cercano disponible para Máquinas (más neutro que `Tractor`, que
// lee como maquinaria agrícola). Si hay una preferencia distinta, es un
// cambio de una sola línea acá.
import { FolderKanban, Building, Users, Truck } from "lucide-react-native";

export const entityIcons = {
  proyectos: FolderKanban,
  empresas: Building,
  personas: Users,
  maquinas: Truck,
};
