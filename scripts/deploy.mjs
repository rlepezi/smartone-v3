// Despliegue por ambiente: node scripts/deploy.mjs <qa|prod> [--solo=reglas,functions,hosting]
//
// Orden fijo: verificaciones → build del frontend en el modo del ambiente → reglas e índices →
// functions → hosting → comprobación HTTP. Nunca usa --force (en producción hay índices creados
// fuera del archivo que no deben borrarse).
//
// Verificaciones:
//  - árbol de git limpio (solo se despliega código con commit);
//  - prod: el commit actual ya está en origin/master, y se confirma escribiendo «prod»;
//  - el build valida el ambiente (vite.config.js: proyecto, API y emuladores).
import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import process from "node:process";

const AMBIENTES = {
  qa: { alias: "qa", proyecto: "smartone-v3-qa", modo: "qa", url: "https://smartone-v3-qa.web.app" },
  prod: { alias: "prod", proyecto: "smartone-v3", modo: "production", url: "https://smartone-v3.web.app" },
};
const PASOS = {
  reglas: "firestore:rules,firestore:indexes",
  functions: "functions",
  hosting: "hosting",
};

const salir = (mensaje) => {
  console.error(`\n✗ ${mensaje}`);
  process.exit(1);
};
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const ejecutar = (comando, args, env = {}) => {
  console.log(`\n$ ${comando} ${args.join(" ")}`);
  const r = spawnSync(comando, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status !== 0) salir(`Falló: ${comando} ${args.join(" ")}`);
};

const nombre = process.argv[2];
const ambiente = AMBIENTES[nombre];
if (!ambiente) salir("Indique el ambiente: node scripts/deploy.mjs qa | prod");
const soloArg = process.argv.find((a) => a.startsWith("--solo="));
const pasos = soloArg ? soloArg.slice(7).split(",").map((p) => p.trim()).filter(Boolean) : Object.keys(PASOS);
const invalidos = pasos.filter((p) => !PASOS[p]);
if (invalidos.length) salir(`Pasos no válidos: ${invalidos.join(", ")}. Use: ${Object.keys(PASOS).join(", ")}.`);

console.log(`Ambiente: ${nombre} (${ambiente.proyecto}) · pasos: ${pasos.join(", ")}`);

// 1. Solo código con commit.
if (git("status", "--porcelain")) salir("Hay cambios sin commit. Haga commit (o descártelos) antes de desplegar.");
const commit = git("rev-parse", "--short", "HEAD");
const rama = git("rev-parse", "--abbrev-ref", "HEAD");
console.log(`Commit ${commit} (${rama})`);

// 2. Producción: el commit debe estar en origin/master y se confirma a mano.
if (nombre === "prod") {
  ejecutar("git", ["fetch", "origin", "master", "--quiet"]);
  const enMaster = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/master"]).status === 0;
  if (!enMaster) salir(`El commit ${commit} no está en origin/master. Haga el merge a master antes de desplegar a producción.`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(`\nVa a desplegar ${commit} en PRODUCCIÓN (${ambiente.proyecto}). Escriba «prod» para continuar: `);
  rl.close();
  if (respuesta.trim() !== "prod") salir("Cancelado.");
}

// 3. Build del frontend en el modo del ambiente (vite.config.js valida la configuración).
if (pasos.includes("hosting")) ejecutar("npm", ["--prefix", "frontend", "run", "build", "--", "--mode", ambiente.modo]);

// 4. Despliegue, en orden y siempre con el alias explícito.
for (const paso of Object.keys(PASOS).filter((p) => pasos.includes(p))) {
  ejecutar("npx", ["firebase", "deploy", "-P", ambiente.alias, "--only", PASOS[paso]],
    paso === "functions" ? { FUNCTIONS_DISCOVERY_TIMEOUT: "60000" } : {});
}

// 5. Comprobación.
if (pasos.includes("hosting")) {
  const r = await fetch(ambiente.url).catch(() => null);
  console.log(`\n${ambiente.url} → ${r ? r.status : "sin respuesta"}`);
  if (!r || r.status !== 200) salir("El sitio no respondió 200.");
}
console.log(`\n✓ Desplegado ${commit} en ${ambiente.proyecto}.`);
