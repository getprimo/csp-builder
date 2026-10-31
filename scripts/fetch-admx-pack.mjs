#!/usr/bin/env node
/**
 * Fetch the Windows PolicyDefinitions used to enrich the CSP catalog with
 * ADMX element schemas: Microsoft's official Administrative Templates pack,
 * pinned in scripts/sources.mjs (ADMX_PACK).
 *
 * Downloads the MSI, extracts it with `msiextract` (msitools: `apt-get install
 * msitools` on a runner, `brew install msitools` on a Mac), and copies the
 * ADMX + en-US ADML files into scripts/admx-windows/ (gitignored).
 *
 *   npm run fetch:admx-pack
 *   npm run build:csp-catalog
 *
 * The resulting catalog.json is committed, so this script runs only when the
 * catalog is rebuilt — by the weekly workflow on a new DDF, or by hand.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMX_PACK } from "./sources.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "admx-windows");
const EN_US_OUT = join(OUT_DIR, "en-US");

/** The first `PolicyDefinitions` directory under `dir`, wherever the MSI's own layout puts it. */
function findPolicyDefinitions(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name);
    if (entry.name.toLowerCase() === "policydefinitions") return path;
    const found = findPolicyDefinitions(path);
    if (found) return found;
  }
  return undefined;
}

function copyAll(from, to, extension) {
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const f of readdirSync(from)) {
    if (!f.toLowerCase().endsWith(extension)) continue;
    copyFileSync(join(from, f), join(to, f));
    count++;
  }
  return count;
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "admx-pack-"));
  try {
    console.log(`Downloading ${ADMX_PACK.name} ...`);
    const response = await fetch(ADMX_PACK.url);
    if (!response.ok) throw new Error(`${ADMX_PACK.url}: HTTP ${response.status}`);
    const msi = join(tmp, "pack.msi");
    writeFileSync(msi, Buffer.from(await response.arrayBuffer()));

    console.log("Extracting with msiextract ...");
    const extracted = join(tmp, "extracted");
    mkdirSync(extracted);
    execFileSync("msiextract", ["-C", extracted, msi], { stdio: ["ignore", "ignore", "inherit"] });

    const policyDefs = findPolicyDefinitions(extracted);
    if (!policyDefs) throw new Error("No PolicyDefinitions directory in the MSI");
    const enUs = readdirSync(policyDefs).find((d) => d.toLowerCase() === "en-us");
    if (!enUs) throw new Error(`No en-US directory in ${policyDefs}`);

    rmSync(OUT_DIR, { recursive: true, force: true });
    const admxCount = copyAll(policyDefs, OUT_DIR, ".admx");
    const admlCount = copyAll(join(policyDefs, enUs), EN_US_OUT, ".adml");
    if (admxCount === 0 || admlCount === 0) throw new Error(`Empty pack: ${admxCount} ADMX, ${admlCount} ADML`);

    console.log(`Done: ${admxCount} ADMX + ${admlCount} en-US ADML → ${OUT_DIR}`);
    console.log("Next: npm run build:csp-catalog");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (!existsSync(join(__dirname, "..", "package.json"))) throw new Error("Run from the csp-builder checkout");
await main();
