# mobile/ — Reglas del paquete

App móvil Android de SmartOne v3 (Expo + React Native + JavaScript). Paquete
independiente dentro del monorepo, al mismo nivel que `frontend/` y
`functions/`. Este archivo es la fuente de verdad para cualquier trabajo
dentro de `mobile/` — léelo antes de tocar código aquí.

**Nota:** `npx create-expo-app` genera por defecto un `AGENTS.md` propio que
sugiere Expo Router. Este proyecto usa **React Navigation** (bottom tabs +
native-stack), no Expo Router — instrucción explícita del prompt original.
Si algo vuelve a sobrescribir este archivo con esa plantilla genérica,
restaurar este contenido.

## Alcance de Entrega 1

**Solo lectura.** Seis pantallas: Inicio, Lista (Proyectos/Empresas/Personas/
Máquinas), Detalle Empresa, Detalle Persona, Detalle Maquinaria, Detalle
Proyecto. Cero escritura: ninguna llamada POST/PUT/PATCH/DELETE, ningún botón
de acción funcional, no existe pantalla Evaluar. Los botones de acción del
diseño (Editar, Asignar recurso, Cargar documento, Finalizar asignación,
Incorporar empresa) se muestran pero no hacen nada en esta entrega.

## Stack y decisiones fijas

- Expo (React Native), **JavaScript puro** — nunca TypeScript.
- **React Navigation** (bottom tabs + native-stack por pestaña) — no Expo
  Router.
- Sin Redux, sin librerías de UI de terceros (NativeBase, Paper, etc.) — los
  componentes de `src/components/` son la única capa de UI compartida.
- Paquete independiente: su propio `package.json`/`node_modules`. Sin npm
  workspaces ni paquetes compartidos con `frontend/` en esta entrega.
- Dependencias nativas se instalan **solo con `npx expo install`**, nunca con
  `npm install`/`add` a secas, para mantener compatibilidad con el SDK de
  Expo instalado (ver versión exacta en `package.json`).

## Backend: todo vía API, nunca Firestore directo

`firestore.rules` en la raíz del monorepo bloquea toda lectura directa salvo
`usuarios/{ownUid}` (ver la auditoría Fase A). Todas las pantallas leen datos
a través de la API Express existente (`functions/`, patrón repository →
service → controller → routes), con el mismo mecanismo de auth que
`frontend/`: Firebase Auth ID token en `Authorization: Bearer <token>`.

- `src/config/firebase.js` es el **único** lugar donde se llama
  `initializeApp`/`initializeAuth`. Ningún otro archivo inicializa Firebase.
- `src/api/client.js` agrega el header de auth, resuelve la baseURL según
  entorno (emulador vs. producción) y normaliza errores a `{ code, message }`
  (el backend responde `{ error, message }` — `code` = `error`).
- Los conteos agregados (Inicio, cumplimiento) vienen de endpoints del
  backend (`/reportes/*`). **Prohibido contar/sumar documentos en el
  cliente** — eso replica el bug conocido de la app actual (`0/0` mostrado
  como `0%` en vez de "sin datos"; `avancePct` es `null`, nunca `0`, cuando
  no hay nada evaluable).

## Roles y permisos

Los únicos custom claims del sistema son `rol` y `mandanteId` (confirmado en
la auditoría Fase A). `src/permissions/can.js` es el **único** archivo donde
puede aparecer lógica de rol (`if (rol === '...')`). En cualquier otro
archivo, la decisión de mostrar/ocultar algo pasa por `can()`. En esta
entrega `can()` solo se usa para ocultar botones de acción (deshabilitados o
no renderizados), nunca para habilitar lógica de escritura real.

## No inventar

No se inventan nombres de campos, colecciones ni endpoints que no estén
confirmados en el código de `functions/`. Si una pantalla necesita un dato
sin fuente confirmada, se reporta como gap explícito (ver auditoría Fase A)
en vez de simularlo con datos falsos.

## Variables de entorno

Todas con prefijo `EXPO_PUBLIC_`. `mobile/.env.example` se commitea con
placeholders; `mobile/.env*` (real) va en `.gitignore` de la raíz. El host
de los emuladores depende del dispositivo: `10.0.2.2` para el emulador
Android, la IP LAN del PC para un dispositivo físico. Los puertos deben
coincidir con `firebase.json` de la raíz (auth 9099, functions 5001,
firestore 8080, storage 9199).

## Prohibido sin aprobación explícita

- Modificar `functions/`, `frontend/`, `firestore.rules` o `firebase.json`.
- Crear endpoints nuevos en `functions/`.
- Hardcodear `mandanteId`, datos de una empresa real o credenciales.
