#!/usr/bin/env node
/**
 * Keep scripts/csp-ddf/ on Microsoft's latest DDF zip.
 *
 * Reads the Microsoft page listing the DDF releases, takes the first DDF v2
 * zip it links, and compares its file name with the one zip committed under
 * scripts/csp-ddf/. A different name is a new release: the zip is downloaded
 * and replaces the old one. The same name is a no-op.
 *
 *   npm run fetch:ddf
 *
 * Under GitHub Actions ($GITHUB_OUTPUT set), writes `changed=true|false` and
 * `zip=<file name>` for the steps that follow.
 */
import { appendFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DDF_PAGE } from "./sources.mjs";

const DDF_DIR = join(dirname(fileURLToPath(import.meta.url)), "csp-ddf");

/** The one committed zip; the build reads it the same way. */
export function committedDdfZip() {
  const zips = readdirSync(DDF_DIR).filter((f) => f.endsWith(".zip"));
  if (zips.length !== 1) {
    throw new Error(`scripts/csp-ddf/ holds ${zips.length} zip(s); exactly one DDF zip is expected`);
  }
  return zips[0];
}

function latestDdfLink(html) {
  const match = html.match(/href="(https:\/\/download\.microsoft\.com\/[^"]*\/(DDFv2[^"/]*\.zip))"/);
  if (!match) throw new Error(`No DDF v2 zip link found on ${DDF_PAGE}`);
  return { url: match[1], name: match[2] };
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  for (const [key, value] of Object.entries(values)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

async function main() {
  const current = committedDdfZip();
  const page = await fetch(DDF_PAGE, { headers: { "user-agent": "csp-builder fetch-ddf" } });
  if (!page.ok) throw new Error(`${DDF_PAGE}: HTTP ${page.status}`);
  const latest = latestDdfLink(await page.text());

  if (latest.name === current) {
    console.log(`DDF up to date: ${current}`);
    output({ changed: "false", zip: current });
    return;
  }

  console.log(`New DDF: ${latest.name} (committed: ${current}). Downloading ${latest.url} ...`);
  const zip = await fetch(latest.url);
  if (!zip.ok) throw new Error(`${latest.url}: HTTP ${zip.status}`);
  writeFileSync(join(DDF_DIR, latest.name), Buffer.from(await zip.arrayBuffer()));
  rmSync(join(DDF_DIR, current));
  console.log(`Replaced ${current} with ${latest.name}. Next: npm run fetch:admx-pack && npm run build:csp-catalog`);
  output({ changed: "true", zip: latest.name });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
