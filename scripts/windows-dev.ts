import "dotenv/config";
import { spawn } from "node:child_process";

const required = ["DISCORD_TOKEN", "CLIENT_ID", "DATABASE_URL"] as const;
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing env: ${missing.join(", ")}`);
  console.error("Create .env from .env.example and fill Discord settings.");
  process.exit(1);
}

await run("npx", ["prisma", "generate"]);
await run("npx", ["prisma", "migrate", "deploy"]);
await import("../src/index.js");

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown"}`));
    });
  });
}
