// Único lugar del proyecto donde se inicializa Firebase (regla de
// mobile/AGENTS.md). Cualquier otro archivo que necesite auth/firestore
// importa `auth`/`db` desde acá, nunca llama initializeApp de nuevo.
import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth, getReactNativePersistence, connectAuthEmulator,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { env } from "./env";

const app = getApps().length ? getApps()[0] : initializeApp(env.firebase);

// initializeAuth (no getAuth) es obligatorio en React Native: sin
// getReactNativePersistence la sesión no sobrevive un reinicio de la app.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

if (env.useEmulators) {
  connectAuthEmulator(auth, `http://${env.emulatorHost}:9099`);
  connectFirestoreEmulator(db, env.emulatorHost, 8080);
}

export default app;
