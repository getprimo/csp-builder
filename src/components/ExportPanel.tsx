import { useMemo, useState } from "react";
import { Download, FileJson, Copy, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdmxStore } from "@/store/useAdmxStore";
import { buildSyncML, EXPORT_MODES, type ExportMode } from "@/lib/csp/syncml";

export function ExportPanel() {
  const files = useAdmxStore((s) => s.files);
  const configured = useAdmxStore((s) => s.configured);
  const configuredCsp = useAdmxStore((s) => s.configuredCsp);
  const [mode, setMode] = useState<ExportMode>("fleetdm");
  const [copied, setCopied] = useState(false);

  const xml = useMemo(
    () => buildSyncML(files, configured, configuredCsp, { mode }),
    [files, configured, configuredCsp, mode]
  );

  const applied = Object.values(configured).filter((c) => c.apply);
  const configuredCount = applied.filter(
    (c) => c.state !== "notConfigured"
  ).length;
  const deleteCount = applied.filter((c) => c.state === "notConfigured").length;
  const cspApplyCount = Object.values(configuredCsp).filter(
    (c) => c.apply
  ).length;

  const selectedMode = EXPORT_MODES.find((m) => m.id === mode)!;

  const onDownload = () => {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      mode === "fleetdm" ? "policies.fleetdm.xml" : "policies.syncml.xml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="h-5 w-5" /> Export
        </CardTitle>
        <CardDescription>
          {configuredCount} ADMX · {cspApplyCount} CSP · {deleteCount} reset ·{" "}
          {files.length} ADMX files loaded
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Format</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as ExportMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_MODES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground pt-1">
            {selectedMode.description}
          </p>
        </div>

        <div>
          <Label className="text-xs">Preview</Label>
          <pre className="mt-1 max-h-[480px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre">
            {xml}
          </pre>
        </div>

        <div className="flex gap-2">
          <Button onClick={onDownload} disabled={files.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Download .xml
          </Button>
          <Button
            variant="outline"
            onClick={onCopy}
            disabled={files.length === 0}
          >
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
