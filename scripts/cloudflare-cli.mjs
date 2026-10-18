import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const [action] = process.argv.slice(2);
const cli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const runtime = new URL("./sites-env.mjs", import.meta.url).href;
function run(args) {
  const r = spawnSync(process.execPath, ["--import", runtime, cli, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (action === "deploy") {
  const config = JSON.parse(fs.readFileSync("wrangler.json", "utf8"));
  const db = config.d1_databases?.find((x) => x.binding === "DB");
  if (!db || db.database_id === "11111111-1111-4111-8111-111111111111")
    throw new Error(
      "Set the real orbit-db D1 database_id in wrangler.json before deploying.",
    );
  if (!fs.existsSync("dist/server/wrangler.json"))
    throw new Error("Run npm run build first.");
  const built = JSON.parse(
    fs.readFileSync("dist/server/wrangler.json", "utf8"),
  );
  if (
    built.d1_databases?.find((x) => x.binding === "DB")?.database_id !==
    db.database_id
  )
    throw new Error("Database configuration changed. Run npm run build again.");
  run([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    "wrangler.json",
  ]);
  run(["deploy", "--config", "dist/server/wrangler.json", "--keep-vars"]);
} else if (action === "migrate-local")
  run([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    "wrangler.json",
    "--persist-to",
    ".wrangler/state",
  ]);
else throw new Error("Expected deploy or migrate-local.");
