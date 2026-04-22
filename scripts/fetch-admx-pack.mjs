#!/usr/bin/env node
/**
 * Fetch the Windows PolicyDefinitions mirror used to enrich the CSP catalog
 * with ADMX element schemas.
 *
 * Source: https://github.com/jozefizso/sysvol-centralstore (community mirror
 * of the Windows ADMX PolicyDefinitions folder + en-US resources).
 *
 * Downloads the repo tarball, extracts just the ADMX + en-US ADML files into
 * scripts/admx-windows/, and cleans up. Run once after cloning, or whenever
 * you want to refresh the catalog:
 *
 *   npm run fetch:admx-pack
 *   npm run build:csp-catalog
 *
 * The resulting catalog.json is committed, so this script is only needed by
 * maintainers regenerating the schema (never by CI or end users).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "scripts", "admx-windows");
const EN_US_OUT = join(OUT_DIR, "en-US");
const TMP_TAR = "/tmp/sysvol-centralstore.tar.gz";
const TMP_EXTRACT = "/tmp/sysvol-centralstore-extract";
const TARBALL_URL =
  "https://github.com/jozefizso/sysvol-centralstore/archive/refs/heads/master.tar.gz";

function sh(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  console.log(`Downloading ${TARBALL_URL} ...`);
  sh(`curl -sL -o ${TMP_TAR} ${TARBALL_URL}`);

  console.log(`Extracting ...`);
  rmSync(TMP_EXTRACT, { recursive: true, force: true });
  mkdirSync(TMP_EXTRACT, { recursive: true });
  sh(`tar -xzf ${TMP_TAR} -C ${TMP_EXTRACT}`);

  const extractedDir = readdirSync(TMP_EXTRACT).find((d) =>
    d.startsWith("sysvol-centralstore-")
  );
  if (!extractedDir) throw new Error("Tarball layout unexpected — no sysvol-centralstore-* dir");
  const policyDefs = join(TMP_EXTRACT, extractedDir, "PolicyDefinitions");
  if (!existsSync(policyDefs)) throw new Error(`No PolicyDefinitions in ${policyDefs}`);

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(EN_US_OUT, { recursive: true });

  let admxCount = 0;
  let admlCount = 0;
  for (const f of readdirSync(policyDefs)) {
    if (f.toLowerCase().endsWith(".admx")) {
      copyFileSync(join(policyDefs, f), join(OUT_DIR, f));
      admxCount++;
    }
  }
  const enDir = join(policyDefs, "en-us");
  if (existsSync(enDir)) {
    for (const f of readdirSync(enDir)) {
      if (f.toLowerCase().endsWith(".adml")) {
        copyFileSync(join(enDir, f), join(EN_US_OUT, f));
        admlCount++;
      }
    }
  }

  rmSync(TMP_TAR, { force: true });
  rmSync(TMP_EXTRACT, { recursive: true, force: true });

  console.log(`Done: ${admxCount} ADMX + ${admlCount} en-US ADML → ${OUT_DIR}`);
  console.log(`Next: npm run build:csp-catalog`);
}

main();
