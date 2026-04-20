#!/usr/bin/env node
/**
 * Parse Microsoft's Policy CSP DDF zip into a compact JSON catalog.
 *
 * Input:  scripts/csp-ddf/DDFv2Feb2026.zip  (committed source)
 * Output: src/lib/csp-native/catalog.json
 *
 * The DDF zip contains one *.xml per CSP area (e.g. `AboveLock_AreaDDF.xml`,
 * `ADMX_Bits_AreaDDF.xml`). We keep only the Policy CSP trees — those whose
 * top-level Path is `./Device/Vendor/MSFT/Policy/Config` or
 * `./User/Vendor/MSFT/Policy/Config` — and flatten each leaf Setting into a
 * minimal shape the runtime code consumes.
 *
 * Run manually after refreshing the zip: `npm run build:csp-catalog`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import AdmZip from "adm-zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ZIP = join(ROOT, "scripts", "csp-ddf", "DDFv2Feb2026.zip");
const OUT = join(ROOT, "src", "lib", "csp-native", "catalog.json");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  allowBooleanAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
  isArray: (name) => name === "Node" || name === "Enum",
});

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(n) {
  if (n == null) return undefined;
  if (typeof n === "string") return n.trim() || undefined;
  if (typeof n === "object") {
    if (typeof n["#text"] === "string") return n["#text"].trim() || undefined;
    if (typeof n["#text"] === "number") return String(n["#text"]);
  }
  return undefined;
}

function detectFormat(dfFormat) {
  if (!dfFormat || typeof dfFormat !== "object") return "chr";
  for (const k of [
    "bool",
    "int",
    "chr",
    "xml",
    "b64",
    "bin",
    "node",
    "null",
    "date",
    "time",
    "float",
  ]) {
    if (k in dfFormat) return k;
  }
  return "chr";
}

function parseAllowedValues(av) {
  if (!av || typeof av !== "object") return undefined;
  const valueType = av["@_ValueType"];
  if (valueType === "ENUM") {
    const items = asArray(av.Enum).map((e) => ({
      value: textOf(e.Value) ?? "",
      description: textOf(e.ValueDescription) ?? "",
    }));
    return { kind: "enum", items };
  }
  if (valueType === "Range") {
    const raw = textOf(av.Value) ?? "";
    // Common forms: "[0-4294967295]", "[1-999]", "0-100", "1-50, 100"
    const m = /^\[?\s*(-?\d+)\s*-\s*(-?\d+)\s*\]?$/.exec(raw);
    if (m) {
      return { kind: "range", min: Number(m[1]), max: Number(m[2]) };
    }
    return { kind: "range", raw };
  }
  if (valueType === "RegEx") {
    return { kind: "regex", pattern: textOf(av.Value) ?? "" };
  }
  if (valueType === "ADMX") {
    return { kind: "admx-backed" };
  }
  return { kind: "other", raw: valueType ?? "unknown" };
}

function looseBuild(applicability) {
  if (!applicability || typeof applicability !== "object") return undefined;
  const osBuild = textOf(applicability.OsBuildVersion);
  const cspVersion = textOf(applicability.CspVersion);
  if (!osBuild && !cspVersion) return undefined;
  const out = {};
  if (osBuild) out.osBuild = osBuild;
  if (cspVersion) out.cspVersion = cspVersion;
  return out;
}

/**
 * Walk the DDF node tree, accumulating settings.
 * @param {object} node         DDF Node element (fxp shape)
 * @param {string[]} uriParts   Path parts accumulated so far (e.g. ["./Device/Vendor/MSFT/Policy/Config", "AboveLock"])
 * @param {string[]} areaChain  Area/category chain for display (excluding Policy/Config stem)
 * @param {Function} emit       Called for each leaf setting
 */
function walk(node, uriParts, areaChain, emit) {
  if (!node) return;
  const nodeName = textOf(node.NodeName) ?? "";
  const nextUri = [...uriParts, nodeName];
  const nextArea = [...areaChain, nodeName];

  const children = asArray(node.Node);
  const props = node.DFProperties ?? {};
  const format = detectFormat(props.DFFormat);

  if (children.length > 0) {
    // Internal node (group). Recurse without emitting.
    for (const c of children) walk(c, nextUri, nextArea, emit);
    return;
  }

  // Leaf. Emit only if we're inside Policy/Config — walker enforces that.
  if (format === "node") return; // Skip non-leaf nodes accidentally flagged as leaves

  const locUri = nextUri.join("/");
  emit({
    uri: locUri,
    pathSegments: nextUri,
    areaChain: nextArea,
    name: nodeName,
    format,
    description: textOf(props.Description),
    defaultValue: textOf(props.DefaultValue),
    allowed: parseAllowedValues(props.AllowedValues),
    applicability: looseBuild(props.Applicability),
    deprecated: props.Deprecated !== undefined,
    osBuildDeprecated:
      props.Deprecated?.["@_OsBuildDeprecated"] ?? undefined,
  });
}

function normalizeTopPath(p) {
  if (!p) return "";
  return p.trim().replace(/\\/g, "/");
}

function combine(a, b) {
  if (!a.format) return b;
  if (!b.format) return a;
  if (a.format === b.format) return a;
  // Fallback: whichever came first.
  return a;
}

function main() {
  console.log(`Reading DDF zip: ${ZIP}`);
  const zip = new AdmZip(ZIP);
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith(".xml"));
  console.log(`Found ${entries.length} XML files in zip.`);

  /** @type {Map<string, any>} */
  const byId = new Map();

  let totalTopNodes = 0;
  let policyTopNodes = 0;

  for (const entry of entries) {
    let xml = entry.getData().toString("utf8");
    // Strip the DOCTYPE declaration — fast-xml-parser's strict mode rejects
    // the OMA-DM public/system identifiers.
    xml = xml.replace(/<!DOCTYPE[\s\S]*?>\s*/m, "");
    let doc;
    try {
      doc = parser.parse(xml);
    } catch (e) {
      console.warn(`Skipping unparseable ${entry.entryName}: ${e.message}`);
      continue;
    }
    const root = doc?.MgmtTree;
    if (!root) continue;
    const tops = asArray(root.Node);
    for (const top of tops) {
      totalTopNodes++;
      const topPath = normalizeTopPath(textOf(top.Path));
      const areaName = textOf(top.NodeName) ?? "";
      let scope;
      if (topPath === "./Device/Vendor/MSFT/Policy/Config") scope = "Device";
      else if (topPath === "./User/Vendor/MSFT/Policy/Config") scope = "User";
      else continue; // Skip non-Policy trees (BitLocker, WiFi, Defender root nodes, etc.)
      policyTopNodes++;

      walk(top, [topPath], [], (leaf) => {
        // leaf.pathSegments starts with topPath (./Device/... or ./User/...).
        // The "bare id" drops that prefix so Both-scope entries merge.
        const bareId = leaf.pathSegments.slice(1).join("/");
        const existing = byId.get(bareId);
        if (existing) {
          existing.scope = "Both";
          if (!existing.description && leaf.description)
            existing.description = leaf.description;
          byId.set(bareId, existing);
        } else {
          byId.set(bareId, {
            id: bareId,
            area: areaName,
            name: leaf.name,
            path: leaf.pathSegments.slice(1),
            scope,
            format: leaf.format,
            description: leaf.description,
            defaultValue: leaf.defaultValue,
            allowed: leaf.allowed,
            applicability: leaf.applicability,
            deprecated: leaf.deprecated || undefined,
            osBuildDeprecated: leaf.osBuildDeprecated,
          });
        }
        void combine;
      });
    }
  }

  const settings = [...byId.values()].sort((a, b) => {
    if (a.area !== b.area) return a.area.localeCompare(b.area);
    return a.name.localeCompare(b.name);
  });

  // Strip descriptions below a minimum threshold? — keep full for now.
  const catalog = {
    generatedAt: new Date().toISOString(),
    source: "Microsoft DDFv2 Feb 2026 (Windows 11 26H2)",
    settingCount: settings.length,
    settings,
  };

  writeFileSync(OUT, JSON.stringify(catalog, null, 0) + "\n", "utf8");
  const bytes = Buffer.byteLength(JSON.stringify(catalog));
  console.log(`Wrote ${settings.length} settings to ${OUT} (${(bytes / 1024).toFixed(0)} KB).`);
  console.log(`Top-level nodes scanned: ${totalTopNodes}, Policy-rooted: ${policyTopNodes}.`);
  const areas = new Set(settings.map((s) => s.area));
  console.log(`Areas: ${areas.size}`);
}

main();
