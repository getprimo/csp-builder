import { useEffect, useRef } from "react";
import { PolicySources } from "@/components/PolicySources";
import { PolicyList } from "@/components/PolicyList";
import { PolicyEditor } from "@/components/PolicyEditor";
import { ExportPanel } from "@/components/ExportPanel";
import { PrimoRibbon } from "@/components/PrimoRibbon";
import { primoUrl } from "@/lib/primo";
import { useAdmxStore } from "@/store/useAdmxStore";
import { parseSyncmlToState } from "@/lib/csp/parseSyncml";
import { parseAdmx } from "@/lib/admx/parser";
import { SAMPLES, type SampleBundle } from "@/lib/samples";
import type { AdmxFile } from "@/lib/admx/types";

const URI_SAFE = /[^A-Za-z0-9._~-]/g;
const uriSafeAppName = (s: string) =>
  (s.trim() || "App").replace(URI_SAFE, "_");

let samplesByAppName: Map<string, SampleBundle> | undefined;
function getSamplesByAppName(): Map<string, SampleBundle> {
  if (samplesByAppName) return samplesByAppName;
  const map = new Map<string, SampleBundle>();
  for (const s of SAMPLES) {
    // Cheap extraction — avoids a full parseAdmx until we actually need the file.
    const m = /<target\b[^>]*\bprefix="([^"]+)"/i.exec(s.admxContent);
    if (m?.[1]) map.set(uriSafeAppName(m[1]), s);
  }
  samplesByAppName = map;
  return map;
}

const parsedSampleCache = new Map<string, AdmxFile>();
function parseSampleById(s: SampleBundle): AdmxFile {
  const cached = parsedSampleCache.get(s.id);
  if (cached) return cached;
  const file = parseAdmx(s.admxContent, s.admlContent, {
    admxFileName: s.admxFileName,
    admlFileName: s.admlFileName,
    id: s.id,
  });
  parsedSampleCache.set(s.id, file);
  return file;
}

function useLoadFromUrl() {
  const files = useAdmxStore((s) => s.files);
  const enabledSampleIds = useAdmxStore((s) => s.enabledSampleIds);
  const cspCatalogEnabled = useAdmxStore((s) => s.cspCatalogEnabled);
  const loadFromSyncml = useAdmxStore((s) => s.loadFromSyncml);
  const setEnabledSampleIds = useAdmxStore((s) => s.setEnabledSampleIds);
  const setCspCatalogEnabled = useAdmxStore((s) => s.setCspCatalogEnabled);
  const setOnlyApplied = useAdmxStore((s) => s.setOnlyApplied);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const params = new URLSearchParams(window.location.search);
    const b64 = params.get("xml_file_b64");
    if (!b64) {
      done.current = true;
      return;
    }

    // Wait until PolicySources has hydrated every persisted sample into
    // `files`. Otherwise our ingested ADMX can't dedupe against the user's
    // loaded samples and we end up with two copies of e.g. Chrome.
    const loadedSampleCount = files.filter((f) =>
      enabledSampleIds.includes(f.id)
    ).length;
    if (loadedSampleCount < enabledSampleIds.length) return;

    done.current = true;

    try {
      const binary = atob(b64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const xml = new TextDecoder().decode(bytes);

      const sampleIndex = getSamplesByAppName();
      const autoEnabledSampleIds = new Set<string>();
      const resolveSample = (appName: string): AdmxFile | undefined => {
        const sample = sampleIndex.get(appName);
        if (!sample) return undefined;
        try {
          const file = parseSampleById(sample);
          autoEnabledSampleIds.add(sample.id);
          return file;
        } catch (err) {
          console.warn(
            `[CSP Builder] Failed to parse bundled sample '${sample.id}':`,
            err
          );
          return undefined;
        }
      };

      const parsed = parseSyncmlToState(xml, files, { resolveSample });
      loadFromSyncml(parsed);

      if (autoEnabledSampleIds.size > 0) {
        const merged = Array.from(
          new Set([...enabledSampleIds, ...autoEnabledSampleIds])
        );
        setEnabledSampleIds(merged);
      }

      // Native CSP policies only surface in the Policies list when the
      // catalog toggle is on. Auto-enable it if the URL brought any, so the
      // restored CSP rows aren't hidden from the user.
      if (parsed.configuredCsp.length > 0 && !cspCatalogEnabled) {
        setCspCatalogEnabled(true);
      }

      // The whole point of loading from URL is to land directly on the
      // restored configuration, so scope the Policies list to just the
      // applied rows.
      if (parsed.configured.length > 0 || parsed.configuredCsp.length > 0) {
        setOnlyApplied(true);
      }

      if (parsed.skipped.length) {
        console.warn(
          `[CSP Builder] Loaded from URL — ${parsed.skipped.length} command(s) skipped:`,
          parsed.skipped
        );
      }
    } catch (e) {
      console.error("[CSP Builder] Failed to load xml_file_b64 from URL:", e);
    } finally {
      params.delete("xml_file_b64");
      const qs = params.toString();
      const url =
        window.location.pathname +
        (qs ? `?${qs}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", url);
    }
  }, [
    files,
    enabledSampleIds,
    cspCatalogEnabled,
    loadFromSyncml,
    setEnabledSampleIds,
    setCspCatalogEnabled,
    setOnlyApplied,
  ]);
}

function App() {
  useLoadFromUrl();

  return (
    <div className="min-h-screen bg-background">
      <PrimoRibbon />

      <header className="border-b">
        <div className="container py-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            CSP Builder
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Free online generator to turn Windows ADMX/ADML templates and the
            Microsoft Policy CSP catalog into ready-to-ship SyncML payloads for{" "}
            <strong className="text-foreground">FleetDM</strong>,{" "}
            <strong className="text-foreground">Intune</strong>, and any MDM
            that speaks OMA-DM. Built by{" "}
            <a
              href={primoUrl("header")}
              target="_blank"
              rel="noopener"
              className="font-medium text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              Primo
            </a>{" "}
            — the IT platform for modern teams (device management, onboarding,
            SaaS, procurement).
          </p>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <PolicySources />

        <div className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
          <PolicyList />
          <div className="space-y-6 min-w-0">
            <PolicyEditor />
            <ExportPanel />
          </div>
        </div>

        <section className="rounded-lg border bg-muted/30 p-5">
          <h2 className="text-base font-semibold">
            Shipping GPO / CSP policies at scale?
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This builder handles the <em>payload</em>. Primo handles the rest:
            enroll devices via MDM, push ADMX-backed and native CSP policies,
            manage macOS, Windows, Linux and iOS fleets from one place, and
            automate onboarding/offboarding with your HR system.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={primoUrl("cta_primary")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Discover Primo →
            </a>
            <a
              href={primoUrl("cta_mdm", "/product-page/mdm")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              See Primo for MDM
            </a>
            <a
              href={primoUrl("cta_demo", "/request-a-demo")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              Book a demo
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container flex flex-col gap-2 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>Client-only · fast-xml-parser · Tailwind · Zustand</div>
          <div>
            A free tool by{" "}
            <a
              href={primoUrl("footer")}
              target="_blank"
              rel="noopener"
              className="font-medium text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              Primo
            </a>
            {" · "}
            <a
              href={primoUrl("footer_mdm", "/product-page/mdm")}
              target="_blank"
              rel="noopener"
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              MDM
            </a>
            {" · "}
            <a
              href={primoUrl("footer_pricing", "/pricing")}
              target="_blank"
              rel="noopener"
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              Pricing
            </a>
            {" · "}
            <a
              href={primoUrl("footer_demo", "/request-a-demo")}
              target="_blank"
              rel="noopener"
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              Book a demo
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
