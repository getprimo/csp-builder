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
      <nav className="border-b border-primo-border">
        <div className="container flex items-center justify-between h-[53px]">
          <div className="flex items-center">
            <svg width="150" height="23" viewBox="0 0 150 23" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CSP Builder">
              <path d="M8.66634 11.5002H9.99967V12.8335H11.333V14.1668H8.66634V18.1668H1.33301V15.5002H2.66634V16.8335H7.33301V14.1668H4.66634V12.8335H5.99967V11.5002H7.33301V10.1668H8.66634V11.5002ZM11.9997 6.16683H10.6663V8.8335H13.333V7.50016H14.6663V18.1668H9.99967V16.8335H13.333V10.1668H9.33301V6.16683H2.66634V8.8335H1.33301V4.8335H11.9997V6.16683ZM2.66634 14.1668H1.33301V12.8335H2.66634V14.1668ZM2.66634 11.5002H1.33301V10.1668H2.66634V11.5002ZM13.333 7.50016H11.9997V6.16683H13.333V7.50016Z" fill="black"/>
              <path d="M25.6364 6.54545H27.2727V16.3636H25.6364V6.54545ZM27.2727 16.3636H32.1818V18H27.2727V16.3636ZM32.1818 14.7273H33.8182V16.3636H32.1818V14.7273ZM27.2727 4.90909H32.1818V6.54545H27.2727V4.90909ZM32.1818 6.54545H33.8182V8.18182H32.1818V6.54545ZM37.0253 6.54545H38.6617V9.81818H37.0253V6.54545ZM38.6617 9.81818H43.5708V11.4545H38.6617V9.81818ZM43.5708 16.3636V18H38.6617V16.3636H43.5708ZM38.6617 16.3636H37.0253V14.7273H38.6617V16.3636ZM43.5708 11.4545H45.2071V16.3636H43.5708V11.4545ZM38.6617 4.90909H43.5708V6.54545H38.6617V4.90909ZM43.5708 6.54545H45.2071V8.18182H43.5708V6.54545ZM48.4142 4.90909H54.9597V6.54545H50.0506V11.4545H54.9597V13.0909H50.0506V18H48.4142V4.90909ZM54.9597 6.54545H56.5961V11.4545H54.9597V6.54545ZM71.1921 4.90909H77.7376V6.54545H72.8285V9.81818H77.7376V11.4545H72.8285V16.3636H77.7376V18H71.1921V4.90909ZM77.7376 11.4545H79.3739V16.3636H77.7376V11.4545ZM77.7376 6.54545H79.3739V9.81818H77.7376V6.54545ZM82.5811 4.90909H84.2174V16.3636H82.5811V4.90909ZM84.2174 16.3636H89.1265V18H84.2174V16.3636ZM89.1265 4.90909H90.7629V16.3636H89.1265V4.90909ZM97.2427 16.3636V6.54545H93.97V4.90909H102.152V6.54545H98.8791V16.3636H102.152V18H93.97V16.3636H97.2427ZM105.359 4.90909H106.995V16.3636H113.541V18H105.359V4.90909ZM116.748 4.90909H123.293V6.54545H118.384V16.3636H123.293V18H116.748V4.90909ZM123.293 6.54545H124.93V16.3636H123.293V6.54545ZM128.137 4.90909H136.319V6.54545H129.773V9.81818H134.682V11.4545H129.773V16.3636H136.319V18H128.137V4.90909ZM139.526 4.90909H146.071V6.54545H141.162V11.4545H146.071V14.7273H144.435V13.0909H141.162V18H139.526V4.90909ZM146.071 6.54545H147.708V11.4545H146.071V6.54545ZM146.071 14.7273H147.708V18H146.071V14.7273Z" fill="black"/>
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={primoUrl("nav_expert")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-7 items-center rounded-none bg-brand px-3 text-xs font-medium text-primo-fg hover:bg-brand/90 transition-colors"
            >
              Talk to an expert
            </a>
            <a
              href={primoUrl("nav_try")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-7 items-center rounded-none border border-primo-border-subtle px-3 text-xs font-medium text-primo-fg hover:bg-muted transition-colors"
            >
              Try Primo
            </a>
          </div>
        </div>
      </nav>

      {/* Sub-nav tags */}
      <div>
        <div className="container flex items-center justify-center h-9">
          <div className="font-mono text-[11px] tracking-[0.08em] text-primo-muted flex items-center gap-3">
            <span>FREE</span>
            <span>/</span>
            <span>RUNS IN BROWSER</span>
            <span>/</span>
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
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-departure text-[32px] leading-none text-crow">1.</span>
              <h2 className="text-[32px] font-semibold tracking-tight text-crow">Sources</h2>
            </div>
            <p className="text-[16px] text-primo-muted">
              {t("sources.description", { defaultValue: "Define what your catalog of policies should look like" })}
            </p>
          </div>
          <PolicySources />
        </section>

        {/* 2. Setup */}
        <section>
          <div className="mb-6">
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-departure text-[32px] leading-none text-crow">2.</span>
              <h2 className="text-[32px] font-semibold tracking-tight text-crow">Setup</h2>
            </div>
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
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-departure text-[32px] leading-none text-crow">3.</span>
              <h2 className="text-[32px] font-semibold tracking-tight text-crow">Export</h2>
            </div>
          </div>
          <ExportPanel />
        </section>

        {/* CTA */}
        <section className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between py-12 border-t-2 border-primo-border">
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
                className="inline-flex h-10 items-center rounded-none bg-brand px-5 text-[15px] font-medium text-primo-fg hover:bg-brand/90 transition-colors"
              >
                Talk to an expert
              </a>
              <a
                href={primoUrl("cta_try")}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center rounded-none border border-primo-border-subtle px-5 text-[15px] font-medium text-primo-fg hover:bg-muted transition-colors"
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
          {/* Content centré */}
          <div className="flex flex-col items-center gap-6 max-w-sm text-center">
            {/* Logo CSP Builder */}
            <div className="flex items-center gap-4">
              <img src="/favicon.svg" alt="" className="w-8 h-8" />
              <span className="font-departure text-[36px] tracking-tight text-white">CSP BUILDER</span>
            </div>

            {/* Built with care by — items-baseline */}
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] text-[#a6b0b5] uppercase tracking-wide">
                Built with care by
              </span>
              <a
                href={primoUrl("footer")}
                target="_blank"
                rel="noopener"
                className="hover:opacity-80 transition-opacity"
              >
                <svg width="97" height="22" viewBox="0 0 97 23" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Primo">
                  <path fillRule="evenodd" clipRule="evenodd" d="M16.2959 0.905273H24.4437L24.3582 0.954643L24.4449 0.905373L20.371 7.90659L20.371 3.23968L16.2959 0.905273Z" fill="#FAFAFA"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M4.07422 7.90625H12.222L12.1365 7.95561L12.2232 7.90635L8.14931 14.9076L8.14936 10.2407L4.07422 7.90625Z" fill="#FAFAFA"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M8.14941 0.905273H16.2972L16.2117 0.954643L16.2984 0.905373L12.2245 7.90659L12.2246 3.23968L8.14941 0.905273Z" fill="#FAFAFA"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M12.2227 7.90625H20.3704L20.3703 7.90635L16.2964 14.9076L16.2964 10.2399L12.2227 7.90625Z" fill="#FAFAFA"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M8.14941 14.9082H16.2972L16.2118 14.9575L16.2984 14.9083L12.2245 21.9095L12.2246 17.2426L8.14941 14.9082Z" fill="#FAFAFA"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M0 0.905273H8.14777L8.06222 0.954677L8.14898 0.905373L4.07509 7.90659L4.07514 3.23968L0 0.905273Z" fill="#FAFAFA"/>
                  <path d="M26.6182 22.0002V0.996094H33.3662C34.7397 0.996094 35.9639 1.29534 37.0388 1.89384C38.1137 2.49233 38.9398 3.3003 39.5171 4.31774C40.1143 5.31523 40.4129 6.44239 40.4129 7.69923C40.4129 8.93612 40.1143 10.0633 39.5171 11.0807C38.9398 12.0982 38.1137 12.9061 37.0388 13.5046C35.9639 14.0832 34.7397 14.3724 33.3662 14.3724H30.4699V22.0002H26.6182ZM33.0378 10.6319C33.6748 10.6319 34.2321 10.5022 34.7099 10.2428C35.2075 9.98349 35.5957 9.62439 35.8743 9.16555C36.153 8.7067 36.2924 8.20795 36.2924 7.66931C36.2924 7.13066 36.153 6.63192 35.8743 6.17307C35.5957 5.71423 35.2075 5.35513 34.7099 5.09578C34.2321 4.83643 33.6748 4.70676 33.0378 4.70676H30.4699V10.6319H33.0378Z" fill="#FAFAFA"/>
                  <path d="M42.1624 22.0002V8.05377H51.4484V11.4652H45.7753V22.0002H42.1624Z" fill="#FAFAFA"/>
                  <path d="M53.9778 22.0002V18.4077V11.4652V8.05377H57.7102V18.4077V22.0002H53.9778Z" fill="#FAFAFA"/>
                  <path d="M60.3692 22.0002V8.05377H74.2236C75.3184 8.05377 76.3137 8.31311 77.2094 8.83181C78.1052 9.33055 78.8019 10.0188 79.2995 10.8966C79.8171 11.7744 80.0759 12.742 80.0759 13.7993V22.0002H76.4331V13.8592C76.4331 13.1609 76.2141 12.5923 75.7762 12.1535C75.3383 11.6946 74.771 11.4652 74.0743 11.4652H72.014V22.0002H68.4011V11.4652H63.982V22.0002H60.3692Z" fill="#FAFAFA"/>
                  <path d="M89.1659 22.1813C87.8522 22.1813 86.6379 21.8621 85.5232 21.2237C84.4085 20.5853 83.5227 19.7175 82.8658 18.6202C82.2288 17.523 81.9103 16.316 81.9103 14.9993C81.9103 13.6827 82.2288 12.4757 82.8658 11.3785C83.5227 10.2812 84.4085 9.4134 85.5232 8.775C86.6379 8.13661 87.8522 7.81741 89.1659 7.81741H89.2257C90.5593 7.81741 91.7835 8.13661 92.8983 8.775C94.013 9.4134 94.8888 10.2812 95.5258 11.3785C96.1827 12.4757 96.5112 13.6827 96.5112 14.9993C96.5112 16.316 96.1827 17.523 95.5258 18.6202C94.8888 19.7175 94.013 20.5853 92.8983 21.2237C91.7835 21.8621 90.5593 22.1813 89.2257 22.1813H89.1659ZM89.2257 18.5604C89.8626 18.5604 90.4499 18.4008 90.9873 18.0816C91.5447 17.7424 91.9727 17.3035 92.2712 16.7649C92.5897 16.2063 92.749 15.6178 92.749 14.9993C92.749 14.3609 92.5897 13.7724 92.2712 13.2338C91.9727 12.6752 91.5447 12.2363 90.9873 11.9171C90.4499 11.5979 89.8626 11.4383 89.2257 11.4383H89.1659C88.529 11.4383 87.9417 11.5979 87.4043 11.9171C86.8668 12.2363 86.4389 12.6752 86.1204 13.2338C85.8218 13.7724 85.6725 14.3609 85.6725 14.9993C85.6725 15.6377 85.8218 16.2362 86.1204 16.7948C86.4389 17.3335 86.8668 17.7624 87.4043 18.0816C87.9417 18.4008 88.529 18.5604 89.1659 18.5604H89.2257Z" fill="#FAFAFA"/>
                  <path d="M53.9819 5.42495C54.4995 5.94365 55.1165 6.203 55.8332 6.203C56.5498 6.203 57.1569 5.94365 57.6545 5.42495C58.1721 4.90626 58.4309 4.29779 58.4309 3.59955C58.4309 2.88135 58.1721 2.27288 57.6545 1.77414C57.1569 1.25544 56.5498 0.996094 55.8332 0.996094C55.1165 0.996094 54.4995 1.25544 53.9819 1.77414C53.4843 2.27288 53.2354 2.88135 53.2354 3.59955C53.2354 4.29779 53.4843 4.90626 53.9819 5.42495Z" fill="#FAFAFA"/>
                </svg>
              </a>
            </div>

            {/* Tagline */}
            <p className="text-[12px] leading-[1.6] text-[#fffbf4]">
              We believe that strong foundations create strong companies. That's why we're building the all-in-one IT platform for companies on their growth from 2 to 2000 employees.
            </p>
          </div>

          {/* Copyright */}
          <p className="text-[12px] text-[#a6b0b5]">
            ©2026 Primo. All Rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
