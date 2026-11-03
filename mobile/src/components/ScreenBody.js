import React from "react";
import { ScrollView, RefreshControl, View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { SkeletonList } from "./Skeleton";
import { ErrorState } from "./ErrorState";

// Cuerpo con scroll de las pantallas: "tirar para actualizar", esqueleto mientras carga la
// primera vez y error con reintento. Con datos ya cargados, un error no tapa el contenido.
export function ScreenBody({ estado, children }) {
  const { loading, refreshing, error, data, refresh, reload } = estado;
  return (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={Boolean(refreshing)} onRefresh={refresh} colors={[colors.primary]} />}
    >
      {loading && !data ? <View style={{ marginHorizontal: -spacing.lg }}><SkeletonList rows={5} /></View> : null}
      {error && !data ? <ErrorState message={error.message} onRetry={reload} /> : null}
      {data ? children : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: colors.bg },
  contenido: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
