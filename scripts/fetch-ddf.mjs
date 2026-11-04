#!/usr/bin/env node
/**
 * Keep scripts/csp-ddf/ on Microsoft's latest DDF zip.
 *
 * Reads the Microsoft page listing the DDF releases, takes the first DDF v2
 * zip it links, and compares it with the one zip committed under
 * scripts/csp-ddf/. A zip dated after the committed one (the date is in the
 * file name: DDFv2Feb2026, DDFv2Sept25) is a new release and replaces it; the
 * same name with other bytes is a republish and replaces it too; a zip dated
 * before the committed one is refused, so a reordered page never downgrades.
 *
 *   npm run fetch:ddf
 *
 * Under GitHub Actions ($GITHUB_OUTPUT set), writes `changed=true|false` and
 * `zip=<file name>` for the steps that follow.
 */
import { appendFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The month Microsoft wrote in the file name, as a sortable number: DDFv2Sept25 → 2025 * 12 + 8. */
export function ddfMonth(name) {
  const match = name.match(/^DDFv2([A-Za-z]+)(\d{2}|\d{4})\.zip$/);
  const month = match && MONTHS.indexOf(match[1].slice(0, 3).toLowerCase());
  if (!match || month < 0) throw new Error(`Cannot read a month and a year from the DDF file name ${name}`);
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  return year * 12 + month;
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
  if (ddfMonth(latest.name) < ddfMonth(current)) {
    throw new Error(`The page lists ${latest.name} first, older than the committed ${current}: not downgrading`);
  }

  const zip = await fetch(latest.url);
  if (!zip.ok) throw new Error(`${latest.url}: HTTP ${zip.status}`);
  const bytes = Buffer.from(await zip.arrayBuffer());
  if (latest.name === current && bytes.equals(readFileSync(join(DDF_DIR, current)))) {
    console.log(`DDF up to date: ${current}`);
    output({ changed: "false", zip: current });
    return;
  }

  const why = latest.name === current ? "republished under the same name" : `committed: ${current}`;
  writeFileSync(join(DDF_DIR, latest.name), bytes);
  if (latest.name !== current) rmSync(join(DDF_DIR, current));
  console.log(`New DDF: ${latest.name} (${why}). Next: npm run fetch:admx-pack && npm run build:csp-catalog`);
  output({ changed: "true", zip: latest.name });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
