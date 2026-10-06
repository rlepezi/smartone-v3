import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { MandanteProvider } from "../contexts/MandanteContext";
import { colors } from "../theme/colors";
import LoginScreen from "../screens/LoginScreen";
import Tabs from "./Tabs";

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        <MandanteProvider>
          <Tabs />
        </MandanteProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
