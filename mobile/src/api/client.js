// Cliente HTTP hacia la API Express existente (functions/). Nunca se lee
// Firestore directo desde la app (firestore.rules lo bloquea para todo lo
// que no sea el propio documento usuarios/{uid} — ver auditoría Fase A).
import { auth } from "../config/firebase";
import { env } from "../config/env";

// En emulador, functions expone la función `api` en
// http://<host>:5001/<projectId>/us-central1/api (mismo patrón que
// frontend/src/api/apiClient.js). En producción usa EXPO_PUBLIC_API_URL
// (Firebase Hosting + rewrite /api -> función `api`).
const BASE_URL = env.useEmulators ?
  `http://${env.emulatorHost}:5001/${env.firebase.projectId}/us-central1/api` :
  env.apiUrl;

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function toQueryString(params = {}) {
  const entradas = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entradas.length === 0) return "";
  const usp = new URLSearchParams();
  entradas.forEach(([k, v]) => usp.append(k, v));
  return `?${usp.toString()}`;
}

// Entrega 1 es de solo lectura: `method` solo se usa para GET en la
// práctica, pero se deja parametrizable para no tener que tocar este
// archivo cuando se habilite escritura en una entrega futura.
export async function apiGet(path, params) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}${toQueryString(params)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  } catch {
    throw new ApiError("NetworkError", "No se pudo conectar con el servidor.", 0);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new ApiError(
        body?.error || "UnknownError",
        body?.message || "Error en la petición a la API.",
        response.status,
    );
  }

  return body?.data;
}

export { ApiError };
