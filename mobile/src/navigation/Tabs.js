import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { House } from "lucide-react-native";
import { colors } from "../theme/colors";
import { entityIcons } from "../theme/entityIcons";
import { createDomainStack } from "./stackFactory";
import InicioScreen from "../screens/InicioScreen";

const Tab = createBottomTabNavigator();

// Cada pantalla dibuja su propio GradientHeader (variant home/detail) —
// el stack nativo nunca muestra su header por encima.
const InicioStackNav = createNativeStackNavigator();
function InicioStack() {
  return (
    <InicioStackNav.Navigator screenOptions={{ headerShown: false }}>
      <InicioStackNav.Screen name="InicioHome" component={InicioScreen} />
    </InicioStackNav.Navigator>
  );
}

const ProyectosStack = createDomainStack("ListaProyectos");
const EmpresasStack = createDomainStack("ListaEmpresas");
const PersonasStack = createDomainStack("ListaPersonas");
const MaquinasStack = createDomainStack("ListaMaquinas");

// Un ícono fijo por pestaña (entityIcons — el mismo que en EntityCard/
// ListRow, nunca uno distinto acá).
const TAB_ICONS = {
  Inicio: House,
  Proyectos: entityIcons.proyectos,
  Empresas: entityIcons.empresas,
  Personas: entityIcons.personas,
  Máquinas: entityIcons.maquinas,
};

export default function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { borderTopColor: colors.border },
        tabBarIcon: ({ color, size }) => {
          const Icon = TAB_ICONS[route.name];
          return <Icon color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={InicioStack} />
      <Tab.Screen name="Proyectos" component={ProyectosStack} />
      <Tab.Screen name="Empresas" component={EmpresasStack} />
      <Tab.Screen name="Personas" component={PersonasStack} />
      <Tab.Screen name="Máquinas" component={MaquinasStack} />
    </Tab.Navigator>
  );
}
