#!/usr/bin/env node
/**
 * Parse Microsoft's Policy CSP DDF zip into a compact JSON catalog.
 *
 * Input:
 *   - scripts/csp-ddf/DDFv2Feb2026.zip       (committed DDF source)
 *   - scripts/admx-windows/*.admx            (Windows PolicyDefinitions mirror)
 *   - scripts/admx-windows/en-US/*.adml      (English labels)
 *
 * Output: src/lib/csp-native/catalog.json
 *
 * The DDF zip contains one *.xml per CSP area. We keep only the Policy CSP
 * trees — those rooted at `./Device/Vendor/MSFT/Policy/Config` or
 * `./User/Vendor/MSFT/Policy/Config` — and flatten each leaf Setting.
 *
 * For settings whose AllowedValues is ADMX-backed, we additionally look up the
 * matching ADMX policy in the PolicyDefinitions mirror and attach the element
 * schema (types, labels, enum items, ranges) so the UI can render structured
 * editors instead of a raw textarea.
 *
 * Run manually after refreshing either input: `npm run build:csp-catalog`.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import AdmZip from "adm-zip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ZIP = join(ROOT, "scripts", "csp-ddf", "DDFv2Feb2026.zip");
const ADMX_DIR = join(ROOT, "scripts", "admx-windows");
const ADML_DIR = join(ADMX_DIR, "en-US");
const OUT = join(ROOT, "src", "lib", "csp-native", "catalog.json");

// ───────────────────────────────────────────────── DDF parser (CSP catalog) ─

const ddfParser = new XMLParser({
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

/**
 * Collapse the raw DDF format into the 5 formats the UI understands.
 * `node` leaves are already filtered by the walker; `null` format signals an
 * action-only node (Install/Enroll/Unenroll) with no data payload — those are
 * filtered out here. `bin` and `time` are remapped to the nearest usable
 * encoding (Base64 textarea / chr text input).
 */
function normalizeFormat(raw) {
  switch (raw) {
    case "bool":
    case "int":
    case "chr":
    case "xml":
    case "b64":
      return raw;
    case "bin":
      return "b64";
    case "time":
    case "date":
    case "float":
      return "chr";
    case "null":
    case "node":
      return null; // drop
    default:
      return "chr";
  }
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
 * A leaf is writable if its AccessType declares any of Add/Replace/Exec.
 * Get-only leaves (status readbacks) cannot be pushed via MDM and are skipped
 * from the catalog.
 */
function isWritableLeaf(props) {
  const at = props?.AccessType;
  if (!at || typeof at !== "object") return true; // default to writable if unspecified
  return "Add" in at || "Replace" in at || "Exec" in at;
}

function walk(node, uriParts, areaChain, emit) {
  if (!node) return;
  const nodeName = textOf(node.NodeName) ?? "";
  const nextUri = [...uriParts, nodeName];
  const nextArea = [...areaChain, nodeName];

  const children = asArray(node.Node);
  const props = node.DFProperties ?? {};
  const format = detectFormat(props.DFFormat);

  if (children.length > 0) {
    for (const c of children) walk(c, nextUri, nextArea, emit);
    return;
  }
  if (format === "node") return;
  if (!isWritableLeaf(props)) return;
  const uiFormat = normalizeFormat(format);
  if (!uiFormat) return; // drop actions / unknown formats

  const locUri = nextUri.join("/");
  emit({
    uri: locUri,
    pathSegments: nextUri,
    areaChain: nextArea,
    name: nodeName,
    format: uiFormat,
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

// ───────────────────────────────────────────── ADMX/ADML parser (elements) ─

const admxParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName, jPath) => {
    const collectionPaths = new Set([
      "policyDefinitions.policies.policy",
      "policyDefinitions.categories.category",
      "policyDefinitionResources.resources.stringTable.string",
      "policyDefinitionResources.resources.presentationTable.presentation",
    ]);
    if (collectionPaths.has(String(jPath))) return true;
    if (tagName === "item") return true;
    return false;
  },
});

function attr(n, k) {
  if (!n || typeof n !== "object") return undefined;
  const v = n[`@_${k}`];
  return v === undefined ? undefined : String(v);
}

function attrBool(n, k) {
  const v = attr(n, k);
  if (v === undefined) return undefined;
  return v === "true" || v === "1";
}

function attrNum(n, k) {
  const v = attr(n, k);
  if (v === undefined) return undefined;
  const num = Number(v);
  return Number.isFinite(num) ? num : undefined;
}

function resolveString(ref, strings) {
  if (!ref) return "";
  const m = /^\$\(string\.([^)]+)\)$/.exec(ref);
  if (!m) return ref;
  return strings[m[1]] ?? ref;
}

function parseAdml(admlText) {
  const doc = admxParser.parse(admlText);
  const root = doc.policyDefinitionResources;
  if (!root) return { strings: {}, presentations: {} };
  const strings = {};
  for (const s of asArray(root?.resources?.stringTable?.string)) {
    const id = attr(s, "id");
    if (!id) continue;
    strings[id] = textOf(s) ?? "";
  }
  const presentations = {};
  for (const p of asArray(root?.resources?.presentationTable?.presentation)) {
    const id = attr(p, "id");
    if (!id) continue;
    const labelByRefId = {};
    for (const [key, val] of Object.entries(p)) {
      if (key.startsWith("@_") || key === "#text") continue;
      for (const n of asArray(val)) {
        const refId = attr(n, "refId");
        if (!refId) continue;
        let lbl;
        if (typeof n === "object" && n !== null) {
          // <textBox><label>…</label></textBox>, <decimalTextBox><label>…</label></decimalTextBox>
          if (typeof n.label === "string") lbl = n.label;
          else if (typeof n.label === "object") lbl = textOf(n.label);
          // <dropdownList refId="…">Label text</dropdownList>,
          // <checkBox refId="…">Label text</checkBox>, etc.
          if (!lbl) lbl = textOf(n);
        } else if (typeof n === "string") {
          lbl = n;
        }
        // Strip trailing colons — ADMX convention, the UI already adds its own spacing.
        if (lbl) labelByRefId[refId] = lbl.trim().replace(/\s*:\s*$/, "");
      }
    }
    presentations[id] = labelByRefId;
  }
  return { strings, presentations };
}

function parseRegValue(node) {
  if (!node || typeof node !== "object") return undefined;
  if ("decimal" in node) {
    return { kind: "decimal", value: attrNum(node.decimal, "value") ?? 0 };
  }
  if ("longDecimal" in node) {
    return { kind: "longDecimal", value: attrNum(node.longDecimal, "value") ?? 0 };
  }
  if ("string" in node) {
    return { kind: "string", value: textOf(node.string) ?? "" };
  }
  if ("delete" in node) return { kind: "delete" };
  return undefined;
}

/** Convert a registry value into the string used in <data value="…"/>. */
function regValueToPayloadString(v) {
  if (!v) return "";
  if (v.kind === "string") return v.value;
  if (v.kind === "decimal" || v.kind === "longDecimal") return String(v.value);
  return "";
}

function parseElements(elementsNode, strings, presentationLabels) {
  if (!elementsNode || typeof elementsNode !== "object") return [];
  const out = [];
  for (const [tag, raw] of Object.entries(elementsNode)) {
    if (tag.startsWith("@_") || tag === "#text") continue;
    for (const n of asArray(raw)) {
      if (!n || typeof n !== "object") continue;
      const id = attr(n, "id");
      if (!id) continue;
      const label = presentationLabels[id];
      const base = { id, label: label || undefined, required: attrBool(n, "required") };
      switch (tag) {
        case "boolean": {
          out.push({
            ...base,
            type: "boolean",
            trueValue: regValueToPayloadString(parseRegValue(n.trueValue)) || "1",
            falseValue: regValueToPayloadString(parseRegValue(n.falseValue)) || "0",
          });
          break;
        }
        case "decimal":
        case "longDecimal": {
          out.push({
            ...base,
            type: "decimal",
            minValue: attrNum(n, "minValue"),
            maxValue: attrNum(n, "maxValue"),
          });
          break;
        }
        case "text": {
          // ADMX-backed CSPs never ship expandable text — MS filters those out
          // at the DDF level, so we don't mark them unsupported here.
          out.push({
            ...base,
            type: "text",
            maxLength: attrNum(n, "maxLength"),
          });
          break;
        }
        case "multiText": {
          out.push({ ...base, type: "multiText" });
          break;
        }
        case "enum": {
          const items = [];
          for (const it of asArray(n.item)) {
            if (!it || typeof it !== "object") continue;
            const displayRaw = attr(it, "displayName") ?? "";
            const val = parseRegValue(it.value);
            if (!val) continue;
            items.push({
              displayName: resolveString(displayRaw, strings),
              value: regValueToPayloadString(val),
            });
          }
          out.push({ ...base, type: "enum", items });
          break;
        }
        case "list": {
          out.push({
            ...base,
            type: "list",
            explicitValue: attrBool(n, "explicitValue"),
          });
          break;
        }
        default:
          break;
      }
    }
  }
  return out;
}

function loadAdmxArea(admxPath, admlPath) {
  const admxText = readFileSync(admxPath, "utf8");
  const admlText = admlPath && existsSync(admlPath)
    ? readFileSync(admlPath, "utf8")
    : "";
  const admxDoc = admxParser.parse(admxText);
  const root = admxDoc.policyDefinitions;
  if (!root) return new Map();
  const { strings, presentations } = parseAdml(admlText);
  const byName = new Map();
  for (const p of asArray(root?.policies?.policy)) {
    const name = attr(p, "name");
    if (!name) continue;
    const presRef = attr(p, "presentation");
    const presId = presRef
      ? /^\$\(presentation\.([^)]+)\)$/.exec(presRef)?.[1]
      : undefined;
    const presLabels = presId ? presentations[presId] ?? {} : {};
    const elements = parseElements(p.elements, strings, presLabels);
    const enabledValue = parseRegValue(p.enabledValue);
    const disabledValue = parseRegValue(p.disabledValue);
    byName.set(name, {
      elements,
      enabledValue,
      disabledValue,
      explainText: resolveString(attr(p, "explainText"), strings),
      displayName: resolveString(attr(p, "displayName"), strings),
    });
  }
  return byName;
}

function loadAllAdmx() {
  if (!existsSync(ADMX_DIR)) {
    console.warn(
      `ADMX folder ${ADMX_DIR} not found — admx-backed CSPs will fall back to textarea.`
    );
    return new Map();
  }
  const files = readdirSync(ADMX_DIR).filter((f) => f.toLowerCase().endsWith(".admx"));
  const byAdmxBase = new Map();
  for (const f of files) {
    const base = f.replace(/\.admx$/i, "");
    const admx = join(ADMX_DIR, f);
    const adml = join(ADML_DIR, `${base}.adml`);
    try {
      const policies = loadAdmxArea(admx, adml);
      byAdmxBase.set(base.toLowerCase(), { base, policies });
    } catch (e) {
      console.warn(`Failed to parse ${f}: ${e.message}`);
    }
  }
  return byAdmxBase;
}

/**
 * For a DDF area name like "ADMX_Desktop" or "ActiveXControls", find the
 * matching entry in the ADMX folder. We try the name as-is and stripped of
 * a leading "ADMX_" prefix, case-insensitive.
 */
function matchAdmxArea(ddfArea, byAdmxBase) {
  const candidates = [ddfArea];
  if (ddfArea.startsWith("ADMX_")) candidates.push(ddfArea.slice(5));
  for (const cand of candidates) {
    const hit = byAdmxBase.get(cand.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

// ──────────────────────────────────────────────────────────────────── main ─

function main() {
  console.log(`Reading DDF zip: ${ZIP}`);
  const zip = new AdmZip(ZIP);
  const entries = zip.getEntries().filter((e) => e.entryName.endsWith(".xml"));
  console.log(`Found ${entries.length} XML files in DDF zip.`);

  console.log(`Loading ADMX mirror from ${ADMX_DIR} ...`);
  const byAdmxBase = loadAllAdmx();
  console.log(`Parsed ${byAdmxBase.size} ADMX files.`);

  const byId = new Map();
  let totalTopNodes = 0;
  let policyTopNodes = 0;

  for (const entry of entries) {
    let xml = entry.getData().toString("utf8");
    xml = xml.replace(/<!DOCTYPE[\s\S]*?>\s*/m, "");
    let doc;
    try {
      doc = ddfParser.parse(xml);
    } catch (e) {
      console.warn(`Skipping unparseable ${entry.entryName}: ${e.message}`);
      continue;
    }
    const root = doc?.MgmtTree;
    if (!root) continue;
    for (const top of asArray(root.Node)) {
      totalTopNodes++;
      const topPath = normalizeTopPath(textOf(top.Path));
      const areaName = textOf(top.NodeName) ?? "";
      // Classify the top-level tree.
      //   family = "policy"       → `./{scope}/Vendor/MSFT/Policy/Config/<area>`
      //   family = "standalone"   → `./{scope}/Vendor/MSFT/<area>` (BitLocker, Personalization, WiFi, …)
      // scope   = Device | User | Both (for `./Vendor/MSFT` roots, Windows lets
      //          the caller pick the prefix, so we treat them as Both).
      let scope;
      let family;
      if (topPath === "./Device/Vendor/MSFT/Policy/Config") {
        scope = "Device";
        family = "policy";
      } else if (topPath === "./User/Vendor/MSFT/Policy/Config") {
        scope = "User";
        family = "policy";
      } else if (topPath === "./Device/Vendor/MSFT") {
        scope = "Device";
        family = "standalone";
      } else if (topPath === "./User/Vendor/MSFT") {
        scope = "User";
        family = "standalone";
      } else if (topPath === "./Vendor/MSFT" || topPath === "./Vendor/MSFT/") {
        scope = "Both";
        family = "standalone";
      } else {
        continue; // Root nodes we don't target (./, ./SyncML, etc.)
      }
      policyTopNodes++;

      walk(top, [topPath], [], (leaf) => {
        // For policy CSPs, id drops the `./…/Policy/Config` prefix so Device+User entries merge.
        // For standalone CSPs, id drops the `./{scope}/Vendor/MSFT` prefix with `std::` namespace
        // to avoid accidental collisions with same-named policy CSPs.
        const bareId =
          family === "policy"
            ? leaf.pathSegments.slice(1).join("/")
            : `std::${leaf.pathSegments.slice(1).join("/")}`;
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
            family,
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
      });
    }
  }

  // Pass 2: attach ADMX element schemas where available.
  let admxAttached = 0;
  let admxFallback = 0;
  for (const s of byId.values()) {
    if (s.allowed?.kind !== "admx-backed") continue;
    const admxArea = matchAdmxArea(s.area, byAdmxBase);
    if (!admxArea) {
      admxFallback++;
      continue;
    }
    const policy = admxArea.policies.get(s.name);
    if (!policy) {
      admxFallback++;
      continue;
    }
    s.admx = {
      elements: policy.elements,
      explainText: policy.explainText || undefined,
      displayName: policy.displayName || undefined,
    };
    // Prefer the ADMX explainText as the description if the DDF didn't carry one.
    if (!s.description && policy.explainText) {
      s.description = policy.explainText;
    }
    admxAttached++;
  }

  const settings = [...byId.values()].sort((a, b) => {
    if (a.area !== b.area) return a.area.localeCompare(b.area);
    return a.name.localeCompare(b.name);
  });

  const catalog = {
    generatedAt: new Date().toISOString(),
    source: "Microsoft DDFv2 Feb 2026 (Windows 11 26H2) + PolicyDefinitions (sysvol-centralstore)",
    settingCount: settings.length,
    settings,
  };

  writeFileSync(OUT, JSON.stringify(catalog, null, 0) + "\n", "utf8");
  const bytes = Buffer.byteLength(JSON.stringify(catalog));
  console.log(`Wrote ${settings.length} settings to ${OUT} (${(bytes / 1024).toFixed(0)} KB).`);
  console.log(
    `ADMX-backed: ${admxAttached} with element schema attached, ${admxFallback} fallback to textarea.`
  );
  console.log(`Top-level nodes scanned: ${totalTopNodes}, Policy-rooted: ${policyTopNodes}.`);
  const areas = new Set(settings.map((s) => s.area));
  console.log(`Areas: ${areas.size}`);
}

main();
