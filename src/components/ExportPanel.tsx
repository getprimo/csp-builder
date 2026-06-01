import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  FileJson,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  Pencil,
  Plus,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const PRIMO_CUSTOMFILE_BASE =
  "https://app.getprimo.com/mdm-controls/customfile_windows";

function primoCustomFileOpenUrl(controleId: string | undefined): string {
  if (controleId) {
    return `${PRIMO_CUSTOMFILE_BASE}/edit/${encodeURIComponent(controleId)}`;
  }
  return `${PRIMO_CUSTOMFILE_BASE}/add`;
}

const MODE_I18N_KEY: Record<ExportMode, string> = {
  fleetdm: "exportModes.fleetdm",
  "envelope-with-ingestion": "exportModes.envelopeWithIngestion",
  "body-with-ingestion": "exportModes.bodyWithIngestion",
  "envelope-only": "exportModes.envelopeOnly",
  "body-only": "exportModes.bodyOnly",
};

export function ExportPanel() {
  const { t } = useTranslation();
  const files = useAdmxStore((s) => s.files);
  const configured = useAdmxStore((s) => s.configured);
  const configuredCsp = useAdmxStore((s) => s.configuredCsp);
  const controleId = useAdmxStore((s) => s.controleId);
  const resetConfigurations = useAdmxStore((s) => s.resetConfigurations);
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

  const onLoadToPrimo = (forceAdd: boolean = false) => () => {
    const bytes = new TextEncoder().encode(xml);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    const base = forceAdd ? primoCustomFileOpenUrl(undefined) : primoCustomFileOpenUrl(controleId);
    const url = `${base}?xml_file_b64=${encodeURIComponent(b64)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    if(controleId) {
      resetConfigurations();
    }
  };

  const totalApplied = configuredCount + deleteCount + cspApplyCount;


  const disabledReset = useMemo(() => {
    return totalApplied === 0 && !controleId;
  }, [totalApplied, controleId]);

  const onReset = () => {
    const msg =
      totalApplied === 1
        ? t("exportPanel.resetConfirmOne")
        : t("exportPanel.resetConfirmMany", { count: totalApplied });
    if (window.confirm(msg)) {
      resetConfigurations();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="h-5 w-5" /> {t("exportPanel.title")}
        </CardTitle>
        <CardDescription>
          {t("exportPanel.summary", {
            admx: configuredCount,
            csp: cspApplyCount,
            reset: deleteCount,
            files: files.length,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("exportPanel.format")}</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as ExportMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_MODES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {t(`${MODE_I18N_KEY[m.id]}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground pt-1">
            {t(`${MODE_I18N_KEY[selectedMode.id]}.description`)}
          </p>
        </div>

        <div>
          <Label className="text-xs">{t("exportPanel.preview")}</Label>
          <pre className="mt-1 max-h-[480px] overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre">
            {xml}
          </pre>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onDownload}
            disabled={files.length === 0 && cspApplyCount === 0}
          >
            <Download className="h-4 w-4 mr-2" /> {t("exportPanel.download")}
          </Button>
          <Button
            variant="outline"
            onClick={onCopy}
            disabled={files.length === 0 && cspApplyCount === 0}
          >
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? t("exportPanel.copied") : t("exportPanel.copy")}
          </Button>
          {/* On Primo split button */}
          <div
            className={cn(
              "inline-flex items-stretch h-10 border border-primo-border rounded-sm overflow-hidden text-[14px]",
              (files.length === 0 && cspApplyCount === 0) && "opacity-50 pointer-events-none"
            )}
          >
            <span className="flex h-full items-center gap-1.5 px-3 bg-brand/20 border-r border-primo-border text-primo-fg font-medium whitespace-nowrap select-none leading-none">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              On Primo
            </span>
            {controleId && (
              <>
                <button
                  type="button"
                  onClick={onLoadToPrimo()}
                  className="flex h-full items-center gap-1.5 px-3 hover:bg-muted transition-colors text-primo-fg leading-none"
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  Update
                </button>
                <span className="w-px bg-primo-border" />
              </>
            )}
            <button
              type="button"
              onClick={onLoadToPrimo(controleId ? true : false)}
              className="flex h-full items-center gap-1.5 px-3 hover:bg-muted transition-colors text-primo-fg leading-none"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              Create new
            </button>
          </div>

          <Button
            variant="outline"
            onClick={onReset}
            disabled={disabledReset}
            className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            title={t("exportPanel.resetTitle")}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t("exportPanel.reset")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
