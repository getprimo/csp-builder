import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileCode,
  Search,
  Shield,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkCompatibility } from "@/lib/admx/compatibility";
import type { AdmxFile, PolicyDefinition } from "@/lib/admx/types";
import {
  useAdmxStore,
  policyKey,
  cspKey,
} from "@/store/useAdmxStore";
import { cn } from "@/lib/utils";
import { cspAreas } from "@/lib/csp-native/catalog";
import type { CspSetting } from "@/lib/csp-native/types";

interface AdmxEntry {
  kind: "admx";
  policy: PolicyDefinition;
  ingestable: boolean;
  reasons: string[];
}

interface CspEntry {
  kind: "csp";
  setting: CspSetting;
}

interface AdmxGroup {
  kind: "admx";
  id: string;
  title: string;
  file: AdmxFile;
  entries: AdmxEntry[];
  totalCount: number;
  compatCount: number;
  excludedCount: number;
}

interface CspGroup {
  kind: "csp";
  id: string;
  title: string;
  entries: CspEntry[];
  totalCount: number;
}

type Group = AdmxGroup | CspGroup;

export function PolicyList() {
  const files = useAdmxStore((s) => s.files);
  const configured = useAdmxStore((s) => s.configured);
  const configuredCsp = useAdmxStore((s) => s.configuredCsp);
  const selectPolicy = useAdmxStore((s) => s.selectPolicy);
  const selectCsp = useAdmxStore((s) => s.selectCsp);
  const selectedKey = useAdmxStore((s) => s.selectedKey);
  const [query, setQuery] = useState("");
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [showCsp, setShowCsp] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const admxGroups: AdmxGroup[] = useMemo(() => {
    return files.map((f) => {
      const entries: AdmxEntry[] = f.policies.map((p) => {
        const compat = checkCompatibility(p);
        return {
          kind: "admx",
          policy: p,
          ingestable: compat.ingestable,
          reasons: compat.reasons,
        };
      });
      const compatCount = entries.filter((e) => e.ingestable).length;
      return {
        kind: "admx",
        id: `admx::${f.id}`,
        title: f.appName || f.admxFileName,
        file: f,
        entries,
        totalCount: entries.length,
        compatCount,
        excludedCount: entries.length - compatCount,
      };
    });
  }, [files]);

  const cspGroups: CspGroup[] = useMemo(() => {
    return cspAreas().map(({ area, settings }) => ({
      kind: "csp" as const,
      id: `csp::${area}`,
      title: area,
      totalCount: settings.length,
      entries: settings.map((s) => ({ kind: "csp" as const, setting: s })),
    }));
  }, []);

  const allGroups: Group[] = useMemo(
    () => [...admxGroups, ...(showCsp ? cspGroups : [])],
    [admxGroups, cspGroups, showCsp]
  );

  const q = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return allGroups.map((g) => {
      if (g.kind === "admx") {
        const visible = g.entries.filter((e) => {
          if (!showIncompatible && !e.ingestable) return false;
          if (!q) return true;
          return (
            e.policy.name.toLowerCase().includes(q) ||
            (e.policy.displayName ?? "").toLowerCase().includes(q)
          );
        });
        return { ...g, visibleEntries: visible };
      }
      const visible = g.entries.filter((e) => {
        if (!q) return true;
        return (
          e.setting.name.toLowerCase().includes(q) ||
          e.setting.area.toLowerCase().includes(q) ||
          e.setting.id.toLowerCase().includes(q) ||
          (e.setting.description ?? "").toLowerCase().includes(q)
        );
      });
      return { ...g, visibleEntries: visible };
    });
  }, [allGroups, q, showIncompatible]);

  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const admxTotals = admxGroups.reduce(
    (acc, g) => {
      acc.compat += g.compatCount;
      acc.excluded += g.excludedCount;
      return acc;
    },
    { compat: 0, excluded: 0 }
  );
  const cspTotal = cspGroups.reduce((n, g) => n + g.totalCount, 0);
  const admxApplied = Object.values(configured).filter((c) => c.apply).length;
  const cspApplied = Object.values(configuredCsp).filter((c) => c.apply).length;
  const totalApplied = admxApplied + cspApplied;

  const admxAppliedPerGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const cfg of Object.values(configured)) {
      if (!cfg.apply) continue;
      m.set(cfg.admxId, (m.get(cfg.admxId) ?? 0) + 1);
    }
    return m;
  }, [configured]);

  const cspAppliedPerArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const cfg of Object.values(configuredCsp)) {
      if (!cfg.apply) continue;
      const area = cfg.settingId.split("/")[0];
      m.set(area, (m.get(area) ?? 0) + 1);
    }
    return m;
  }, [configuredCsp]);

  if (files.length === 0 && cspGroups.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
          <span>Policies</span>
          <div className="flex gap-2 flex-wrap">
            {totalApplied > 0 && (
              <Badge variant="success">{totalApplied} Applied</Badge>
            )}
            <Badge variant="outline">
              {admxTotals.compat} ADMX · {cspTotal} CSP
            </Badge>
            {admxTotals.excluded > 0 && (
              <Badge variant="destructive">
                {admxTotals.excluded} excluded
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name (ADMX + native CSP)…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-4 mb-2 text-sm text-muted-foreground">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showIncompatible}
              onChange={(e) => setShowIncompatible(e.target.checked)}
            />
            Show incompatible ADMX
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showCsp}
              onChange={(e) => setShowCsp(e.target.checked)}
            />
            Show native CSP areas ({cspGroups.length})
          </label>
        </div>

        <div className="max-h-[540px] overflow-y-auto rounded-md border">
          {filteredGroups.map((g) => {
            const isOpen = expanded.has(g.id);
            const visibleCount = g.visibleEntries.length;
            if (q && visibleCount === 0) return null;

            const countLabel =
              g.kind === "admx" && showIncompatible
                ? `${visibleCount}/${g.totalCount}`
                : `${visibleCount}`;

            const appliedInGroup =
              g.kind === "admx"
                ? admxAppliedPerGroup.get(g.file.id) ?? 0
                : cspAppliedPerArea.get(g.title) ?? 0;

            return (
              <div key={g.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left bg-muted/30 hover:bg-muted/60 transition-colors sticky top-0"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      isOpen && "rotate-90"
                    )}
                  />
                  {g.kind === "admx" ? (
                    <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Shield className="h-4 w-4 shrink-0 text-blue-600" />
                  )}
                  <span className="font-medium truncate flex-1">
                    {g.title}
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    {countLabel}
                  </Badge>
                  {appliedInGroup > 0 && (
                    <Badge variant="success" className="text-[11px]">
                      {appliedInGroup} Applied
                    </Badge>
                  )}
                </button>

                {isOpen && (
                  <div className="divide-y">
                    {visibleCount === 0 && (
                      <div className="px-4 py-2 text-xs text-muted-foreground">
                        No matching policy.
                      </div>
                    )}
                    {g.visibleEntries.map((e) =>
                      e.kind === "admx" ? (
                        <AdmxRow
                          key={policyKey(g.kind === "admx" ? g.file.id : "", e.policy.name)}
                          admxId={g.kind === "admx" ? g.file.id : ""}
                          entry={e}
                          selectedKey={selectedKey}
                          applied={
                            !!configured[
                              policyKey(
                                g.kind === "admx" ? g.file.id : "",
                                e.policy.name
                              )
                            ]?.apply
                          }
                          onSelect={() =>
                            e.ingestable &&
                            g.kind === "admx" &&
                            selectPolicy(g.file.id, e.policy.name)
                          }
                        />
                      ) : (
                        <CspRow
                          key={cspKey(e.setting.id)}
                          entry={e}
                          selectedKey={selectedKey}
                          applied={!!configuredCsp[e.setting.id]?.apply}
                          onSelect={() => selectCsp(e.setting.id)}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {q &&
            filteredGroups.every((g) => g.visibleEntries.length === 0) && (
              <div className="p-4 text-sm text-muted-foreground">
                No policy matches the search.
              </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
}

interface AdmxRowProps {
  admxId: string;
  entry: AdmxEntry;
  selectedKey: string | undefined;
  applied: boolean;
  onSelect(): void;
}

function AdmxRow({ admxId, entry, selectedKey, applied, onSelect }: AdmxRowProps) {
  const key = policyKey(admxId, entry.policy.name);
  const isSelected = key === selectedKey;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2 pl-9 hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent",
        !entry.ingestable && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        {entry.ingestable ? (
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {entry.policy.displayName || entry.policy.name}
            </span>
            {applied && (
              <Badge variant="success" className="text-[10px]">
                Apply
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {entry.policy.name} ·{" "}
            <span className="font-mono">{entry.policy.class}</span>
          </div>
          {!entry.ingestable && (
            <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
              {entry.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </button>
  );
}

interface CspRowProps {
  entry: CspEntry;
  selectedKey: string | undefined;
  applied: boolean;
  onSelect(): void;
}

function CspRow({ entry, selectedKey, applied, onSelect }: CspRowProps) {
  const key = cspKey(entry.setting.id);
  const isSelected = key === selectedKey;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2 pl-9 hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent"
      )}
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {entry.setting.name}
            </span>
            {applied && (
              <Badge variant="success" className="text-[10px]">
                Apply
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {entry.setting.id} ·{" "}
            <span className="font-mono">{entry.setting.format}</span>
            {" · "}
            <span className="font-mono">{entry.setting.scope}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
