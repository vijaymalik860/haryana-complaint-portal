import "dotenv/config";

import { execFileSync, spawnSync } from "node:child_process";

const schemaPath = "prisma/schema.prisma";

function npxCommand(args: string[]) {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/c", "npx", ...args] }
    : { command: "npx", args };
}

function makeIdempotent(sql: string) {
  return sql
    .replaceAll("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
    .replaceAll("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ")
    .replaceAll("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ");
}

const diff = npxCommand([
  "prisma",
  "migrate",
  "diff",
  "--from-empty",
  "--to-schema-datamodel",
  schemaPath,
  "--script",
]);

const sql = execFileSync(diff.command, diff.args, { encoding: "utf8" });

const execute = npxCommand([
    "prisma",
    "db",
    "execute",
    "--stdin",
    "--schema",
    schemaPath,
]);

const result = spawnSync(
  execute.command,
  execute.args,
  {
    input: makeIdempotent(sql),
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const generate = npxCommand(["prisma", "generate"]);
execFileSync(generate.command, generate.args, { stdio: "inherit" });
