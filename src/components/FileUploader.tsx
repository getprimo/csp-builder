import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileCode,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function formatKiB(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function sampleSize(s: SampleBundle): number {
  return (s.admxContent?.length ?? 0) + (s.admlContent?.length ?? 0);
}

export function FileUploader() {
  const files = useAdmxStore((s) => s.files);
  const addFile = useAdmxStore((s) => s.addFile);
  const removeFile = useAdmxStore((s) => s.removeFile);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState<Record<string, PendingPair>>({});
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [loadedOpen, setLoadedOpen] = useState(false);
  const [selectedSamples, setSelectedSamples] = useState<Set<string>>(
    () => new Set()
  );

  const processPair = useCallback(
    (pair: PendingPair, baseName: string) => {
      if (!pair.admx) return;
      try {
        const parsed = parseAdmx(pair.admx.content, pair.adml?.content, {
          admxFileName: pair.admx.name,
          admlFileName: pair.adml?.name,
          id: baseName,
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

  const toggleSample = (id: string) => {
    setSelectedSamples((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadSelectedSamples = useCallback(() => {
    setError(undefined);
    for (const s of SAMPLES) {
      if (!selectedSamples.has(s.id)) continue;
      processPair(
        {
          admx: { name: s.admxFileName, content: s.admxContent },
          adml: { name: s.admlFileName, content: s.admlContent },
        },
        s.id
      );
    }
    setSelectedSamples(new Set());
    setSamplesOpen(false);
  }, [processPair, selectedSamples]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/xml": [".admx", ".adml"],
      "text/xml": [".admx", ".adml"],
      "text/plain": [".admx", ".adml"],
    },
    multiple: true,
  });

  const totalSamples = SAMPLES.length;
  const selectedCount = selectedSamples.size;

  return (
    <Card>
      <CardContent className="p-4">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-primary bg-accent" : "border-border"
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-2 font-medium">
            Drop your <code>.admx</code> and <code>.adml</code> files here
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse. Multiple ADMX are supported.
          </p>
        </div>

        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSamplesOpen((o) => !o)}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Pre-filled samples
            {selectedCount > 0 ? ` (${selectedCount} checked)` : ""}
            <ChevronDown
              className={`h-4 w-4 ml-1 transition-transform ${
                samplesOpen ? "rotate-180" : ""
              }`}
            />
          </Button>

          {samplesOpen && (
            <div className="mt-2 rounded-md border bg-card p-3">
              <div className="flex items-center justify-between pb-2 border-b mb-2">
                <div className="text-xs text-muted-foreground">
                  {totalSamples} official / community ADMX — all embedded in the
                  bundle.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setSelectedSamples(new Set(SAMPLES.map((s) => s.id)))
                    }
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedSamples(new Set())}
                  >
                    None
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 max-h-80 overflow-y-auto">
                {SAMPLES.map((s) => {
                  const alreadyLoaded = files.some((f) => f.id === s.id);
                  const checked = selectedSamples.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-start gap-2 p-2 rounded hover:bg-accent/40 cursor-pointer ${
                        alreadyLoaded ? "opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={alreadyLoaded}
                        onChange={() => toggleSample(s.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {s.name}
                          </span>
                          {alreadyLoaded && (
                            <Badge variant="secondary" className="text-[10px]">
                              already loaded
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {s.vendor} · {formatKiB(sampleSize(s))} ·{" "}
                          {s.admxFileName}
                        </div>
                        {s.note && (
                          <div className="text-[11px] text-muted-foreground italic">
                            {s.note}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="pt-3 mt-2 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSamplesOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={loadSelectedSamples}
                  disabled={selectedCount === 0}
                >
                  Load {selectedCount} ADMX
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {Object.keys(pending).length > 0 && (
          <div className="mt-3 text-sm text-muted-foreground">
            Waiting on ADMX for: {Object.keys(pending).join(", ")}
          </div>
        )}

        {files.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setLoadedOpen((o) => !o)}
              className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-accent/40 transition-colors"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform",
                  loadedOpen && "rotate-90"
                )}
              />
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">
                {files.length} ADMX loaded
              </span>
              <span className="text-xs text-muted-foreground">
                (
                {files.reduce((n, f) => n + f.policies.length, 0)} policies total
                )
              </span>
            </button>

            {loadedOpen && (
              <div className="mt-2 space-y-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-start gap-3">
                      <FileCode className="h-5 w-5 mt-0.5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{f.appName}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.admxFileName}
                          {f.admlFileName
                            ? ` + ${f.admlFileName}`
                            : " (no ADML)"}
                        </div>
                        <div className="mt-1 flex gap-2">
                          <Badge variant="secondary">
                            {f.policies.length} policies
                          </Badge>
                          <Badge variant="outline">
                            prefix: {f.targetPrefix}
                          </Badge>
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
      </CardContent>
    </Card>
  );
}
