#!/usr/bin/env node
/**
 * Runs a one-off server script (migrations, rollup backfill) by name:
 *   node scripts/run-script.mjs <name> [...args]
 *
 * - Dev (server/<name>.ts present): runs the TS source via tsx with .env loaded.
 * - Production image (no server/ source, no devDeps): runs the bundled
 *   dist/scripts/<name>.js produced by `npm run build:scripts`.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [name, ...args] = process.argv.slice(2);

if (!name || !/^[\w-]+$/.test(name)) {
  console.error("Usage: node scripts/run-script.mjs <script-name> [...args]");
  process.exit(1);
}

const source = join(root, "server", `${name}.ts`);
const bundled = join(root, "dist", "scripts", `${name}.js`);
const bin = (cmd) => join(root, "node_modules", ".bin", process.platform === "win32" ? `${cmd}.cmd` : cmd);

let command;
let commandArgs;
if (existsSync(source) && existsSync(bin("tsx"))) {
  command = bin("dotenv");
  commandArgs = ["--", bin("tsx"), source, ...args];
} else if (existsSync(bundled)) {
  command = process.execPath;
  commandArgs = [bundled, ...args];
} else {
  console.error(`Script "${name}" not found (looked for ${source} and ${bundled}).`);
  process.exit(1);
}

const child = spawn(command, commandArgs, {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
