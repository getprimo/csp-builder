import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PolicySources } from "@/components/PolicySources";
import { PolicyList } from "@/components/PolicyList";
import { PolicyEditor } from "@/components/PolicyEditor";
import { ExportPanel } from "@/components/ExportPanel";
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

function readControleIdFromSearchParams(
  params: URLSearchParams
): string | undefined {
  const raw =
    params.get("controle_id") ?? params.get("control_id") ?? undefined;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

function stripControleIdParams(params: URLSearchParams): void {
  params.delete("controle_id");
  params.delete("control_id");
}

function useLoadFromUrl() {
  const files = useAdmxStore((s) => s.files);
  const enabledSampleIds = useAdmxStore((s) => s.enabledSampleIds);
  const cspCatalogEnabled = useAdmxStore((s) => s.cspCatalogEnabled);
  const loadFromSyncml = useAdmxStore((s) => s.loadFromSyncml);
  const setEnabledSampleIds = useAdmxStore((s) => s.setEnabledSampleIds);
  const setCspCatalogEnabled = useAdmxStore((s) => s.setCspCatalogEnabled);
  const setOnlyApplied = useAdmxStore((s) => s.setOnlyApplied);
  const setControleId = useAdmxStore((s) => s.setControleId);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const params = new URLSearchParams(window.location.search);
    const controleId = readControleIdFromSearchParams(params);
    const b64 = params.get("xml_file_b64");

    if (controleId) {
      setControleId(controleId);
      stripControleIdParams(params);
      const qs = params.toString();
      const url =
        window.location.pathname +
        (qs ? `?${qs}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", url);
    }

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
      stripControleIdParams(params);
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
    setControleId,
  ]);
}

function PrimoLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="98"
      height="23"
      viewBox="0 0 48 46"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Primo"
    >
      <path
        fill="#863bff"
        d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"
      />
    </svg>
  );
}

// Primo logo assets (node 1534:2512) — valid 7 days
const PRIMO_MARK_ASSETS = {
  union:  "https://www.figma.com/api/mcp/asset/6a1f2e70-3917-486c-81cf-62c6561b4a9b",
  union1: "https://www.figma.com/api/mcp/asset/0d4c46d3-1d9c-4b66-8542-f809dfb5a95b",
  union2: "https://www.figma.com/api/mcp/asset/1ffe450b-d668-4345-bb2a-8193fbe7b6c7",
  union3: "https://www.figma.com/api/mcp/asset/4dcfba23-3d03-41a1-a9b1-df458bf13bdf",
  union4: "https://www.figma.com/api/mcp/asset/eda2971f-6b66-4300-bba9-2b024d389b2c",
  wordmark: "https://www.figma.com/api/mcp/asset/00d73f48-c1ef-413d-b7f2-38ffffdd8354",
};

function PrimoLogoFull({ height = 36 }: { height?: number }) {
  // aspect ratio 798:182
  const width = Math.round(height * 798 / 182);
  return (
    <div style={{ position: 'relative', width, height, flexShrink: 0 }}>
      {/* Logo mark — left ~25% */}
      <div style={{ position: 'absolute', inset: '4.12% 74.65% 0.41% 0' }}>
        <div style={{ position: 'absolute', inset: '0 0 66.67% 66.66%' }}>
          <img alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} src={PRIMO_MARK_ASSETS.union} />
        </div>
        <div style={{ position: 'absolute', inset: '33.33% 49.99% 33.33% 16.67%' }}>
          <img alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} src={PRIMO_MARK_ASSETS.union1} />
        </div>
        <div style={{ position: 'absolute', inset: '0 33.32% 66.67% 33.34%' }}>
          <img alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} src={PRIMO_MARK_ASSETS.union} />
        </div>
        <div style={{ position: 'absolute', bottom: '33.33%', left: '50%', right: '16.67%', top: '33.33%' }}>
          <img alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} src={PRIMO_MARK_ASSETS.union2} />
        </div>
        <div style={{ position: 'absolute', inset: '66.67% 33.32% 0 33.34%' }}>
          <img alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} src={PRIMO_MARK_ASSETS.union3} />
        </div>
        <div style={{ position: 'absolute', inset: '0 66.66% 66.67% 0' }}>
          <img alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} src={PRIMO_MARK_ASSETS.union4} />
        </div>
      </div>
      {/* Wordmark — right 72% */}
      <div style={{ position: 'absolute', inset: '0 0 0 27.61%' }}>
        <div style={{ position: 'absolute', inset: '4.53% -0.13% -0.82% 0' }}>
          <img alt="Primo" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} src={PRIMO_MARK_ASSETS.wordmark} />
        </div>
      </div>
    </div>
  );
}

function App() {
  useLoadFromUrl();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-white text-primo-fg">
      {/* Nav */}
      <nav className="border-b border-primo-border-subtle">
        <div className="container flex items-center justify-between h-[53px]">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="w-4 h-4" />
            <span className="font-departure text-[18px] tracking-tight text-black">
              CSP BUILDER
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={primoUrl("nav_expert")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-7 items-center rounded-sm bg-brand px-3 text-xs font-medium text-primo-fg hover:bg-brand/90 transition-colors"
            >
              Talk to an expert
            </a>
            <a
              href={primoUrl("nav_try")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-7 items-center rounded-sm border border-primo-border-subtle px-3 text-xs font-medium text-primo-fg hover:bg-muted transition-colors"
            >
              Try Primo
            </a>
          </div>
        </div>
      </nav>

      {/* Sub-nav tags */}
      <div className="border-primo-border">
        <div className="container flex items-center justify-center h-[54px]">
          <div className="font-mono text-[12px] tracking-tight text-black flex items-center gap-3">
            <span>FREE</span>
            <span className="text-[10px] text-primo-muted">/</span>
            <span>RUNS IN BROWSER</span>
            <span className="text-[10px] text-primo-muted">/</span>
            <span>OPEN SOURCE</span>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-white text-center">
        {/* Container aligné sur les sections du dessous */}
        <div className="container mx-auto">
          {/* Wrapper sans padding — référence commune pour img et contenu */}
          <div className="relative">
          {/* Grille PNG — en flux pour driver la hauteur du container */}
          <img
            src="/hero-grid.png"
            alt=""
            aria-hidden
            className="block w-full pointer-events-none select-none"
          />
          {/* Contenu positionné exactement dans le trou de la grille
              PNG: 1271×641px, PAD=10px, CELL=90px
              Trou cols 2-11, rows 1-5 → px: left=190, top=100, w=900, h=450
              En % de l'image : left=14.95%, top=15.60%, w=70.81%, h=70.20% */}
          <div
            className="absolute z-10 flex flex-col items-center justify-center text-center"
            style={{
              left:   '14.95%',
              top:    '15.60%',
              width:  '70.81%',
              height: '70.20%',
            }}
          >
            {/* imgFrame2136137828 — rectangle bleu-cyan clair */}
            <img
              src="https://www.figma.com/api/mcp/asset/6e6a1774-a9e5-4c6e-836d-75e2e5bdc09c"
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full pointer-events-none select-none"
              style={{ objectFit: 'fill' }}
            />
            {/* Texte centré dans le trou */}
            <div className="relative z-10 flex flex-col items-center px-8" style={{ maxWidth: 656 }}>
              <h1 className="text-[48px] leading-[1.4] font-semibold tracking-tight text-black">
                Deploy Windows
                <br />
                policies in minutes
              </h1>
              <p className="mt-4 text-[16px] leading-[1.5] text-primo-muted">
                {t("app.tagline_short", {
                  defaultValue:
                    "Free generator that converts Windows ADMX/ADML templates and the Microsoft Policy CSP catalog into ready-to-ship SyncML payloads. Works with Fleet, Intune, and any MDM that speaks OMA-DM.",
                })}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3 text-[24px] font-semibold text-primo-fg">
                <span>By</span>
                <a href={primoUrl("hero_logo")} target="_blank" rel="noopener">
                  <PrimoLogoFull height={22} />
                </a>
              </div>
            </div>
          </div>
          </div>{/* close relative wrapper */}
        </div>
      </section>

      {/* Main sections */}
      <main className="container py-10 space-y-12">

        {/* 1. Sources */}
        <section>
          <div className="mb-6">
            <h2 className="text-[32px] font-semibold tracking-tight text-crow">
              <span className="mr-3 text-primo-muted font-mono text-[20px]">1.</span>
              Sources
            </h2>
            <p className="text-[16px] text-primo-muted">
              {t("sources.description", { defaultValue: "Define what your catalog of policies should look like" })}
            </p>
          </div>
          <PolicySources />
        </section>

        {/* 2. Setup */}
        <section>
          <div className="mb-6">
            <h2 className="text-[32px] font-semibold tracking-tight text-crow">
              <span className="mr-3 text-primo-muted font-mono text-[20px]">2.</span>
              Setup
            </h2>
            <p className="text-[16px] text-primo-muted">
              {t("setup.description", { defaultValue: "Define what your catalog of policies should look like" })}
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-0 items-stretch border border-primo-border">
            <PolicyList />
            <div className="min-w-0 border-l border-primo-border">
              <PolicyEditor />
            </div>
          </div>
        </section>

        {/* 3. Export */}
        <section>
          <div className="mb-6">
            <h2 className="text-[32px] font-semibold tracking-tight text-crow">
              <span className="mr-3 text-primo-muted font-mono text-[20px]">3.</span>
              Export
            </h2>
          </div>
          <ExportPanel />
        </section>

        {/* CTA */}
        <section className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between py-12 border-t border-primo-border">
          <div>
            <h2 className="text-[50px] leading-[1.4] font-semibold tracking-tight text-crow w-[540px] max-w-full">
              Shipping policies
              <br />
              at scale?
            </h2>
          </div>
          <div className="max-w-[480px]">
            <p className="text-[20px] leading-[1.6] text-crow">
              This builder handles the payload. Primo handles the rest: enrollment, ADMX and native CSP policies, and macOS, Windows, Linux, and iOS in one console, all tied to your HRIS.
            </p>
            <div className="mt-8 flex flex-wrap gap-6">
              <a
                href={primoUrl("cta_primary")}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center rounded-sm bg-brand px-5 text-[15px] font-medium text-primo-fg hover:bg-brand/90 transition-colors"
              >
                Talk to an expert
              </a>
              <a
                href={primoUrl("cta_try")}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center rounded-sm border border-primo-border-subtle px-5 text-[15px] font-medium text-primo-fg hover:bg-muted transition-colors"
              >
                Try Primo
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-primo-dark">
        <div className="container py-20 flex flex-col items-center gap-7">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center">
            <div className="flex items-center gap-4">
              <img src="/favicon.svg" alt="" className="w-8 h-8" />
              <span className="font-departure text-[36px] tracking-tight text-white">
                CSP BUILDER
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-[#a6b0b5] uppercase tracking-wide">
                Built with care by
              </span>
              <a
                href={primoUrl("footer")}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
              >
                <PrimoLogo className="h-4 w-auto brightness-0 invert" />
                <span className="text-[14px] text-white font-medium">Primo</span>
              </a>
            </div>
            <p className="text-[12px] leading-[1.6] text-[#fffbf4]">
              We believe that strong foundations create strong companies. That's why we're building the all-in-one IT platform for companies on their growth from 2 to 2000 employees.
            </p>
          </div>
          <p className="text-[12px] text-[#a6b0b5]">
            ©2026 Primo. All Rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
