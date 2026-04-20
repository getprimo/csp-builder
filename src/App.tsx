import { FileUploader } from "@/components/FileUploader";
import { PolicyList } from "@/components/PolicyList";
import { PolicyEditor } from "@/components/PolicyEditor";
import { ExportPanel } from "@/components/ExportPanel";
import { PrimoRibbon } from "@/components/PrimoRibbon";
import { primoUrl } from "@/lib/primo";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <PrimoRibbon />

      <header className="border-b">
        <div className="container py-5">
          <h1 className="text-2xl font-semibold tracking-tight">
            ADMX → SyncML Builder
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
        <FileUploader />

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
              href={primoUrl("cta_mdm", "/mdm")}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              See Primo for MDM
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
              href={primoUrl("footer_mdm", "/mdm")}
              target="_blank"
              rel="noopener"
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              MDM
            </a>
            {" · "}
            <a
              href={primoUrl("footer_onboarding", "/onboarding")}
              target="_blank"
              rel="noopener"
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              Onboarding
            </a>
            {" · "}
            <a
              href={primoUrl("footer_saas", "/saas")}
              target="_blank"
              rel="noopener"
              className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
            >
              SaaS
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
