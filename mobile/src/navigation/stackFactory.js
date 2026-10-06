import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import DetalleEmpresaScreen from "../screens/DetalleEmpresaScreen";
import DetallePersonaScreen from "../screens/DetallePersonaScreen";
import DetalleMaquinariaScreen from "../screens/DetalleMaquinariaScreen";
import DetalleProyectoScreen from "../screens/DetalleProyectoScreen";
import ListaProyectosScreen from "../screens/ListaProyectosScreen";
import ListaEmpresasScreen from "../screens/ListaEmpresasScreen";
import ListaPersonasScreen from "../screens/ListaPersonasScreen";
import ListaMaquinasScreen from "../screens/ListaMaquinasScreen";

// Cada pantalla dibuja su propio GradientHeader (variant "detail") — el
// stack nativo nunca muestra su header por encima.
const screenOptions = { headerShown: false };

// Todos los detalles son navegables entre sí (Empresa -> Persona o
// Maquinaria, Proyecto -> Empresa): cada stack de pestaña registra el
// mismo set de pantallas destino y solo cambia la ruta inicial.
export function createDomainStack(initialRouteName) {
  const Stack = createNativeStackNavigator();
  return function DomainStack() {
    return (
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={screenOptions}
      >
        <Stack.Screen name="ListaProyectos" component={ListaProyectosScreen} />
        <Stack.Screen name="ListaEmpresas" component={ListaEmpresasScreen} />
        <Stack.Screen name="ListaPersonas" component={ListaPersonasScreen} />
        <Stack.Screen name="ListaMaquinas" component={ListaMaquinasScreen} />
        <Stack.Screen name="DetalleProyecto" component={DetalleProyectoScreen} />
        <Stack.Screen name="DetalleEmpresa" component={DetalleEmpresaScreen} />
        <Stack.Screen name="DetallePersona" component={DetallePersonaScreen} />
        <Stack.Screen name="DetalleMaquinaria" component={DetalleMaquinariaScreen} />
      </Stack.Navigator>
    );
  };
}
