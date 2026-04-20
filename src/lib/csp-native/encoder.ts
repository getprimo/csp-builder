import type { PolicyScope } from "@/lib/admx/types";
import { xmlEscape } from "@/lib/csp/encoder";
import type { CspSetting, CspValue } from "./types";

const POLICY_BASE_DEVICE = "./Device/Vendor/MSFT/Policy/Config";
const POLICY_BASE_USER = "./User/Vendor/MSFT/Policy/Config";

export function cspLocUri(setting: CspSetting, scope: PolicyScope): string {
  const base = scope === "User" ? POLICY_BASE_USER : POLICY_BASE_DEVICE;
  return `${base}/${setting.path.join("/")}`;
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

export function defaultCspValue(setting: CspSetting): CspValue {
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
