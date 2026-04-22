import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  Shield,
  Trash2,
  FileCode,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseAdmx } from "@/lib/admx/parser";
import { useAdmxStore } from "@/store/useAdmxStore";
import { SAMPLES, type SampleBundle } from "@/lib/samples";
import { cn } from "@/lib/utils";

interface PendingPair {
  admx?: { name: string; content: string };
  adml?: { name: string; content: string };
}

async function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function sampleSize(s: SampleBundle): number {
  return (s.admxContent?.length ?? 0) + (s.admlContent?.length ?? 0);
}

function parseSample(s: SampleBundle) {
  return parseAdmx(s.admxContent, s.admlContent, {
    admxFileName: s.admxFileName,
    admlFileName: s.admlFileName,
    id: s.id,
  });
}

export function PolicySources() {
  const files = useAdmxStore((s) => s.files);
  const addFile = useAdmxStore((s) => s.addFile);
  const removeFile = useAdmxStore((s) => s.removeFile);
  const cspCatalogEnabled = useAdmxStore((s) => s.cspCatalogEnabled);
  const setCspCatalogEnabled = useAdmxStore((s) => s.setCspCatalogEnabled);
  const enabledSampleIds = useAdmxStore((s) => s.enabledSampleIds);
  const setEnabledSampleIds = useAdmxStore((s) => s.setEnabledSampleIds);

  const [pending, setPending] = useState<Record<string, PendingPair>>({});
  const [error, setError] = useState<string | undefined>();
  const [customOpen, setCustomOpen] = useState(false);

  // Re-hydrate persisted sample IDs into `files`. Depends on
  // enabledSampleIds so the effect re-runs once zustand/persist has
  // rehydrated the store (which happens asynchronously after the first
  // mount). Each run is idempotent thanks to the `loaded` lookup.
  useEffect(() => {
    const loaded = new Set(files.map((f) => f.id));
    for (const id of enabledSampleIds) {
      if (loaded.has(id)) continue;
      const s = SAMPLES.find((x) => x.id === id);
      if (!s) continue;
      try {
        addFile(parseSample(s));
      } catch (e) {
        console.warn(`Failed to rehydrate sample ${id}:`, e);
      }
    }
  }, [enabledSampleIds, files, addFile]);

  const toggleSample = useCallback(
    (s: SampleBundle, checked: boolean) => {
      setError(undefined);
      const ids = new Set(enabledSampleIds);
      if (checked) {
        if (!files.some((f) => f.id === s.id)) {
          try {
            addFile(parseSample(s));
          } catch (e) {
            setError(
              e instanceof Error
                ? `Failed to parse ${s.name}: ${e.message}`
                : `Failed to parse ${s.name}`
            );
            return;
          }
        }
        ids.add(s.id);
      } else {
        removeFile(s.id);
        ids.delete(s.id);
      }
      setEnabledSampleIds([...ids]);
    },
    [addFile, removeFile, enabledSampleIds, files, setEnabledSampleIds]
  );

  const processPair = useCallback(
    (pair: PendingPair, baseName: string) => {
      if (!pair.admx) return;
      try {
        const parsed = parseAdmx(pair.admx.content, pair.adml?.content, {
          admxFileName: pair.admx.name,
          admlFileName: pair.adml?.name,
          id: `custom::${baseName}`,
        });
        addFile(parsed);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : `Failed to parse ${pair.admx.name}`
        );
      }
    },
    [addFile]
  );

  const onDrop = useCallback(
    async (accepted: File[]) => {
      setError(undefined);
      const nextPending: Record<string, PendingPair> = { ...pending };
      for (const f of accepted) {
        const lower = f.name.toLowerCase();
        const base = f.name.replace(/\.(admx|adml)$/i, "").toLowerCase();
        const content = await readFile(f);
        const entry = nextPending[base] ?? {};
        if (lower.endsWith(".admx")) entry.admx = { name: f.name, content };
        else if (lower.endsWith(".adml")) entry.adml = { name: f.name, content };
        nextPending[base] = entry;
      }
      for (const [base, pair] of Object.entries(nextPending)) {
        if (pair.admx) {
          processPair(pair, base);
          delete nextPending[base];
        }
      }
      setPending(nextPending);
    },
    [pending, processPair]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/xml": [".admx", ".adml"],
      "text/xml": [".admx", ".adml"],
      "text/plain": [".admx", ".adml"],
    },
    multiple: true,
  });

  const customFiles = files.filter((f) => f.id.startsWith("custom::"));
  const checkedCount =
    enabledSampleIds.length + (cspCatalogEnabled ? 1 : 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Policy sources</span>
          <Badge variant="outline" className="text-[11px]">
            {checkedCount} checked
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Native CSP catalog */}
        <label className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent/40 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={cspCatalogEnabled}
            onChange={(e) => setCspCatalogEnabled(e.target.checked)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span className="font-medium">
                Native Windows Policy CSP
              </span>
              <Badge variant="secondary" className="text-[10px]">
                3,940 settings · 306 areas
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Microsoft DDFv2 Feb 2026 catalog + ADMX-backed element schemas.
              No upload required.
            </div>
          </div>
        </label>

        {/* Bundled ADMX samples */}
        <div>
          <div className="mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              Bundled ADMX templates
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SAMPLES.map((s) => {
              const checked = enabledSampleIds.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex items-start gap-2 rounded-md border p-2 text-sm hover:bg-accent/40 cursor-pointer transition-colors",
                    checked && "border-primary bg-accent/20"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={(e) => toggleSample(s, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{s.name}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.vendor} · {formatSize(sampleSize(s))}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Custom upload (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className="flex items-center gap-2 w-full rounded-md border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                customOpen && "rotate-90"
              )}
            />
            <UploadCloud className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Upload custom ADMX / ADML</span>
            {customFiles.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {customFiles.length} uploaded
              </Badge>
            )}
          </button>

          {customOpen && (
            <div className="mt-2 space-y-2">
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  isDragActive ? "border-primary bg-accent" : "border-border"
                )}
              >
                <input {...getInputProps()} />
                <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">
                  Drop your <code>.admx</code> and <code>.adml</code> files
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  or click to browse. Pairs are matched by filename.
                </p>
              </div>

              {Object.keys(pending).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Waiting on ADMX for: {Object.keys(pending).join(", ")}
                </p>
              )}

              {customFiles.length > 0 && (
                <div className="space-y-1">
                  {customFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between rounded-md border p-2 text-sm"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <FileCode className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {f.appName}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {f.admxFileName}
                            {f.admlFileName ? ` + ${f.admlFileName}` : ""}{" "}
                            · {f.policies.length} policies
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(f.id)}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
