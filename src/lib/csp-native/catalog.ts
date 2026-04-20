import rawCatalog from "./catalog.json";
import type { CspCatalog, CspSetting } from "./types";

export const CSP_CATALOG: CspCatalog = rawCatalog as CspCatalog;

const byId = new Map<string, CspSetting>();
for (const s of CSP_CATALOG.settings) byId.set(s.id, s);

export function getCspSetting(id: string): CspSetting | undefined {
  return byId.get(id);
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
