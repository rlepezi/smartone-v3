import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { House } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import { can } from "../permissions/can";
import { colors } from "../theme/colors";
import { entityIcons } from "../theme/entityIcons";
import { fontFamily, MAX_FONT_SCALE } from "../theme/typography";
import { createDomainStack } from "./stackFactory";
import InicioScreen from "../screens/InicioScreen";

const Tab = createBottomTabNavigator();

// Cada pantalla dibuja su propio ScreenHeader: el stack nativo nunca muestra su header.
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
const EquiposStack = createDomainStack("ListaEquipos");

const TAB_ICONS = {
  Inicio: House,
  Proyectos: entityIcons.proyectos,
  Empresas: entityIcons.empresas,
  Personas: entityIcons.personas,
  Equipos: entityIcons.equipos,
};

// Barra inferior: Inicio, Proyectos, Empresas, Personas y Equipos. admin_comercial solo ve
// Empresas (mismo alcance que en la web).
export default function Tabs() {
  const { rol } = useAuth();
  const operacion = can(rol, "ver_operacion");
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
        tabBarIcon: ({ color, size }) => {
          const Icon = TAB_ICONS[route.name];
          return <Icon color={color} size={size - 2} />;
        },
        tabBarLabel: ({ color }) => (
          <Text style={{ color, fontFamily: fontFamily.semiBold, fontSize: 11 }} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
            {route.name}
          </Text>
        ),
      })}
    >
      {operacion && <Tab.Screen name="Inicio" component={InicioStack} />}
      {operacion && <Tab.Screen name="Proyectos" component={ProyectosStack} />}
      <Tab.Screen name="Empresas" component={EmpresasStack} />
      {operacion && <Tab.Screen name="Personas" component={PersonasStack} />}
      {operacion && <Tab.Screen name="Equipos" component={EquiposStack} />}
    </Tab.Navigator>
  );
}
