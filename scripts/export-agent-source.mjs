import { cpSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (execFileSync("git", ["status", "--porcelain", "--", "samples/payment-api/src",
  "samples/payment-api/package.json", "samples/payment-api/package-lock.json",
  "samples/payment-api/Dockerfile"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("Commit runtime source changes first so the snapshot identifies the deployed image");
}
const output = process.env.PAYMENT_SOURCE_DIR ?
  resolve(process.env.PAYMENT_SOURCE_DIR, `source-${commit}`) :
  resolve(root, "artifacts", `source-${commit}`);
mkdirSync(output, { recursive: true });
for (const file of ["src", "package.json", "package-lock.json", "Dockerfile"]) {
  cpSync(resolve(root, "samples/payment-api", file), resolve(output, file), { recursive: true });
}
const files = {};
for (const file of [...readdirSync(resolve(output, "src")).map(file => `src/${file}`),
  "package.json", "package-lock.json", "Dockerfile"]) {
  files[file] = createHash("sha256").update(readFileSync(resolve(output, file))).digest("hex");
}
writeFileSync(resolve(output, "release.json"), JSON.stringify({ sourceCommit: commit, files }, null, 2) + "\n");
console.log(`Runtime-only source snapshot: ${output}`);
console.log("Grant code access only to these runtime files, not this repository's documents, tests or control scripts.");
