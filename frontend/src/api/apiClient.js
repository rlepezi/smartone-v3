import { auth } from "../services/firebase";

// En dev (npm run dev) apunta directo al emulador de Functions; en un
// build de producción (servido por Firebase Hosting) usa una ruta
// relativa — el rewrite de Hosting en firebase.json la reenvía a la
// función `api`, evitando CORS por completo (queda same-origin). Ninguna
// de las dos ramas se usa si VITE_API_URL ya viene seteada explícita.
const BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.DEV
    ? `http://localhost:5001/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/us-central1/api`
    : "/api"
);

export const apiClient = async (endpoint, { body, method = "GET", ...customConfig } = {}) => {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const config = {
    method,
    headers: {
      ...headers,
      ...customConfig.headers,
    },
    ...customConfig,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Error en la petición a la API");
  }

  return data;
};