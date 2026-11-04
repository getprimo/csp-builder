#!/usr/bin/env node
/**
 * The numbers a reviewer reads before merging a rebuilt catalog: settings,
 * areas, ADMX-backed settings with a schema attached, commands — and, with
 * `--base <git ref>`, the same numbers for the catalog committed at that ref
 * and the delta. A catalog that lost more than 5 % of its settings or of its
 * ADMX schemas fails: a DDF with a new layout parses to a short catalog with
 * nothing but a warning, and that must not reach a pull request.
 *
 *   node scripts/catalog-stats.mjs [--base HEAD]
 *
 * Under GitHub Actions ($GITHUB_OUTPUT set), writes `stats` as a markdown
 * table for the pull request body.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG = "src/lib/csp-native/catalog.json";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FLOOR = 0.95;

const isCommand = (s) =>
  s.accessType.includes("Exec") && !s.accessType.includes("Add") && !s.accessType.includes("Replace");

function statsOf(catalog) {
  const { settings } = catalog;
  return {
    settings: settings.length,
    areas: new Set(settings.map((s) => s.area)).size,
    admx: settings.filter((s) => s.admx).length,
    commands: settings.filter(isCommand).length,
  };
}

const base = process.argv.includes("--base") ? process.argv[process.argv.indexOf("--base") + 1] : undefined;
const current = statsOf(JSON.parse(readFileSync(join(ROOT, CATALOG), "utf8")));
const before = base
  ? statsOf(
      JSON.parse(
        execFileSync("git", ["show", `${base}:${CATALOG}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
      )
    )
  : undefined;

const rows = Object.keys(current).map((key) => {
  const delta = before ? current[key] - before[key] : 0;
  const shown = before ? `${before[key]} → ${current[key]} (${delta >= 0 ? "+" : ""}${delta})` : `${current[key]}`;
  return `| ${key} | ${shown} |`;
});
const table = ["| | count |", "| --- | --- |", ...rows].join("\n");
console.log(table);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `stats<<STATS\n${table}\nSTATS\n`);
}

if (before) {
  const shrunk = ["settings", "admx"].filter((key) => current[key] < before[key] * FLOOR);
  if (shrunk.length > 0) {
    console.error(`The rebuilt catalog lost more than ${100 - FLOOR * 100} % of its ${shrunk.join(" and ")}: not opening a pull request.`);
    process.exit(1);
  }
}
