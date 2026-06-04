import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  Pencil,
  Plus,
} from "lucide-react";
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

  const xmlLines = xml.split("\n");

  return (
    <div className="border border-primo-border">
      {/* Header with stats */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-primo-border">
        <span className="text-[14px] font-medium text-primo-fg">
          {t("exportPanel.summary", {
            admx: configuredCount,
            csp: cspApplyCount,
            reset: deleteCount,
            files: files.length,
          })}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Format selector */}
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

        {/* Divider — full-width, déborde du padding */}
        <div className="-mx-4 border-t border-primo-border" />

        {/* Preview with line numbers */}
        <div>
          <Label className="text-xs">{t("exportPanel.preview")}</Label>
          <div className="mt-1 max-h-[480px] overflow-auto border border-primo-border bg-[#fdfcfc]">
            <table className="w-full text-xs font-mono border-collapse">
              <tbody>
                {xmlLines.map((line, i) => (
                  <tr key={i} className="hover:bg-muted/30">
                    <td className="select-none text-right text-primo-muted pr-3 pl-3 py-0 w-10 border-r border-primo-border/50 leading-5">
                      {i + 1}
                    </td>
                    <td className="pl-3 pr-3 py-0 leading-5 whitespace-pre text-primo-fg">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4">
            {/* On Primo — bouton simple sans controleId, double avec */}
            {controleId ? (
              <div className={cn(
                "inline-flex items-stretch h-10 overflow-hidden text-[15px] rounded-[1px] border border-brand",
                (files.length === 0 && cspApplyCount === 0) && "opacity-50 pointer-events-none"
              )}>
                <span className="flex h-full items-center gap-2 px-5 bg-brand text-primo-fg font-medium whitespace-nowrap select-none leading-none">
                  On Primo
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                </span>
                <span className="w-px bg-brand" />
                <button
                  type="button"
                  onClick={onLoadToPrimo()}
                  className="flex h-full items-center gap-1.5 px-4 bg-white hover:bg-brand/10 transition-colors text-primo-fg leading-none"
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  Update
                </button>
                <span className="w-px bg-brand" />
                <button
                  type="button"
                  onClick={onLoadToPrimo(true)}
                  className="flex h-full items-center gap-1.5 px-4 bg-white hover:bg-brand/10 transition-colors text-primo-fg leading-none"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Create new
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onLoadToPrimo(false)}
                disabled={files.length === 0 && cspApplyCount === 0}
                className="inline-flex items-center h-10 px-5 text-[15px] font-medium bg-brand text-primo-fg hover:bg-brand/80 transition-colors rounded-[1px] disabled:opacity-50 disabled:pointer-events-none"
              >
                Load on Primo
              </button>
            )}

            {/* Download .xml */}
            <button
              type="button"
              onClick={onDownload}
              disabled={files.length === 0 && cspApplyCount === 0}
              className="inline-flex items-center gap-1.5 h-10 px-5 text-[15px] font-medium border border-primo-border-subtle text-primo-fg hover:bg-muted transition-colors rounded-[1px] disabled:opacity-50 disabled:pointer-events-none"
            >
              <Download className="h-3.5 w-3.5" /> {t("exportPanel.download")}
            </button>

            {/* Copy */}
            <button
              type="button"
              onClick={onCopy}
              disabled={files.length === 0 && cspApplyCount === 0}
              className="inline-flex items-center gap-1.5 h-10 px-5 text-[15px] font-medium border border-primo-border-subtle text-primo-fg hover:bg-muted transition-colors rounded-[1px] disabled:opacity-50 disabled:pointer-events-none"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t("exportPanel.copied") : t("exportPanel.copy")}
            </button>
          </div>

          {/* Reset — à droite */}
          <button
            type="button"
            onClick={onReset}
            disabled={disabledReset}
            className="inline-flex items-center gap-1.5 h-10 px-5 text-[15px] font-medium border border-primo-border-subtle text-destructive hover:bg-destructive/10 transition-colors rounded-[1px] ml-auto disabled:opacity-50 disabled:pointer-events-none"
            title={t("exportPanel.resetTitle")}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("exportPanel.reset")}
          </button>
        </div>
      </div>
    </div>
  );
}
