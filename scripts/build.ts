/**
 * @file scripts/build.ts
 * @description
 * High-performance, unified build orchestrator for SveltyCMS.
 *
 * Features:
 * - Executes Vite production build with configurable ADAPTER and options
 * - Bundles collaboration server (yjs-sync-server.ts) via esbuild native API
 * - Syncs module-worker chunk for Node adapter
 * - Optional post-build bundle analysis and statistics
 */

import { build as esbuild } from "esbuild";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);

// Extract flags
const adapterFlag = args.find((a) => a.startsWith("--adapter="))?.split("=")[1];
const isAnalyze = args.includes("--analyze");
const isStats = args.includes("--stats");
const isVerbose = args.includes("--verbose");

// Pass-through remaining flags to vite
const viteArgs = args.filter(
  (a) => !a.startsWith("--adapter=") && a !== "--analyze" && a !== "--stats" && a !== "--verbose",
);

// Environment configuration
const env = { ...process.env };
if (adapterFlag) {
  env.ADAPTER = adapterFlag;
}

console.log(`\x1b[36m🚀 Starting SveltyCMS build (Adapter: ${env.ADAPTER || "default"})\x1b[0m`);

// 1. Run Vite build
const viteRes = spawnSync("bun", ["x", "vite", "build", ...viteArgs], {
  cwd: ROOT,
  stdio: "inherit",
  env,
});

if (viteRes.status !== 0) {
  console.error(`\x1b[31m❌ Vite build failed with exit code ${viteRes.status}\x1b[0m`);
  process.exit(viteRes.status ?? 1);
}

// 2. Bundle YJS Sync Server
console.log(`\x1b[36m📦 Bundling collaboration server (yjs-sync-server)...\x1b[0m`);
try {
  mkdirSync(resolve(ROOT, "build"), { recursive: true });
  await esbuild({
    entryPoints: [resolve(ROOT, "src/services/collaboration/yjs-sync-server.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    minify: true,
    treeShaking: true,
    target: "node24",
    outfile: resolve(ROOT, "build/yjs-sync-server.js"),
    external: ["ws", "yjs", "y-protocols", "lib0"],
    alias: {
      "@utils": resolve(ROOT, "src/utils"),
    },
    logLevel: isVerbose ? "info" : "warning",
  });
  console.log(`\x1b[32m✔ Collaboration server bundled: build/yjs-sync-server.js\x1b[0m`);
} catch (err) {
  console.error(`\x1b[31m❌ Failed to bundle yjs-sync-server:\x1b[0m`, err);
  process.exit(1);
}

// 3. Module-worker copy for Node adapter
const workerSrc = resolve(ROOT, "src/content/module-worker.server.ts");
const workerDestDir = resolve(ROOT, "build/server/chunks");
const workerDest = resolve(workerDestDir, "module-worker.server.ts");

if (existsSync(workerSrc) && existsSync(workerDestDir)) {
  try {
    cpSync(workerSrc, workerDest);
    console.log(`\x1b[32m✔ Module worker copied to build/server/chunks\x1b[0m`);
  } catch (err) {
    console.warn(`\x1b[33m⚠️ Could not copy module-worker.server.ts (non-fatal):\x1b[0m`, err);
  }
}

// 4. Optional Post-Build tasks
if (isAnalyze) {
  console.log(`\x1b[36m📊 Running bundle visualizer...\x1b[0m`);
  spawnSync("bun", ["x", "vite-bundle-visualizer"], { cwd: ROOT, stdio: "inherit" });
}

if (isStats) {
  console.log(`\x1b[36m📈 Generating bundle stats...\x1b[0m`);
  spawnSync("bun", ["run", "scripts/bundle-stats.ts"], { cwd: ROOT, stdio: "inherit" });
}

console.log(`\x1b[32m✨ SveltyCMS build completed successfully.\x1b[0m`);
