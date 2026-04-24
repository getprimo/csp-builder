import rawCatalog from "./catalog.json";
import type { CspCatalog, CspSetting } from "./types";

export const CSP_CATALOG: CspCatalog = rawCatalog as CspCatalog;

const byId = new Map<string, CspSetting>();
for (const s of CSP_CATALOG.settings) byId.set(s.id, s);

export function getCspSetting(id: string): CspSetting | undefined {
  return byId.get(id);
}

const byFamilyAndLength = new Map<string, CspSetting[]>();
for (const s of CSP_CATALOG.settings) {
  const key = `${s.family}:${s.path.length}`;
  const list = byFamilyAndLength.get(key);
  if (list) list.push(s);
  else byFamilyAndLength.set(key, [s]);
}

/**
 * Reverse lookup: given the raw path segments below the CSP root (after
 * stripping `./{Device,User}/Vendor/MSFT/(Policy/Config/)?`), find the setting
 * that matches and extract any parameterised `<instance>` names.
 */
export function findCspSettingByPath(
  segments: string[],
  family: "policy" | "standalone"
): { setting: CspSetting; instanceNames: string[] } | undefined {
  const candidates = byFamilyAndLength.get(`${family}:${segments.length}`);
  if (!candidates) return undefined;
  for (const s of candidates) {
    const instanceNames: string[] = [];
    let ok = true;
    for (let i = 0; i < s.path.length; i++) {
      const pathSeg = s.path[i];
      if (pathSeg === "") {
        instanceNames.push(segments[i]);
      } else if (pathSeg !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { setting: s, instanceNames };
  }
  return undefined;
}

export interface CspArea {
  area: string;
  settings: CspSetting[];
}

let areasCache: CspArea[] | undefined;

export function cspAreas(): CspArea[] {
  if (areasCache) return areasCache;
  const grouped = new Map<string, CspSetting[]>();
  for (const s of CSP_CATALOG.settings) {
    const list = grouped.get(s.area) ?? [];
    list.push(s);
    grouped.set(s.area, list);
  }
  areasCache = [...grouped.entries()]
    .map(([area, settings]) => ({ area, settings }))
    .sort((a, b) => a.area.localeCompare(b.area));
  return areasCache;
}
