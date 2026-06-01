import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { Trash2, Plus } from "lucide-react";
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
  const { t } = useTranslation();
  const files = useAdmxStore((s) => s.files);
  const addFile = useAdmxStore((s) => s.addFile);
  const removeFile = useAdmxStore((s) => s.removeFile);
  const cspCatalogEnabled = useAdmxStore((s) => s.cspCatalogEnabled);
  const setCspCatalogEnabled = useAdmxStore((s) => s.setCspCatalogEnabled);
  const enabledSampleIds = useAdmxStore((s) => s.enabledSampleIds);
  const setEnabledSampleIds = useAdmxStore((s) => s.setEnabledSampleIds);

  const [pending, setPending] = useState<Record<string, PendingPair>>({});
  const [error, setError] = useState<string | undefined>();

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
                ? t("policySources.errors.failedToParseNamed", {
                    name: s.name,
                    message: e.message,
                  })
                : t("policySources.errors.failedToParse", { name: s.name })
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
          e instanceof Error
            ? e.message
            : t("policySources.errors.failedToParse", { name: pair.admx.name })
        );
      }
    },
    [addFile, t]
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

  // All items in order: Native CSP first, then ADMX samples, then custom uploaded, then upload cell
  const sampleItems = SAMPLES.map((s) => ({
    type: "sample" as const,
    sample: s,
    checked: enabledSampleIds.includes(s.id),
  }));

  return (
    <div>
      {/* 3-column grid with shared borders */}
      <div className="grid grid-cols-3 border-t border-l border-primo-border">

        {/* Native CSP — always first */}
        <label
          className={cn(
            "flex gap-3 items-start p-4 border-b border-r border-primo-border cursor-pointer",
            "hover:bg-gray-50 transition-colors"
          )}
        >
          <input
            type="checkbox"
            className="checkbox-square mt-0.5"
            checked={cspCatalogEnabled}
            onChange={(e) => setCspCatalogEnabled(e.target.checked)}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-primo-fg leading-[1.4]">
              {t("policySources.nativeCsp.name")}
            </div>
            <div className="mt-1 text-[14px] text-primo-muted leading-[1.4]">
              {t("policySources.nativeCsp.description")}
            </div>
          </div>
        </label>

        {/* ADMX samples */}
        {sampleItems.map(({ sample: s, checked }) => (
          <label
            key={s.id}
            className={cn(
              "flex gap-3 items-start p-4 border-b border-r border-primo-border cursor-pointer",
              "hover:bg-gray-50 transition-colors"
            )}
          >
            <input
              type="checkbox"
              className="checkbox-square mt-0.5"
              checked={checked}
              onChange={(e) => toggleSample(s, e.target.checked)}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-primo-fg leading-[1.4]">
                {s.name}
              </div>
              <div className="mt-1 text-[14px] text-primo-muted leading-[1.4]">
                {s.vendor} · {formatSize(sampleSize(s))}
              </div>
            </div>
          </label>
        ))}

        {/* Custom uploaded files */}
        {customFiles.map((f) => (
          <div
            key={f.id}
            className="flex gap-3 items-start p-4 border-b border-r border-primo-border"
          >
            <input
              type="checkbox"
              className="checkbox-square mt-0.5"
              checked
              readOnly
            />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-primo-fg leading-[1.4] truncate">
                {f.appName}
              </div>
              <div className="mt-1 text-[14px] text-primo-muted leading-[1.4] truncate">
                {f.admxFileName}
                {f.admlFileName ? ` + ${f.admlFileName}` : ""} ·{" "}
                {t("policySources.policiesCount", {
                  count: f.policies.length,
                })}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 -mt-1 -mr-2 h-7 w-7 text-primo-muted hover:text-primo-fg"
              onClick={() => removeFile(f.id)}
              aria-label={t("policySources.remove")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {/* Upload cell — last */}
        <div
          {...getRootProps()}
          className={cn(
            "flex gap-3 items-start p-4 border-b border-r border-primo-border border-dashed cursor-pointer",
            "bg-[#fdfcfc] hover:bg-gray-50 transition-colors",
            isDragActive && "bg-blue-50 border-blue-400"
          )}
        >
          <input {...getInputProps()} />
          <Plus className="h-3 w-3 mt-1 shrink-0 text-primo-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-primo-fg leading-[1.4]">
              {t("policySources.uploadCustom")}
            </div>
            <div className="mt-1 text-[14px] text-primo-muted leading-[1.4]">
              Pairs are matched by filename.
            </div>
          </div>
        </div>
      </div>

      {Object.keys(pending).length > 0 && (
        <p className="mt-2 text-xs text-primo-muted">
          {t("policySources.waitingFor", {
            names: Object.keys(pending).join(", "),
          })}
        </p>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
