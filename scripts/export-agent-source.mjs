import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.length > 3) throw new Error("Usage: node scripts/export-agent-source.mjs [deployed-source-commit]");
const requested = process.argv[2] || "HEAD";
if (requested !== "HEAD" && !/^[a-f0-9]{40}$/.test(requested)) {
  throw new Error("Provide the full deployed sourceCommit returned by /version");
}
const commit = execFileSync("git", ["rev-parse", "--verify", `${requested}^{commit}`], { cwd: root, encoding: "utf8" }).trim();
if (requested === "HEAD" && execFileSync("git", ["status", "--porcelain", "--", "samples/payment-api/src",
  "samples/payment-api/package.json", "samples/payment-api/package-lock.json",
  "samples/payment-api/Dockerfile"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("Commit runtime source changes first so the snapshot identifies the deployed image");
}
const output = process.env.PAYMENT_SOURCE_DIR ?
  resolve(process.env.PAYMENT_SOURCE_DIR, `source-${commit}`) :
  resolve(root, "artifacts", `source-${commit}`);
mkdirSync(output, { recursive: true });
const files = {};
const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", commit, "--",
  "samples/payment-api/src", "samples/payment-api/package.json", "samples/payment-api/package-lock.json",
  "samples/payment-api/Dockerfile"], { cwd: root, encoding: "utf8" }).trim().split("\n");
if (paths.length < 4) throw new Error("This commit has no exportable payment runtime; use the matching source repository");
for (const path of paths) {
  const file = path.replace(/^samples\/payment-api\//, "");
  const contents = execFileSync("git", ["show", `${commit}:${path}`], { cwd: root });
  mkdirSync(dirname(resolve(output, file)), { recursive: true });
  writeFileSync(resolve(output, file), contents);
  files[file] = createHash("sha256").update(contents).digest("hex");
}
writeFileSync(resolve(output, "release.json"), JSON.stringify({ sourceCommit: commit, files }, null, 2) + "\n");
console.log(`Runtime-only source snapshot: ${output}`);
console.log("Grant code access only to these runtime files, not this repository's documents, tests or control scripts.");
