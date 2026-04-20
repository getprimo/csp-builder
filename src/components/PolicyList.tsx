import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkCompatibility } from "@/lib/admx/compatibility";
import type { AdmxFile, PolicyDefinition } from "@/lib/admx/types";
import { useAdmxStore, policyKey } from "@/store/useAdmxStore";
import { cn } from "@/lib/utils";

interface Entry {
  policy: PolicyDefinition;
  ingestable: boolean;
  reasons: string[];
}

interface Group {
  file: AdmxFile;
  entries: Entry[];
  compatCount: number;
  excludedCount: number;
}

export function PolicyList() {
  const files = useAdmxStore((s) => s.files);
  const configured = useAdmxStore((s) => s.configured);
  const selectPolicy = useAdmxStore((s) => s.selectPolicy);
  const selectedKey = useAdmxStore((s) => s.selectedPolicyKey);
  const [query, setQuery] = useState("");
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const groups: Group[] = useMemo(() => {
    return files.map((f) => {
      const entries: Entry[] = f.policies.map((p) => {
        const compat = checkCompatibility(p);
        return {
          policy: p,
          ingestable: compat.ingestable,
          reasons: compat.reasons,
        };
      });
      const compatCount = entries.filter((e) => e.ingestable).length;
      return {
        file: f,
        entries,
        compatCount,
        excludedCount: entries.length - compatCount,
      };
    });
  }, [files]);

  const q = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return groups.map((g) => {
      const visible = g.entries.filter((e) => {
        if (!showIncompatible && !e.ingestable) return false;
        if (!q) return true;
        return (
          e.policy.name.toLowerCase().includes(q) ||
          (e.policy.displayName ?? "").toLowerCase().includes(q)
        );
      });
      return { ...g, visibleEntries: visible };
    });
  }, [groups, q, showIncompatible]);

  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalCompat = groups.reduce((n, g) => n + g.compatCount, 0);
  const totalExcluded = groups.reduce((n, g) => n + g.excludedCount, 0);
  const totalApplied = Object.values(configured).filter((c) => c.apply).length;

  const appliedPerGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const cfg of Object.values(configured)) {
      if (!cfg.apply) continue;
      m.set(cfg.admxId, (m.get(cfg.admxId) ?? 0) + 1);
    }
    return m;
  }, [configured]);

  if (files.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Policies</span>
          <div className="flex gap-2">
            {totalApplied > 0 && (
              <Badge variant="success">{totalApplied} Applied</Badge>
            )}
            <Badge variant="outline">{totalCompat} compatible</Badge>
            <Badge variant="destructive">{totalExcluded} excluded</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name (across all ADMX)…"
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm mb-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={showIncompatible}
            onChange={(e) => setShowIncompatible(e.target.checked)}
          />
          Show incompatible policies
        </label>

        <div className="max-h-[540px] overflow-y-auto rounded-md border">
          {filteredGroups.map((g) => {
            const isOpen = expanded.has(g.file.id);
            const visibleCount = g.visibleEntries.length;
            if (q && visibleCount === 0) return null;

            const countLabel = showIncompatible
              ? `${visibleCount}/${g.entries.length}`
              : `${visibleCount}`;

            return (
              <div key={g.file.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.file.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left bg-muted/30 hover:bg-muted/60 transition-colors sticky top-0"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      isOpen && "rotate-90"
                    )}
                  />
                  <span className="font-medium truncate flex-1">
                    {g.file.appName || g.file.admxFileName}
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    {countLabel}
                  </Badge>
                  {(() => {
                    const n = appliedPerGroup.get(g.file.id) ?? 0;
                    return n > 0 ? (
                      <Badge variant="success" className="text-[11px]">
                        {n} Applied
                      </Badge>
                    ) : null;
                  })()}
                </button>

                {isOpen && (
                  <div className="divide-y">
                    {visibleCount === 0 && (
                      <div className="px-4 py-2 text-xs text-muted-foreground">
                        No matching policy.
                      </div>
                    )}
                    {g.visibleEntries.map((e) => {
                      const key = policyKey(g.file.id, e.policy.name);
                      const isSelected = key === selectedKey;
                      const cfg = configured[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            e.ingestable &&
                            selectPolicy(g.file.id, e.policy.name)
                          }
                          className={cn(
                            "w-full text-left px-3 py-2 pl-9 hover:bg-accent/50 transition-colors",
                            isSelected && "bg-accent",
                            !e.ingestable && "cursor-not-allowed opacity-60"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {e.ingestable ? (
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">
                                  {e.policy.displayName || e.policy.name}
                                </span>
                                {cfg?.apply && (
                                  <Badge variant="success" className="text-[10px]">
                                    Apply
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {e.policy.name} ·{" "}
                                <span className="font-mono">{e.policy.class}</span>
                              </div>
                              {!e.ingestable && (
                                <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                                  {e.reasons.map((r, i) => (
                                    <li key={i}>{r}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {q && filteredGroups.every((g) => g.visibleEntries.length === 0) && (
            <div className="p-4 text-sm text-muted-foreground">
              No policy matches the search.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
