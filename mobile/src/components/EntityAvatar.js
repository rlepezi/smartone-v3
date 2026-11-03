import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, entityColors } from "../theme/colors";
import { FolderKanban } from "lucide-react-native";
import { EquipoIcon } from "./EquipoIcon";
import { MAX_FONT_SCALE, fontFamily } from "../theme/typography";
import { iniciales } from "../utils/texto";

// Avatar: iniciales para personas y empresas; ícono por tipo para equipos (y proyectos).
// tipo: "persona" | "empresa" | "equipo" | "proyecto".
export function EntityAvatar({ tipo, nombre, tipoEquipo, size = 44, oscuro = false }) {
  const clave = { persona: "personas", empresa: "empresas", equipo: "equipos", proyecto: "proyectos" }[tipo];
  const tono = entityColors[clave] || entityColors.empresas;
  const fondo = oscuro ? colors.onDarkSurface : tono.bg;
  const color = oscuro ? colors.onDark : tono.color;
  const tamIcono = Math.round(size * 0.48);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: fondo }]}>
      {tipo === "equipo" ? <EquipoIcon tipo={tipoEquipo} color={color} size={tamIcono} /> : tipo === "proyecto" ? <FolderKanban color={color} size={tamIcono} /> : (
        <Text style={{ color, fontFamily: fontFamily.bold, fontSize: Math.round(size * 0.36) }} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {iniciales(nombre)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
});
