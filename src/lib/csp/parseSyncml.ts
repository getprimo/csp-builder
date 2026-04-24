import { parseAdmx } from "@/lib/admx/parser";
import type {
  AdmxFile,
  ConfiguredPolicy,
  ElementValue,
  ListValue,
  PolicyElement,
  PolicyScope,
} from "@/lib/admx/types";
import type {
  ConfiguredCsp,
  CspAdmxElement,
  CspSetting,
  CspValue,
} from "@/lib/csp-native/types";
import { findCspSettingByPath } from "@/lib/csp-native/catalog";
import { defaultAdmxElementValue } from "@/lib/csp-native/encoder";

export interface ParsedSyncml {
  ingestedAdmx: AdmxFile[];
  configured: ConfiguredPolicy[];
  configuredCsp: ConfiguredCsp[];
  skipped: Array<{ locUri: string; reason: string }>;
}

export interface ParseOptions {
  /**
   * Called when an ADMX policy references an `appName` that isn't matched by
   * any file in `availableFiles` and wasn't ingested inline. Return a parsed
   * ADMX file (typically from the bundled samples) to auto-load it; return
   * undefined to leave the policy unresolved.
   */
  resolveSample?: (appName: string) => AdmxFile | undefined;
}

function uriSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9._~-]/g, "_");
}

function sanitizeAppName(name: string): string {
  return uriSafe(name.trim() || "App");
}

interface RawCommand {
  kind: "Replace" | "Delete";
  locUri: string;
  format?: string;
  data?: string;
}

function extractCommands(xml: string): RawCommand[] {
  // Strip any XML declaration and wrap in a synthetic root so the parser
  // accepts both full SyncML documents (single root) and fragment modes like
  // FleetDM's raw multi-root <Replace>/<Delete> output.
  const stripped = xml.replace(/^\s*<\?xml[^?]*\?>\s*/, "").trim();
  if (!stripped) return [];
  const wrapped = `<__cspb_root>${stripped}</__cspb_root>`;
  const doc = new DOMParser().parseFromString(wrapped, "application/xml");
  const parseErr = doc.getElementsByTagName("parsererror")[0];
  if (parseErr) {
    throw new Error(
      `Malformed SyncML XML: ${(parseErr.textContent ?? "").slice(0, 300)}`
    );
  }

  const out: RawCommand[] = [];
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (el.localName !== "Replace" && el.localName !== "Delete") continue;
    const locUri = firstDescendantText(el, "LocURI")?.trim();
    if (!locUri) continue;
    out.push({
      kind: el.localName as "Replace" | "Delete",
      locUri,
      format: firstDescendantText(el, "Format")?.trim() || undefined,
      data: firstDescendantText(el, "Data"),
    });
  }
  return out;
}

function firstDescendantText(
  root: Element,
  localName: string
): string | undefined {
  for (const el of Array.from(root.getElementsByTagName("*"))) {
    if (el.localName === localName) return el.textContent ?? "";
  }
  return undefined;
}

interface Classified {
  kind: "admxIngestion" | "admxPolicy" | "cspPolicy" | "cspStandalone";
  scope: PolicyScope;
  segments: string[];
}

function classify(locUri: string): Classified | undefined {
  const m = /^\.\/(Device|User)\/Vendor\/MSFT\/(.+)$/.exec(locUri);
  if (!m) return undefined;
  const scope = m[1] as PolicyScope;
  const rest = m[2];

  const ADMX_PREFIX = "Policy/ConfigOperations/ADMXInstall/";
  const CONFIG_PREFIX = "Policy/Config/";

  if (rest.startsWith(ADMX_PREFIX)) {
    return {
      kind: "admxIngestion",
      scope,
      segments: rest.slice(ADMX_PREFIX.length).split("/"),
    };
  }
  if (rest.startsWith(CONFIG_PREFIX)) {
    const segments = rest.slice(CONFIG_PREFIX.length).split("/");
    // ADMX policy URIs encode the area as "appName~Policy[~cat]"; native CSP
    // paths never contain "~" in any segment.
    const kind = segments[0]?.includes("~") ? "admxPolicy" : "cspPolicy";
    return { kind, scope, segments };
  }
  return { kind: "cspStandalone", scope, segments: rest.split("/") };
}

function decodePayload(
  data: string
): { kind: "enabled" | "disabled"; dataEls: Element[] } | undefined {
  const trimmed = data.trim();
  if (!trimmed) return undefined;
  const doc = new DOMParser().parseFromString(
    `<__cspb_p>${trimmed}</__cspb_p>`,
    "application/xml"
  );
  if (doc.getElementsByTagName("parsererror")[0]) return undefined;
  const root = doc.documentElement;
  const first = root.firstElementChild;
  if (!first) return undefined;
  if (first.localName === "disabled") return { kind: "disabled", dataEls: [] };
  if (first.localName !== "enabled") return undefined;
  const dataEls = Array.from(root.getElementsByTagName("data")).filter(
    (el) => el.localName === "data"
  );
  return { kind: "enabled", dataEls };
}

function decodeListValue(raw: string, explicit: boolean): ListValue {
  if (raw === "") return [];
  const DELIM = "\uF000";
  const parts = raw.split(DELIM);
  if (explicit) {
    const out: ListValue = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      out.push({ name: parts[i], data: parts[i + 1] });
    }
    if (parts.length % 2 === 1) out.push({ name: parts[parts.length - 1] });
    return out;
  }
  return parts.map((name) => ({ name }));
}

function decodeAdmxElement(
  el: PolicyElement,
  raw: string
): ElementValue | undefined {
  switch (el.type) {
    case "boolean":
      return { type: "boolean", value: raw === "1" };
    case "decimal": {
      const n = Number(raw);
      return { type: "decimal", value: Number.isFinite(n) ? n : 0 };
    }
    case "text":
      return { type: "text", value: raw };
    case "multiText":
      return { type: "multiText", value: raw === "" ? [] : raw.split("\n") };
    case "enum": {
      const idx = Number(raw);
      return { type: "enum", value: Number.isInteger(idx) && idx >= 0 ? idx : 0 };
    }
    case "list":
      return { type: "list", value: decodeListValue(raw, !!el.explicitValue) };
  }
}

function decodeCspAdmxElementValue(
  el: CspAdmxElement,
  raw: string
): ElementValue {
  switch (el.type) {
    case "boolean":
      if (raw === el.trueValue) return { type: "boolean", value: true };
      return { type: "boolean", value: false };
    case "decimal": {
      const n = Number(raw);
      return {
        type: "decimal",
        value: Number.isFinite(n) ? n : (el.minValue ?? 0),
      };
    }
    case "text":
      return { type: "text", value: raw };
    case "multiText":
      return { type: "multiText", value: raw === "" ? [] : raw.split("\n") };
    case "enum": {
      const idx = el.items.findIndex((it) => it.value === raw);
      return { type: "enum", value: idx >= 0 ? idx : 0 };
    }
    case "list":
      return { type: "list", value: decodeListValue(raw, !!el.explicitValue) };
  }
}

function decodeCspData(
  rawData: string | undefined,
  format: string | undefined,
  setting: CspSetting
): CspValue | undefined {
  if (rawData === undefined) return undefined;
  const fmt = format ?? setting.format;
  switch (fmt) {
    case "bool":
      return { format: "bool", value: rawData === "true" };
    case "int": {
      const n = Number(rawData);
      return { format: "int", value: Number.isFinite(n) ? n : 0 };
    }
    case "chr":
      return { format: "chr", value: rawData };
    case "xml":
      return { format: "xml", value: rawData };
    case "b64":
      return { format: "b64", value: rawData };
    default:
      return undefined;
  }
}

export function parseSyncmlToState(
  xml: string,
  availableFiles: AdmxFile[] = [],
  options: ParseOptions = {}
): ParsedSyncml {
  const { resolveSample } = options;
  const commands = extractCommands(xml);
  const skipped: Array<{ locUri: string; reason: string }> = [];
  const ingestedAdmx: AdmxFile[] = [];
  const configured: ConfiguredPolicy[] = [];
  const configuredCsp: ConfiguredCsp[] = [];

  // Two-pass: process ADMX ingestions first so subsequent policy commands can
  // resolve against newly-ingested files too.
  const ingestionCmds: Array<{ cmd: RawCommand; classified: Classified }> = [];
  const policyCmds: Array<{ cmd: RawCommand; classified: Classified }> = [];

  for (const cmd of commands) {
    const classified = classify(cmd.locUri);
    if (!classified) {
      skipped.push({ locUri: cmd.locUri, reason: "Unrecognized LocURI prefix" });
      continue;
    }
    if (classified.kind === "admxIngestion") {
      ingestionCmds.push({ cmd, classified });
    } else {
      policyCmds.push({ cmd, classified });
    }
  }

  // Dedupe ingested files against what the user already has loaded by using
  // targetPrefix+targetNamespace as the identity key (the ADMX's programming
  // identity). Files with the same identity overwrite each other in addFile,
  // so we keep the first and skip subsequent copies.
  const identityKey = (f: AdmxFile) => `${f.targetPrefix}::${f.targetNamespace}`;
  const knownByIdentity = new Map<string, AdmxFile>();
  for (const f of availableFiles) knownByIdentity.set(identityKey(f), f);

  for (const { cmd, classified } of ingestionCmds) {
    if (cmd.kind !== "Replace" || !cmd.data) continue;
    const [appName = "app", , uniqueId = "policy"] = classified.segments;
    const tentativeId = `url::${appName}::${uniqueId}`;
    try {
      const file = parseAdmx(cmd.data, undefined, {
        admxFileName: `${appName}.admx`,
        id: tentativeId,
      });
      const key = identityKey(file);
      if (knownByIdentity.has(key)) continue;
      knownByIdentity.set(key, file);
      ingestedAdmx.push(file);
    } catch (e) {
      skipped.push({
        locUri: cmd.locUri,
        reason: `Failed to parse ADMX ingestion: ${(e as Error).message}`,
      });
    }
  }

  const allFiles: AdmxFile[] = [...availableFiles, ...ingestedAdmx];
  const autoResolvedByAppName = new Map<string, AdmxFile | null>();

  const resolveByAppName = (appName: string): AdmxFile | undefined => {
    const direct = allFiles.find(
      (f) => sanitizeAppName(f.targetPrefix) === appName
    );
    if (direct) return direct;
    if (!resolveSample) return undefined;
    if (autoResolvedByAppName.has(appName)) {
      return autoResolvedByAppName.get(appName) ?? undefined;
    }
    const resolved = resolveSample(appName);
    autoResolvedByAppName.set(appName, resolved ?? null);
    if (!resolved) return undefined;
    const key = identityKey(resolved);
    if (knownByIdentity.has(key)) {
      return knownByIdentity.get(key)!;
    }
    knownByIdentity.set(key, resolved);
    ingestedAdmx.push(resolved);
    allFiles.push(resolved);
    return resolved;
  };

  for (const { cmd, classified } of policyCmds) {
    if (classified.kind === "admxPolicy") {
      if (classified.segments.length < 2) {
        skipped.push({ locUri: cmd.locUri, reason: "Malformed ADMX policy URI" });
        continue;
      }
      const area = classified.segments[0];
      const policyNameSafe =
        classified.segments[classified.segments.length - 1];
      const areaParts = area.split("~");
      if (areaParts.length < 2 || areaParts[1] !== "Policy") {
        skipped.push({
          locUri: cmd.locUri,
          reason: "ADMX area doesn't contain '~Policy~' marker",
        });
        continue;
      }
      const appName = areaParts[0];

      const file = resolveByAppName(appName);
      if (!file) {
        skipped.push({
          locUri: cmd.locUri,
          reason: `No ADMX file loaded for app '${appName}'`,
        });
        continue;
      }
      const policy = file.policies.find(
        (p) => uriSafe(p.name) === policyNameSafe
      );
      if (!policy) {
        skipped.push({
          locUri: cmd.locUri,
          reason: `Policy '${policyNameSafe}' not found in '${appName}'`,
        });
        continue;
      }

      if (cmd.kind === "Delete") {
        configured.push({
          admxId: file.id,
          policyName: policy.name,
          state: "notConfigured",
          scope: classified.scope,
          elements: {},
          apply: true,
        });
        continue;
      }

      const payload = decodePayload(cmd.data ?? "");
      if (!payload) {
        skipped.push({
          locUri: cmd.locUri,
          reason: "Unrecognized ADMX payload (expected <enabled/> or <disabled/>)",
        });
        continue;
      }
      const elements: Record<string, ElementValue> = {};
      if (payload.kind === "enabled") {
        const elById = new Map<string, PolicyElement>();
        for (const el of policy.elements) elById.set(el.id, el);
        for (const de of payload.dataEls) {
          const id = de.getAttribute("id");
          const value = de.getAttribute("value");
          if (!id || value == null) continue;
          const el = elById.get(id);
          if (!el) continue;
          const ev = decodeAdmxElement(el, value);
          if (ev) elements[id] = ev;
        }
      }
      configured.push({
        admxId: file.id,
        policyName: policy.name,
        state: payload.kind,
        scope: classified.scope,
        elements,
        apply: true,
      });
      continue;
    }

    // CSP (policy or standalone family)
    const family: "policy" | "standalone" =
      classified.kind === "cspPolicy" ? "policy" : "standalone";
    const match = findCspSettingByPath(classified.segments, family);
    if (!match) {
      skipped.push({
        locUri: cmd.locUri,
        reason: `No ${family} CSP setting matches path '${classified.segments.join(
          "/"
        )}'`,
      });
      continue;
    }
    const { setting, instanceNames } = match;
    const cfg: ConfiguredCsp = {
      settingId: setting.id,
      scope: classified.scope,
      apply: true,
    };
    if (instanceNames.length) cfg.instanceNames = instanceNames;

    if (setting.admx) {
      // Pre-seed admxElements with defaults so the editor has something to
      // render for every element; decoded values overlay on top.
      const admxElements: Record<string, ElementValue> = {};
      for (const el of setting.admx.elements) {
        admxElements[el.id] = defaultAdmxElementValue(el);
      }

      if (cmd.kind === "Delete") {
        cfg.admxState = "notConfigured";
        cfg.admxElements = admxElements;
        configuredCsp.push(cfg);
        continue;
      }

      const payload = decodePayload(cmd.data ?? "");
      if (!payload) {
        // Fallback: stash the raw string so the user can inspect it via the
        // chr-textarea path.
        cfg.value = { format: "chr", value: cmd.data ?? "" };
        configuredCsp.push(cfg);
        continue;
      }
      const elById = new Map<string, CspAdmxElement>();
      for (const el of setting.admx.elements) elById.set(el.id, el);
      for (const de of payload.dataEls) {
        const id = de.getAttribute("id");
        const value = de.getAttribute("value");
        if (!id || value == null) continue;
        const el = elById.get(id);
        if (!el) continue;
        admxElements[id] = decodeCspAdmxElementValue(el, value);
      }
      cfg.admxState = payload.kind;
      cfg.admxElements = admxElements;
      configuredCsp.push(cfg);
      continue;
    }

    if (cmd.kind === "Delete") {
      skipped.push({
        locUri: cmd.locUri,
        reason: "Delete on non-ADMX-backed CSP can't be represented in state",
      });
      continue;
    }
    const value = decodeCspData(cmd.data, cmd.format, setting);
    if (!value) {
      skipped.push({
        locUri: cmd.locUri,
        reason: `Couldn't decode CSP data (format='${cmd.format ?? setting.format}')`,
      });
      continue;
    }
    cfg.value = value;
    configuredCsp.push(cfg);
  }

  return { ingestedAdmx, configured, configuredCsp, skipped };
}
