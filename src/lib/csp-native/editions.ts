/**
 * Windows edition allow-list helpers.
 *
 * Microsoft's DDFv2 files carry an `<MSFT:Applicability>` block on every leaf
 * Policy CSP node, containing a `<MSFT:EditionAllowList>` with a semicolon-
 * separated list of hex SKU codes (e.g. `0x4;0x30;0x79` → Enterprise + Pro +
 * Education). These are the same PRODUCT_* constants documented for the Win32
 * `GetProductInfo` function; the MDM-specific DDF schema additionally uses
 * `0x88*` to denote "Windows Holographic for Business".
 *
 * We keep the raw codes on the setting so advanced users can copy them, and
 * expose a grouped summary so the UI can display something compact like
 * "Pro · Enterprise · Education · IoT Enterprise".
 */

/** Broad grouping used for the compact UI summary. */
export type EditionFamily =
  | "Home"
  | "Pro"
  | "Enterprise"
  | "Education"
  | "Enterprise LTSC"
  | "IoT Enterprise"
  | "Multi-session"
  | "HoloLens"
  | "Team"
  | "Other";

interface EditionInfo {
  /** Short human name (e.g. "Pro", "Enterprise N"). */
  label: string;
  /** Broad family used for the compact summary. */
  family: EditionFamily;
}

/**
 * Hex code → edition metadata. Sources:
 *   - Win32 GetProductInfo docs (sysinfoapi.h)
 *   - DDFv2 MSFT schema (`0x88*` = Holographic for Business)
 *   - PRODUCT_ENTERPRISE_G / _G_N are documented in the Windows SDK headers
 *     even though the public GetProductInfo page omits them.
 *
 * Codes we don't recognise fall through to a bare hex label in the "Other"
 * family so nothing is silently dropped.
 */
const EDITION_MAP: Record<string, EditionInfo> = {
  "0x4":  { label: "Enterprise", family: "Enterprise" },
  "0x1b": { label: "Enterprise N", family: "Enterprise" },
  "0x30": { label: "Pro", family: "Pro" },
  "0x31": { label: "Pro N", family: "Pro" },
  "0x45": { label: "Pro E", family: "Pro" },
  "0x46": { label: "Enterprise E", family: "Enterprise" },
  "0x48": { label: "Enterprise Evaluation", family: "Enterprise" },
  "0x54": { label: "Enterprise N Evaluation", family: "Enterprise" },
  "0x62": { label: "Home N", family: "Home" },
  "0x63": { label: "Home China", family: "Home" },
  "0x64": { label: "Home Single Language", family: "Home" },
  "0x65": { label: "Home", family: "Home" },
  "0x77": { label: "Team (Surface Hub)", family: "Team" },
  "0x79": { label: "Education", family: "Education" },
  "0x7a": { label: "Education N", family: "Education" },
  "0x7d": { label: "Enterprise LTSC", family: "Enterprise LTSC" },
  "0x7e": { label: "Enterprise LTSC N", family: "Enterprise LTSC" },
  "0x81": { label: "Enterprise LTSB Evaluation", family: "Enterprise LTSC" },
  "0x82": { label: "Enterprise LTSB N Evaluation", family: "Enterprise LTSC" },
  "0x85": { label: "Mobile Enterprise", family: "Enterprise" },
  "0x87": { label: "HoloLens", family: "HoloLens" },
  "0x88": { label: "HoloLens Business", family: "HoloLens" },
  "0x88*": { label: "HoloLens Business", family: "HoloLens" },
  "0x8a": { label: "Pro Single Language", family: "Pro" },
  "0x8b": { label: "Pro China", family: "Pro" },
  "0xa1": { label: "Pro for Workstations", family: "Pro" },
  "0xa2": { label: "Pro for Workstations N", family: "Pro" },
  "0xa4": { label: "Pro Education", family: "Pro" },
  "0xa5": { label: "Pro Education N", family: "Pro" },
  "0xab": { label: "Enterprise G", family: "Enterprise" },
  "0xac": { label: "Enterprise G N", family: "Enterprise" },
  "0xaf": { label: "Enterprise multi-session", family: "Multi-session" },
  "0xb4": { label: "Cloud", family: "Other" },
  "0xbc": { label: "IoT Enterprise", family: "IoT Enterprise" },
  "0xbd": { label: "Windows 11 SE", family: "Education" },
  "0xbf": { label: "IoT Enterprise LTSC", family: "IoT Enterprise" },
  "0xca": { label: "IoT Enterprise S", family: "IoT Enterprise" },
  "0xcb": { label: "IoT Enterprise Subscription", family: "IoT Enterprise" },
  "0xcd": { label: "Enterprise Subscription", family: "Enterprise" },
  "0xcf": { label: "Enterprise Subscription N", family: "Enterprise" },
  "0xd2": { label: "IoT Enterprise Virtual", family: "IoT Enterprise" },
};

/** Display order used in the compact summary. */
const FAMILY_ORDER: EditionFamily[] = [
  "Pro",
  "Enterprise",
  "Education",
  "Home",
  "Enterprise LTSC",
  "Multi-session",
  "IoT Enterprise",
  "HoloLens",
  "Team",
  "Other",
];

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

export function lookupEdition(code: string): EditionInfo {
  const k = normalizeCode(code);
  return (
    EDITION_MAP[k] ?? {
      label: code.trim(),
      family: "Other",
    }
  );
}

export interface EditionSummary {
  /** Ordered list of families present in the allow-list. */
  families: EditionFamily[];
  /** Full list of resolved `{code,label,family}` for tooltip / detail views. */
  editions: { code: string; label: string; family: EditionFamily }[];
  /** Whether Home (any Home SKU) is in the allow-list. */
  homeSupported: boolean;
}

/**
 * Turn a raw code list into a de-duplicated, ordered summary. Families with
 * no matching edition are dropped; "Other" is surfaced last so unrecognised
 * codes remain visible.
 */
export function summarizeEditions(codes: string[] | undefined): EditionSummary | undefined {
  if (!codes || codes.length === 0) return undefined;
  const families = new Set<EditionFamily>();
  const editions: EditionSummary["editions"] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    const code = raw.trim();
    if (!code) continue;
    const key = normalizeCode(code);
    if (seen.has(key)) continue;
    seen.add(key);
    const info = lookupEdition(code);
    families.add(info.family);
    editions.push({ code, label: info.label, family: info.family });
  }
  if (editions.length === 0) return undefined;
  const orderedFamilies = FAMILY_ORDER.filter((f) => families.has(f));
  return {
    families: orderedFamilies,
    editions,
    homeSupported: families.has("Home"),
  };
}
