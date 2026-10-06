// Todas las variables vienen con prefijo EXPO_PUBLIC_ (única forma de
// exponer env vars al bundle de Expo en runtime).
export const env = {
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  },
  useEmulators: process.env.EXPO_PUBLIC_USE_EMULATORS === "true",
  emulatorHost: process.env.EXPO_PUBLIC_EMULATOR_HOST || "10.0.2.2",
  apiUrl: process.env.EXPO_PUBLIC_API_URL || null,
};
