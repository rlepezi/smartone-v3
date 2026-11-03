import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../theme/colors";
import { fontFamily, MAX_FONT_SCALE } from "../theme/typography";
import { textoPorcentaje } from "../utils/complianceStatus";

// Anillo de % (cumple / aplicables). Sin % ("—") el anillo queda vacío.
export function PercentRing({ pct, color, size = 48, grosor = 5 }) {
  const r = (size - grosor) / 2;
  const c = 2 * Math.PI * r;
  const lleno = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct)) / 100;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={grosor} fill="none" />
        {lleno > 0 ? (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={grosor} fill="none"
            strokeDasharray={`${c * lleno} ${c}`} strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centro]}>
        <Text style={{ fontFamily: fontFamily.bold, fontSize: size * 0.24, color: colors.text }} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {textoPorcentaje(pct)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centro: { alignItems: "center", justifyContent: "center" },
});
