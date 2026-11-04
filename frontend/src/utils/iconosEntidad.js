import { Building2, Truck, Users } from "lucide-react";

// Ícono de cada tipo de entidad de un requerimiento (el mismo de las pestañas del expediente, del
// catálogo de requerimientos y de Nueva Acreditación). "maquinaria" es el nivel del Mapeo documental;
// "recurso", el tipoEntidad del requerimiento.
export const ICONO_TIPO_ENTIDAD = {
  empresa: { Icono: Building2, label: "Empresa" },
  persona: { Icono: Users, label: "Persona" },
  recurso: { Icono: Truck, label: "Maquinaria" },
  maquinaria: { Icono: Truck, label: "Maquinaria" },
};
