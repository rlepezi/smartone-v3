# Ambientes

| Ambiente | Proyecto Firebase | Alias | Frontend (modo Vite) |
|---|---|---|---|
| Pruebas (actual) | `smartone-v3` | `prod` | `.env.pruebas` · `npm run dev` (localhost); `.env.production` · `npm run deploy:prod` |
| Producción definitiva (en pausa) | `smartone-v3-qa` | `qa` (por defecto) | `.env.qa` · `npm run dev:qa`, `npm run deploy:qa` |
| Emuladores | `smartone-v3-qa` (local) | — | `.env.emuladores` · `npm run dev:emuladores` |

`vite.config.js` se detiene si el modo no coincide con el proyecto, la API o los emuladores, o si `frontend/.env.local` define variables del ambiente. Además, localhost nunca apunta al proyecto **productivo**, que se define en `frontend/.env`:

```
SMARTONE_PROYECTO_PRODUCTIVO=        # vacío mientras no haya producción; p. ej. smartone-v3-qa
```

## Desplegar

Desde la raíz del repositorio:

```bash
npm run deploy:qa                          # reglas + índices, functions, hosting
npm run deploy:qa -- --solo=hosting        # solo algunos pasos: reglas, functions, hosting
npm run deploy:prod                        # exige commit en origin/master y escribir «prod»
```

El script exige el árbol de git limpio, construye el frontend en el modo del ambiente, despliega siempre con `-P <alias>` y nunca con `--force` (producción tiene índices creados fuera del archivo).

## Scripts de datos (`functions/src/scripts`)

Cada ambiente usa su cuenta de servicio: `functions/serviceAccountKey.qa.json` y `functions/serviceAccountKey.prod.json` (ignoradas por git y excluidas del despliegue).

```bash
cd functions
SMARTONE_ENV=qa node src/scripts/seedSuperAdmin.js
SMARTONE_ENV=qa node src/scripts/seedDatosPrueba.js            # datos sintéticos
node src/scripts/copiarConfiguracionAQa.js                     # simulación
node src/scripts/copiarConfiguracionAQa.js --aplicar           # copia la configuración prod → QA
node src/scripts/crearCarpetasPrueba.js "C:/QA/Repositorio Empresas"
SMARTONE_ENV=prod node src/scripts/listarDatosPrueba.js --desde=06/10/2026 --csv=datos.csv
```

- Un script que escribe en producción exige `--confirmar-prod`.
- `copiarConfiguracionAQa.js` solo lee de producción. Copia mandantes, perfiles, requerimientos, vínculos, tipos documentales, reglas y plantillas. Nunca copia personas, empresas, expedientes, evidencias, evaluaciones, carpetas, usuarios, fuentes ni Bitácora.
- Los scripts anteriores (migraciones y backfills) todavía usan `serviceAccountKey.json`.
