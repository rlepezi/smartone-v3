import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../contexts/AuthContext";
import { colors } from "../theme/colors";
import { spacing, radius, minTouchTarget } from "../theme/spacing";
import { typography } from "../theme/typography";
import { Logo } from "../components/Logo";

// Mensajes específicos por código de Firebase Auth, con el código crudo
// visible al final para poder diagnosticar sin acceso a los logs del
// dispositivo (temporal, mientras se valida el login contra producción).
function mensajeError(err) {
  const mapa = {
    "auth/user-not-found": "No existe un usuario con ese correo en este proyecto de Firebase.",
    "auth/wrong-password": "La contraseña es incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/invalid-email": "El formato del correo no es válido.",
    "auth/user-disabled": "Este usuario está deshabilitado.",
    "auth/network-request-failed": "No se pudo conectar con Firebase (revisa la conexión de red).",
    "auth/too-many-requests": "Demasiados intentos fallidos. Espera unos minutos.",
  };
  const base = mapa[err?.code] || "No se pudo iniciar sesión.";
  return `${base} (${err?.code || "sin código"})`;
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    setEnviando(true);
    try {
      await login(email.trim(), password);
      // El cambio de pantalla lo maneja RootNavigator al reaccionar al
      // nuevo `user` de AuthContext — no se navega manualmente acá.
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.headerFrom, colors.headerTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Logo height={40} />
        <Text style={[typography.body, styles.subtitle]}>
          Acreditación de contratistas
        </Text>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Correo electrónico"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
          />
          {error && (
            <Text style={[typography.caption, styles.error]}>{error}</Text>
          )}
          <TouchableOpacity
            style={styles.button}
            onPress={handleSubmit}
            disabled={enviando || !email || !password}
          >
            {enviando ? (
              <ActivityIndicator color={colors.onDark} />
            ) : (
              <Text style={[typography.body, { color: colors.onDark }]}>
                Ingresar
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.xl,
  },
  subtitle: { color: colors.accent },
  form: { gap: spacing.md },
  input: {
    minHeight: minTouchTarget,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    color: colors.ink,
  },
  button: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
  },
  error: { color: "#FDE4E5" },
});
