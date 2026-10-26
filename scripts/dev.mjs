import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

if (!existsSync(".dev.vars")) {
  copyFileSync(".dev.vars.example", ".dev.vars");
  console.log("File .dev.vars dibuat dari contoh. Ganti MASTER_PASSWORD dulu.");
}

function run(args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node_modules/.bin/wrangler", args, {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wrangler exited ${code}`));
    });
  });
}

await run(["d1", "migrations", "apply", "ai-studio-konten", "--local"], { CI: "true" });
await run(["dev"]);
