import type { ElementValue, PolicyScope } from "@/lib/admx/types";
import { xmlEscape } from "@/lib/csp/encoder";
import type {
  ConfiguredCsp,
  CspAdmxElement,
  CspSetting,
  CspValue,
} from "./types";

const POLICY_BASE_DEVICE = "./Device/Vendor/MSFT/Policy/Config";
const POLICY_BASE_USER = "./User/Vendor/MSFT/Policy/Config";
const STANDALONE_BASE_DEVICE = "./Device/Vendor/MSFT";
const STANDALONE_BASE_USER = "./User/Vendor/MSFT";

/**
 * Return the positions (in `setting.path`) of the parameterised segments
 * that need a user-supplied name. Each position maps 1:1 to an entry in
 * `ConfiguredCsp.instanceNames`.
 */
export function instanceSlots(
  setting: CspSetting
): Array<{ pathIndex: number; label: string; slotIndex: number }> {
  const slots: Array<{ pathIndex: number; label: string; slotIndex: number }> = [];
  let slotIndex = 0;
  for (let i = 0; i < setting.path.length; i++) {
    if (setting.path[i] !== "") continue;
    // Label heuristic: use the last non-empty segment before this slot.
    // e.g. "Profile/<instance>" → "Profile name", "Accounts/<instance>" → "Accounts name".
    let parent = "";
    for (let j = i - 1; j >= 0; j--) {
      if (setting.path[j]) {
        parent = setting.path[j];
        break;
      }
    }
    const label = parent ? `${parent} name` : `Instance ${slotIndex + 1}`;
    slots.push({ pathIndex: i, label, slotIndex });
    slotIndex++;
  }
  return slots;
}

export function cspLocUri(
  setting: CspSetting,
  scope: PolicyScope,
  instanceNames?: string[]
): string {
  const base =
    setting.family === "standalone"
      ? scope === "User"
        ? STANDALONE_BASE_USER
        : STANDALONE_BASE_DEVICE
      : scope === "User"
        ? POLICY_BASE_USER
        : POLICY_BASE_DEVICE;
  // Substitute parameterised segments with user-supplied names. Missing
  // values leave the segment empty — the resulting `//` URI is intentionally
  // visible so the user notices their profile name slot isn't filled.
  let slot = 0;
  const resolved = setting.path.map((seg) => {
    if (seg !== "") return seg;
    const name = instanceNames?.[slot];
    slot++;
    return name ?? "";
  });
  return `${base}/${resolved.join("/")}`;
}

/**
 * Produce the `<Format>` value and the already-XML-escaped `<Data>` content
 * for the given CSP value. Safe to drop straight into a SyncML `<Data>…</Data>`.
 */
export function cspDataPayload(
  value: CspValue | undefined,
  setting: CspSetting
): { format: string; data: string } {
  if (!value) return { format: setting.format, data: "" };

  switch (value.format) {
    case "bool":
      return { format: "bool", data: value.value ? "true" : "false" };
    case "int":
      return { format: "int", data: String(value.value) };
    case "chr":
      return { format: "chr", data: xmlEscape(value.value) };
    case "xml":
      return { format: "xml", data: xmlEscape(value.value) };
    case "b64":
      return { format: "b64", data: value.value };
  }
}

export function isAdmxBackedCsp(setting: CspSetting): boolean {
  return setting.allowed?.kind === "admx-backed";
}

/** An ADMX-backed CSP that also carries a structured element schema. */
export function hasAdmxSchema(
  setting: CspSetting
): setting is CspSetting & { admx: NonNullable<CspSetting["admx"]> } {
  return !!setting.admx && setting.admx.elements.length >= 0;
}

/** Default value for a single ADMX element, used to seed the store on first interaction. */
export function defaultAdmxElementValue(el: CspAdmxElement): ElementValue {
  switch (el.type) {
    case "boolean":
      return { type: "boolean", value: false };
    case "decimal":
      return { type: "decimal", value: el.minValue ?? 0 };
    case "text":
      return { type: "text", value: "" };
    case "multiText":
      return { type: "multiText", value: [] };
    case "enum":
      return { type: "enum", value: 0 };
    case "list":
      return { type: "list", value: [] };
  }
}

function attrEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Encode an ElementValue into the string that goes into the
 * `<data id="…" value="…"/>` attribute of an ADMX-backed CSP payload.
 */
function encodeAdmxElementValue(
  el: CspAdmxElement,
  v: ElementValue | undefined
): string {
  switch (el.type) {
    case "boolean": {
      const checked = v?.type === "boolean" ? v.value : false;
      return checked ? el.trueValue : el.falseValue;
    }
    case "decimal": {
      const n = v?.type === "decimal" ? v.value : (el.minValue ?? 0);
      return String(n);
    }
    case "text":
      return v?.type === "text" ? v.value : "";
    case "multiText": {
      const lines = v?.type === "multiText" ? v.value : [];
      return lines.join("\n");
    }
    case "enum": {
      const idx = v?.type === "enum" ? v.value : 0;
      const item = el.items[idx] ?? el.items[0];
      return item?.value ?? "";
    }
    case "list": {
      // List elements in ADMX-backed CSPs are rare; join with U+F000 like the
      // uploaded-ADMX encoder does. Users editing these today fall back to the
      // textarea path; this branch is here for completeness.
      const entries = v?.type === "list" ? v.value : [];
      const DELIM = "\uF000";
      if (el.explicitValue) {
        return entries.map((e) => `${e.name ?? ""}${DELIM}${e.data ?? ""}`).join(DELIM);
      }
      return entries.map((e) => e.name ?? "").join(DELIM);
    }
  }
}

/**
 * Build the SyncML command for an ADMX-backed CSP with a structured schema.
 * Returns:
 *   - { kind: "delete" }           when the policy is NotConfigured (emit `<Delete>`)
 *   - { kind: "replace", data: … } when Enabled or Disabled (emit `<Replace>` with chr data)
 *   - undefined                    when the configuration doesn't request anything
 */
export function buildCspAdmxCommand(
  setting: CspSetting,
  cfg: ConfiguredCsp | undefined
): { kind: "replace"; data: string } | { kind: "delete" } | undefined {
  if (!setting.admx) return undefined;
  const state = cfg?.admxState ?? "notConfigured";
  if (state === "notConfigured") return { kind: "delete" };
  if (state === "disabled") return { kind: "replace", data: "<disabled/>" };

  let inner = "<enabled/>";
  for (const el of setting.admx.elements) {
    const raw = encodeAdmxElementValue(el, cfg?.admxElements?.[el.id]);
    inner += `<data id="${attrEscape(el.id)}" value="${attrEscape(raw)}"/>`;
  }
  return { kind: "replace", data: inner };
}

export function defaultCspValue(setting: CspSetting): CspValue {
  if (isAdmxBackedCsp(setting)) {
    // ADMX-backed CSPs expect an <enabled/> or <disabled/> marker plus
    // optional <data id=… value=…/> children. Seed a sensible starting point
    // so users don't ship a raw value that Windows will reject.
    return { format: "chr", value: "<enabled/>" };
  }
  switch (setting.format) {
    case "bool":
      return { format: "bool", value: parseBoolDefault(setting.defaultValue) };
    case "int":
      return { format: "int", value: parseIntDefault(setting) };
    case "chr":
      return { format: "chr", value: setting.defaultValue ?? "" };
    case "xml":
      return { format: "xml", value: setting.defaultValue ?? "" };
    case "b64":
      return { format: "b64", value: setting.defaultValue ?? "" };
  }
}

function parseBoolDefault(raw: string | undefined): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return lower === "true" || lower === "1";
}

function parseIntDefault(setting: CspSetting): number {
  const raw = setting.defaultValue;
  if (raw !== undefined && raw !== null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  if (setting.allowed?.kind === "range") {
    const min = setting.allowed.min;
    if (typeof min === "number") return min;
  }
  return 0;
}
