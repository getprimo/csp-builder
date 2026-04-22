#!/usr/bin/env node
/**
 * Refresh the pre-filled ADMX samples from their upstream sources.
 *
 * Called monthly by .github/workflows/refresh-samples.yml (or on-demand via
 * `npm run refresh:samples`). Downloads the latest policy_templates archive
 * for a curated set of applications, extracts just the ADMX + en-US ADML,
 * normalises UTF-16 → UTF-8, and writes to src/samples/<id>/.
 *
 * The workflow then detects any git diff and opens a PR with the refreshed
 * files for review.
 *
 * Scoped to sources with a **stable automated URL** (GitHub releases, direct
 * CDN links, aka.ms redirects). Office / Acrobat / OneDrive / Edge ship via
 * paths that need extra tooling (CAB extraction, HTML scraping, Microsoft
 * download gates) — those are refreshed manually.
 */
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SAMPLES_DIR = join(ROOT, "src", "samples");
const TMP = "/tmp/csp-builder-refresh";

// ─── helpers ─────────────────────────────────────────────────────────────────

function sh(cmd, opts = {}) {
  execSync(cmd, { stdio: opts.silent ? "pipe" : "inherit", ...opts });
}

function freshTmp(id) {
  const dir = join(TMP, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSampleFile(id, relPath, buf) {
  const target = join(SAMPLES_DIR, id, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
}

function copyInto(id, relPath, srcPath) {
  const target = join(SAMPLES_DIR, id, relPath);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(srcPath, target);
}

function detectUtf16Le(buf) {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
}

function ensureUtf8(id, relPath) {
  const p = join(SAMPLES_DIR, id, relPath);
  const buf = readFileSync(p);
  if (!detectUtf16Le(buf)) return;
  const text = buf.toString("utf16le").replace(/^\uFEFF/, "");
  writeFileSync(p, text, "utf8");
}

async function ghLatestAsset(repo, predicate) {
  const json = JSON.parse(
    execSync(`gh api repos/${repo}/releases/latest`, { stdio: ["ignore", "pipe", "pipe"] }).toString()
  );
  const asset = json.assets.find(predicate);
  if (!asset) {
    throw new Error(`No matching asset in ${repo} latest release`);
  }
  return { url: asset.browser_download_url, tag: json.tag_name, name: asset.name };
}

async function download(url, outPath) {
  sh(`curl -sL -o "${outPath}" "${url}"`);
}

function unzipSelect(zipPath, selector, destDir) {
  mkdirSync(destDir, { recursive: true });
  sh(`unzip -q -o -j "${zipPath}" '${selector}' -d "${destDir}"`);
}

// ─── samples ─────────────────────────────────────────────────────────────────

/** @type {Array<{id:string,label:string,refresh:()=>Promise<void>}>} */
const SAMPLES = [
  {
    id: "chrome",
    label: "Google Chrome",
    async refresh() {
      const tmp = freshTmp("chrome");
      const zip = join(tmp, "chrome.zip");
      await download(
        "https://dl.google.com/dl/edgedl/chrome/policy/policy_templates.zip",
        zip
      );
      unzipSelect(zip, "windows/admx/chrome.admx", tmp);
      unzipSelect(zip, "windows/admx/en-US/chrome.adml", join(tmp, "en-US"));
      copyInto("chrome", "chrome.admx", join(tmp, "chrome.admx"));
      copyInto("chrome", "en-US/chrome.adml", join(tmp, "en-US", "chrome.adml"));
      ensureUtf8("chrome", "chrome.admx");
      ensureUtf8("chrome", "en-US/chrome.adml");
    },
  },
  {
    id: "firefox",
    label: "Mozilla Firefox",
    async refresh() {
      const { url, tag } = await ghLatestAsset(
        "mozilla/policy-templates",
        (a) => /policy_templates/i.test(a.name) && a.name.endsWith(".zip")
      );
      console.log(`  firefox: ${tag}`);
      const tmp = freshTmp("firefox");
      const zip = join(tmp, "firefox.zip");
      await download(url, zip);
      // Firefox zip layout: windows/firefox.admx + windows/en-US/firefox.adml
      unzipSelect(zip, "windows/firefox.admx", tmp);
      unzipSelect(zip, "windows/en-US/firefox.adml", join(tmp, "en-US"));
      copyInto("firefox", "firefox.admx", join(tmp, "firefox.admx"));
      copyInto(
        "firefox",
        "en-US/firefox.adml",
        join(tmp, "en-US", "firefox.adml")
      );
      ensureUtf8("firefox", "firefox.admx");
      ensureUtf8("firefox", "en-US/firefox.adml");
    },
  },
  {
    id: "brave",
    label: "Brave Browser",
    async refresh() {
      const { url, tag } = await ghLatestAsset(
        "brave/brave-browser",
        (a) => a.name === "policy_templates.zip"
      );
      console.log(`  brave: ${tag}`);
      const tmp = freshTmp("brave");
      const zip = join(tmp, "brave.zip");
      await download(url, zip);
      unzipSelect(zip, "windows/admx/brave.admx", tmp);
      unzipSelect(zip, "windows/admx/en-US/brave.adml", join(tmp, "en-US"));
      copyInto("brave", "brave.admx", join(tmp, "brave.admx"));
      copyInto("brave", "en-US/brave.adml", join(tmp, "en-US", "brave.adml"));
      ensureUtf8("brave", "brave.admx");
      ensureUtf8("brave", "en-US/brave.adml");
    },
  },
  {
    id: "winget",
    label: "Windows Package Manager",
    async refresh() {
      const { url, tag } = await ghLatestAsset(
        "microsoft/winget-cli",
        (a) => a.name === "DesktopAppInstallerPolicies.zip"
      );
      console.log(`  winget: ${tag}`);
      const tmp = freshTmp("winget");
      const zip = join(tmp, "winget.zip");
      await download(url, zip);
      unzipSelect(zip, "admx/DesktopAppInstaller.admx", tmp);
      unzipSelect(zip, "admx/en-US/DesktopAppInstaller.adml", join(tmp, "en-US"));
      copyInto(
        "winget",
        "DesktopAppInstaller.admx",
        join(tmp, "DesktopAppInstaller.admx")
      );
      copyInto(
        "winget",
        "en-US/DesktopAppInstaller.adml",
        join(tmp, "en-US", "DesktopAppInstaller.adml")
      );
      ensureUtf8("winget", "DesktopAppInstaller.admx");
      ensureUtf8("winget", "en-US/DesktopAppInstaller.adml");
    },
  },
  {
    id: "fslogix",
    label: "Microsoft FSLogix",
    async refresh() {
      const tmp = freshTmp("fslogix");
      const zip = join(tmp, "fslogix.zip");
      await download("https://aka.ms/fslogix/download", zip);
      unzipSelect(zip, "fslogix.admx", tmp);
      unzipSelect(zip, "fslogix.adml", tmp);
      copyInto("fslogix", "fslogix.admx", join(tmp, "fslogix.admx"));
      copyInto("fslogix", "en-US/fslogix.adml", join(tmp, "fslogix.adml"));
      ensureUtf8("fslogix", "fslogix.admx");
      ensureUtf8("fslogix", "en-US/fslogix.adml");
    },
  },
];

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const failed = [];
  let refreshed = 0;

  for (const s of SAMPLES) {
    if (only.length > 0 && !only.includes(s.id)) continue;
    try {
      console.log(`Refreshing ${s.id} (${s.label}) …`);
      await s.refresh();
      refreshed++;
    } catch (e) {
      console.error(`  ✗ ${s.id}: ${e.message}`);
      failed.push(s.id);
    }
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`\nDone: ${refreshed} refreshed, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
