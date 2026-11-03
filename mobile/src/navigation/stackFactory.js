import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import DetalleEmpresaScreen from "../screens/DetalleEmpresaScreen";
import DetallePersonaScreen from "../screens/DetallePersonaScreen";
import DetalleEquipoScreen from "../screens/DetalleEquipoScreen";
import DetalleProyectoScreen from "../screens/DetalleProyectoScreen";
import ListaProyectosScreen from "../screens/ListaProyectosScreen";
import ListaEmpresasScreen from "../screens/ListaEmpresasScreen";
import ListaPersonasScreen from "../screens/ListaPersonasScreen";
import ListaEquiposScreen from "../screens/ListaEquiposScreen";

// Cada pantalla dibuja su propio ScreenHeader — el stack nativo nunca muestra su header.
const screenOptions = { headerShown: false };

// Todos los detalles son navegables entre sí (Empresa -> Persona o Equipo, Proyecto ->
// Empresa): cada stack de pestaña registra el mismo set de pantallas y solo cambia la inicial.
export function createDomainStack(initialRouteName) {
  const Stack = createNativeStackNavigator();
  return function DomainStack() {
    return (
      <Stack.Navigator initialRouteName={initialRouteName} screenOptions={screenOptions}>
        <Stack.Screen name="ListaProyectos" component={ListaProyectosScreen} />
        <Stack.Screen name="ListaEmpresas" component={ListaEmpresasScreen} />
        <Stack.Screen name="ListaPersonas" component={ListaPersonasScreen} />
        <Stack.Screen name="ListaEquipos" component={ListaEquiposScreen} />
        <Stack.Screen name="DetalleProyecto" component={DetalleProyectoScreen} />
        <Stack.Screen name="DetalleEmpresa" component={DetalleEmpresaScreen} />
        <Stack.Screen name="DetallePersona" component={DetallePersonaScreen} />
        <Stack.Screen name="DetalleEquipo" component={DetalleEquipoScreen} />
      </Stack.Navigator>
    );
  };
}
