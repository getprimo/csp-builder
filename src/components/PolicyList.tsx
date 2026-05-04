import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
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

type LeafEntry = AdmxEntry | CspEntry;

interface TreeNode {
  /** Display name for this folder level (empty for root). */
  name: string;
  /** Full folder path below the group root. */
  path: string[];
  children: Map<string, TreeNode>;
  leaves: LeafEntry[];
}

interface AdmxGroup {
  kind: "admx";
  id: string;
  title: string;
  file: AdmxFile;
  root: TreeNode;
  totalCount: number;
  compatCount: number;
  excludedCount: number;
}

interface CspGroup {
  kind: "csp";
  id: string;
  title: string;
  root: TreeNode;
  totalCount: number;
}

type Group = AdmxGroup | CspGroup;

function createNode(name: string, path: string[]): TreeNode {
  return { name, path, children: new Map(), leaves: [] };
}

function ensureChild(parent: TreeNode, segment: string): TreeNode {
  let child = parent.children.get(segment);
  if (!child) {
    child = createNode(segment, [...parent.path, segment]);
    parent.children.set(segment, child);
  }
  return child;
}

/** Walk a folder path array, inserting intermediate nodes as needed. */
function navigate(root: TreeNode, folderPath: string[]): TreeNode {
  let cur = root;
  for (const seg of folderPath) {
    cur = ensureChild(cur, seg || "<instance>");
  }
  return cur;
}

function countLeaves(node: TreeNode): number {
  let n = node.leaves.length;
  for (const c of node.children.values()) n += countLeaves(c);
  return n;
}

/** Clone a tree keeping only leaves that pass the predicate + non-empty folders. */
function filterTree(
  node: TreeNode,
  keep: (leaf: LeafEntry) => boolean
): TreeNode | null {
  const filtered: TreeNode = {
    name: node.name,
    path: node.path,
    children: new Map(),
    leaves: node.leaves.filter(keep),
  };
  for (const [k, child] of node.children) {
    const sub = filterTree(child, keep);
    if (sub) filtered.children.set(k, sub);
  }
  if (filtered.leaves.length === 0 && filtered.children.size === 0) return null;
  return filtered;
}

export function PolicyList() {
  const { t } = useTranslation();
  const files = useAdmxStore((s) => s.files);
  const configured = useAdmxStore((s) => s.configured);
  const configuredCsp = useAdmxStore((s) => s.configuredCsp);
  const selectPolicy = useAdmxStore((s) => s.selectPolicy);
  const selectCsp = useAdmxStore((s) => s.selectCsp);
  const selectedKey = useAdmxStore((s) => s.selectedKey);
  const cspCatalogEnabled = useAdmxStore((s) => s.cspCatalogEnabled);
  const onlyApplied = useAdmxStore((s) => s.onlyApplied);
  const setOnlyApplied = useAdmxStore((s) => s.setOnlyApplied);
  const [query, setQuery] = useState("");
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const admxGroups: AdmxGroup[] = useMemo(() => {
    return files.map((f) => {
      const root = createNode("", []);
      let compatCount = 0;
      for (const p of f.policies) {
        const compat = checkCompatibility(p);
        if (compat.ingestable) compatCount++;
        const entry: AdmxEntry = {
          kind: "admx",
          policy: p,
          ingestable: compat.ingestable,
          reasons: compat.reasons,
        };
        const folderPath = p.categoryPath ?? [];
        navigate(root, folderPath).leaves.push(entry);
      }
      return {
        kind: "admx" as const,
        id: `admx::${f.id}`,
        title: f.appName || f.admxFileName,
        file: f,
        root,
        totalCount: f.policies.length,
        compatCount,
        excludedCount: f.policies.length - compatCount,
      };
    });
  }, [files]);

  const cspGroups: CspGroup[] = useMemo(() => {
    return cspAreas().map(({ area, settings }) => {
      const root = createNode("", []);
      for (const s of settings) {
        // path = [area, ...subnodes, leafName]. The area is already the group
        // title, so nest only on the subnodes between area and leaf.
        const folderPath = s.path.slice(1, -1);
        navigate(root, folderPath).leaves.push({ kind: "csp", setting: s });
      }
      return {
        kind: "csp" as const,
        id: `csp::${area}`,
        title: area,
        root,
        totalCount: settings.length,
      };
    });
  }, []);

  const allGroups: Group[] = useMemo(
    () => [...admxGroups, ...(cspCatalogEnabled ? cspGroups : [])],
    [admxGroups, cspGroups, cspCatalogEnabled]
  );

  const q = query.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return allGroups
      .map((g) => {
        const keep = (e: LeafEntry): boolean => {
          if (e.kind === "admx") {
            if (!showIncompatible && !e.ingestable) return false;
            if (onlyApplied) {
              const fileIdForGroup = g.kind === "admx" ? g.file.id : "";
              const cfg =
                configured[policyKey(fileIdForGroup, e.policy.name)];
              if (!cfg?.apply) return false;
            }
            if (!q) return true;
            return (
              e.policy.name.toLowerCase().includes(q) ||
              (e.policy.displayName ?? "").toLowerCase().includes(q) ||
              (e.policy.categoryPath ?? [])
                .join(" ")
                .toLowerCase()
                .includes(q)
            );
          }
          if (onlyApplied) {
            const cfg = configuredCsp[e.setting.id];
            if (!cfg?.apply) return false;
          }
          if (!q) return true;
          return (
            e.setting.name.toLowerCase().includes(q) ||
            e.setting.area.toLowerCase().includes(q) ||
            e.setting.id.toLowerCase().includes(q) ||
            (e.setting.description ?? "").toLowerCase().includes(q)
          );
        };
        const filteredRoot = filterTree(g.root, keep);
        return { ...g, filteredRoot };
      })
      .filter((g) => !!g.filteredRoot) as Array<
      Group & { filteredRoot: TreeNode }
    >;
  }, [allGroups, q, showIncompatible, onlyApplied, configured, configuredCsp]);

  const toggleNode = (id: string) =>
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
      const key = cfg.settingId.replace(/^std::/, "");
      const area = key.split("/")[0];
      m.set(area, (m.get(area) ?? 0) + 1);
    }
    return m;
  }, [configuredCsp]);

  // Expand every folder automatically when searching or when the "Only
  // applied" filter is on, so matches/applied items are visible without
  // having to hand-expand the tree.
  const effectiveExpanded = useMemo(() => {
    if (!q && !onlyApplied) return expanded;
    const all = new Set(expanded);
    const addAll = (gid: string, node: TreeNode) => {
      all.add(gid);
      for (const [seg, child] of node.children) {
        const childId = `${gid}::${child.path.join("/")}`;
        all.add(childId);
        addAll(childId, child);
        void seg;
      }
    };
    for (const g of filteredGroups) addAll(g.id, g.filteredRoot);
    return all;
  }, [expanded, q, onlyApplied, filteredGroups]);

  if (files.length === 0 && cspGroups.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
          <span>{t("policyList.title")}</span>
          <div className="flex gap-2 flex-wrap">
            {totalApplied > 0 && (
              <Badge variant="success">
                {t("policyList.applied", { count: totalApplied })}
              </Badge>
            )}
            <Badge variant="outline">
              {t("policyList.stats", {
                admx: admxTotals.compat,
                csp: cspTotal,
              })}
            </Badge>
            {admxTotals.excluded > 0 && (
              <Badge variant="destructive">
                {t("policyList.excluded", { count: admxTotals.excluded })}
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
            placeholder={t("policyList.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-4 mb-2 text-sm text-muted-foreground">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyApplied}
              onChange={(e) => setOnlyApplied(e.target.checked)}
            />
            {t("policyList.onlyApplied", { count: totalApplied })}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showIncompatible}
              onChange={(e) => setShowIncompatible(e.target.checked)}
            />
            {t("policyList.showIncompatible")}
          </label>
        </div>

        <div className="max-h-[540px] overflow-y-auto rounded-md border">
          {filteredGroups.map((g) => {
            const isOpen = effectiveExpanded.has(g.id);
            const visibleCount = countLeaves(g.filteredRoot);
            if (q && visibleCount === 0) return null;

            // When "Show incompatible" is on, the left number must still be
            // the *compatible* count — not the total — otherwise incompatible
            // entries inflate the number and the chip becomes misleading.
            // The right number (post-slash) shows the total so users can see
            // the ratio at a glance. Under search, the left number is the
            // matched count (compatible matches only when showIncompatible is
            // off, all matches when it's on).
            const countLabel = (() => {
              if (g.kind !== "admx") return `${visibleCount}`;
              if (!showIncompatible) return `${visibleCount}`;
              if (q) return `${visibleCount}/${g.totalCount}`;
              return `${g.compatCount}/${g.totalCount}`;
            })();

            const appliedInGroup =
              g.kind === "admx"
                ? admxAppliedPerGroup.get(g.file.id) ?? 0
                : cspAppliedPerArea.get(g.title) ?? 0;

            return (
              <div key={g.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleNode(g.id)}
                  className="sticky top-0 z-20 w-full flex items-center gap-2 px-3 py-2 text-left bg-card hover:bg-muted transition-colors border-b"
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
                      {t("policyList.applied", { count: appliedInGroup })}
                    </Badge>
                  )}
                </button>

                {isOpen && (
                  <TreeRenderer
                    group={g}
                    node={g.filteredRoot}
                    depth={1}
                    expanded={effectiveExpanded}
                    toggle={toggleNode}
                    selectedKey={selectedKey}
                    configured={configured}
                    configuredCsp={configuredCsp}
                    onSelectAdmx={(admxId, policyName) =>
                      selectPolicy(admxId, policyName)
                    }
                    onSelectCsp={(id) => selectCsp(id)}
                  />
                )}
              </div>
            );
          })}
          {q && filteredGroups.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              {t("policyList.noMatches")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TreeRendererProps {
  group: Group & { filteredRoot: TreeNode };
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle(id: string): void;
  selectedKey: string | undefined;
  configured: Record<string, { apply: boolean }>;
  configuredCsp: Record<string, { apply: boolean }>;
  onSelectAdmx(admxId: string, policyName: string): void;
  onSelectCsp(id: string): void;
}

function TreeRenderer({
  group,
  node,
  depth,
  expanded,
  toggle,
  selectedKey,
  configured,
  configuredCsp,
  onSelectAdmx,
  onSelectCsp,
}: TreeRendererProps) {
  // Render sub-folders first (sorted alphabetically), then leaves.
  const folders = [...node.children.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const leaves = [...node.leaves].sort((a, b) => {
    const an =
      a.kind === "admx"
        ? a.policy.displayName || a.policy.name
        : a.setting.name;
    const bn =
      b.kind === "admx"
        ? b.policy.displayName || b.policy.name
        : b.setting.name;
    return an.localeCompare(bn);
  });

  return (
    <>
      {folders.map((child) => {
        const id = `${group.id}::${child.path.join("/")}`;
        const isOpen = expanded.has(id);
        const count = countLeaves(child);
        return (
          <div key={id}>
            <button
              type="button"
              onClick={() => toggle(id)}
              className="w-full flex items-center gap-2 py-1.5 pr-3 text-left text-sm hover:bg-muted/60 transition-colors"
              style={{ paddingLeft: `${12 + depth * 14}px` }}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform text-muted-foreground",
                  isOpen && "rotate-90"
                )}
              />
              {isOpen ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              )}
              <span className="truncate flex-1">{child.name}</span>
              <Badge variant="outline" className="text-[10px]">
                {count}
              </Badge>
            </button>
            {isOpen && (
              <TreeRenderer
                group={group}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                selectedKey={selectedKey}
                configured={configured}
                configuredCsp={configuredCsp}
                onSelectAdmx={onSelectAdmx}
                onSelectCsp={onSelectCsp}
              />
            )}
          </div>
        );
      })}
      {leaves.map((e, i) =>
        e.kind === "admx" ? (
          <AdmxRow
            key={`${group.id}::leaf::${e.policy.name}::${i}`}
            admxId={group.kind === "admx" ? group.file.id : ""}
            entry={e}
            selectedKey={selectedKey}
            applied={
              !!configured[
                policyKey(
                  group.kind === "admx" ? group.file.id : "",
                  e.policy.name
                )
              ]?.apply
            }
            depth={depth}
            onSelect={() =>
              e.ingestable &&
              group.kind === "admx" &&
              onSelectAdmx(group.file.id, e.policy.name)
            }
          />
        ) : (
          <CspRow
            key={`${group.id}::leaf::${e.setting.id}::${i}`}
            entry={e}
            selectedKey={selectedKey}
            applied={!!configuredCsp[e.setting.id]?.apply}
            depth={depth}
            onSelect={() => onSelectCsp(e.setting.id)}
          />
        )
      )}
    </>
  );
}

interface AdmxRowProps {
  admxId: string;
  entry: AdmxEntry;
  selectedKey: string | undefined;
  applied: boolean;
  depth: number;
  onSelect(): void;
}

function AdmxRow({
  admxId,
  entry,
  selectedKey,
  applied,
  depth,
  onSelect,
}: AdmxRowProps) {
  const { t } = useTranslation();
  const key = policyKey(admxId, entry.policy.name);
  const isSelected = key === selectedKey;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left py-2 pr-3 hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent",
        !entry.ingestable && "cursor-not-allowed opacity-60"
      )}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
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
                {t("policyList.applyBadge")}
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
  depth: number;
  onSelect(): void;
}

function CspRow({
  entry,
  selectedKey,
  applied,
  depth,
  onSelect,
}: CspRowProps) {
  const { t } = useTranslation();
  const key = cspKey(entry.setting.id);
  const isSelected = key === selectedKey;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left py-2 pr-3 hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent"
      )}
      style={{ paddingLeft: `${12 + depth * 14}px` }}
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
                {t("policyList.applyBadge")}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {entry.setting.id.replace(/^std::/, "")} ·{" "}
            <span className="font-mono">{entry.setting.format}</span>
            {" · "}
            <span className="font-mono">{entry.setting.scope}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
