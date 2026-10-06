import React from "react";
import { Image } from "react-native";

// Asset oficial de SmartOne (frontend/src/assets/logoSA.png, copiado a
// mobile/assets/logoSmartOne.png) — nunca el ícono "S" azul genérico de
// la referencia de diseño, que es un placeholder del mockup.
export function Logo({ height = 32 }) {
  return (
    <Image
      source={require("../../assets/logoSmartOne.png")}
      style={{ height, aspectRatio: 2.6 }}
      resizeMode="contain"
    />
  );
}
