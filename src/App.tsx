import { FileUploader } from "@/components/FileUploader";
import { PolicyList } from "@/components/PolicyList";
import { PolicyEditor } from "@/components/PolicyEditor";
import { ExportPanel } from "@/components/ExportPanel";
import { useAdmxStore } from "@/store/useAdmxStore";

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      Load an ADMX file (and its ADML) to get started, or pick one from the
      pre-filled samples above.
    </div>
  );
}

function App() {
  const hasFiles = useAdmxStore((s) => s.files.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container py-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            ADMX → SyncML Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            Drop ADMX/ADML files, configure CSP-ingestable policies, export a
            SyncML payload ready for MDM delivery.
          </p>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <FileUploader />

        {!hasFiles && <EmptyState />}

        {hasFiles && (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-6 items-start">
            <PolicyList />
            <div className="space-y-6 min-w-0">
              <PolicyEditor />
              <ExportPanel />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t">
        <div className="container py-3 text-xs text-muted-foreground">
          Client-only demo · fast-xml-parser · Tailwind · Zustand
        </div>
      </footer>
    </div>
  );
}

export default App;
