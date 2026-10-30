import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Ambientes: cada modo de Vite apunta a un único proyecto de Firebase.
//   production → smartone-v3 (solo `vite build`, para deploy:prod)
//   qa         → smartone-v3-qa (npm run dev y deploy:qa)
//   emuladores → emuladores locales con el proyecto smartone-v3-qa
const AMBIENTES = {
  production: { proyecto: 'smartone-v3', emuladores: 'false', api: 'https://smartone-v3.web.app' },
  qa: { proyecto: 'smartone-v3-qa', emuladores: 'false', api: 'https://smartone-v3-qa.web.app' },
  emuladores: { proyecto: 'smartone-v3-qa', emuladores: 'true', api: '' },
}
const PRODUCCION = AMBIENTES.production
const CLAVES_AMBIENTE = ['VITE_FIREBASE_', 'VITE_API_URL', 'VITE_USE_FIREBASE_EMULATORS']

// Detiene vite si la configuración no corresponde al modo: así un build de producción nunca sale
// con emuladores o con otro proyecto, y localhost nunca apunta a producción.
function verificarAmbiente(command, mode) {
  const falla = (motivo) => { throw new Error(`[ambiente ${mode}] ${motivo}`) }
  const esperado = AMBIENTES[mode]
  if (!esperado) falla(`modo desconocido. Use uno de: ${Object.keys(AMBIENTES).join(', ')}.`)
  // .env.local se carga en todos los modos y pisaría el ambiente elegido.
  if (existsSync('.env.local')) {
    const definidas = readFileSync('.env.local', 'utf8').split(/\r?\n/)
      .filter((l) => /^\s*[A-Z_]+\s*=/.test(l) && CLAVES_AMBIENTE.some((c) => l.trim().startsWith(c)))
    if (definidas.length) falla('.env.local no debe definir variables del ambiente (VITE_FIREBASE_*, VITE_API_URL, VITE_USE_FIREBASE_EMULATORS). Quítelas: el ambiente sale de .env.qa, .env.emuladores o .env.production.')
  }
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const sinCompletar = Object.entries(env).filter(([, v]) => v === 'COMPLETAR').map(([k]) => k)
  if (sinCompletar.length) falla(`faltan valores en .env.${mode}: ${sinCompletar.join(', ')}.`)
  if (env.VITE_FIREBASE_PROJECT_ID !== esperado.proyecto) falla(`el proyecto debe ser ${esperado.proyecto} y es ${env.VITE_FIREBASE_PROJECT_ID || '(vacío)'}.`)
  if ((env.VITE_USE_FIREBASE_EMULATORS || 'false') !== esperado.emuladores) falla(`VITE_USE_FIREBASE_EMULATORS debe ser ${esperado.emuladores}.`)
  if ((env.VITE_API_URL || '') !== esperado.api) falla(`VITE_API_URL debe ser "${esperado.api}".`)
  // localhost (vite dev) nunca contra producción.
  if (command === 'serve' && (env.VITE_FIREBASE_PROJECT_ID === PRODUCCION.proyecto || env.VITE_API_URL === PRODUCCION.api)) {
    falla('localhost no puede apuntar a producción. Use npm run dev (QA) o npm run dev:emuladores.')
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  verificarAmbiente(command, mode)
  return {
    plugins: [react()],
  }
})
