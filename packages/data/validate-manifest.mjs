import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(packageRoot, "src");
const manifest = JSON.parse(await fs.readFile(path.join(sourceDir, "manifest.json"), "utf8"));
const filenames = (await fs.readdir(sourceDir))
  .filter((filename) => filename.endsWith(".json") && filename !== "manifest.json")
  .sort((left, right) => left.localeCompare(right));
const hash = createHash("sha256");
const readCanonicalJson = async (filename) => {
  const contents = await fs.readFile(path.join(sourceDir, filename), "utf8");
  return contents.replace(/\r\n?/g, "\n");
};

for (const filename of filenames) {
  hash.update(filename);
  hash.update("\0");
  hash.update(await readCanonicalJson(filename));
  hash.update("\0");
}

const contentHash = `sha256:${hash.digest("hex")}`;
const characters = JSON.parse(await fs.readFile(path.join(sourceDir, "characters.json"), "utf8"));
const errors = [];
const supportedSchemaVersions = new Set([1, 2]);

if (!supportedSchemaVersions.has(manifest.schemaVersion)) {
  errors.push(`Unsupported schemaVersion ${manifest.schemaVersion}.`);
}
if (!/^[0-9a-f]{40}(?:-dirty)?$/.test(manifest.sourceCommit ?? "")) {
  errors.push("sourceCommit must be a full Git SHA, optionally suffixed with -dirty.");
}
if (manifest.contentHash !== contentHash) {
  errors.push(`contentHash mismatch: expected ${contentHash}, received ${manifest.contentHash}.`);
}
if (manifest.rosterCount !== characters.characters?.length) {
  errors.push(`rosterCount mismatch: expected ${characters.characters?.length}, received ${manifest.rosterCount}.`);
}
if (Number.isNaN(Date.parse(manifest.generatedAt))) errors.push("generatedAt is not a valid timestamp.");

if (errors.length) {
  errors.forEach((error) => console.error(`Error: ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Validated data manifest ${manifest.contentHash} for ${manifest.rosterCount} characters.`);
}
