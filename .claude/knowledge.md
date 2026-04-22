# CSP Builder — Project Handoff

(Formerly "ADMX → SyncML Builder" — renamed to CSP Builder.)

## What it is

A 100% client-side web app (single HTML file, shareable) that helps MDM admins
build SyncML payloads for Windows CSP policy delivery. Two tracks:

1. **ADMX-backed CSP** — user uploads ADMX/ADML files, app parses them,
   filters CSP-ingestable policies (with rejection reasons for the rest), and
   emits `<Replace>`/`<Delete>` commands targeting
   `./{Device,User}/Vendor/MSFT/Policy/Config/{Area}~Policy~{CatPath}/{Policy}`.
2. **Native CSP** — the full Microsoft Policy CSP catalog (~3,000 settings)
   is bundled from the official DDFv2 Feb 2026 zip. Each setting is editable
   with a format-aware input; emits `<Replace>` with the proper `<Format>` tag
   (bool/int/chr/xml/b64).

Both tracks share: unified searchable list, per-policy **Apply** toggle
(off by default, auto-on on any edit), scope radio for Both-class settings,
five export modes (FleetDM default, plus four SyncBody/SyncML envelope
variants).

## Path

`/Users/ben/dev/test/admx-csp-builder/`

## Stack

React 19 · TypeScript · Vite · TailwindCSS 3 (shadcn-style components,
inlined locally in `src/components/ui/`) · fast-xml-parser · zustand ·
react-dropzone · lucide-react · Radix primitives (Select, Switch,
RadioGroup, Label, Slot).

Build-time: `adm-zip` for DDF extraction, `vite-plugin-singlefile` for the
shareable standalone HTML build.

## Key files

```
src/
├── lib/
│   ├── admx/
│   │   ├── types.ts            # PolicyDefinition, PolicyElement, PolicyClass, PolicyScope, ConfiguredPolicy (apply field), ElementValue union
│   │   ├── parser.ts           # ADMX+ADML parser via fast-xml-parser
│   │   └── compatibility.ts    # checkCompatibility() — accepts Machine/User/Both, rejects wrong registry path, text expandable="true", etc.
│   ├── csp/
│   │   ├── encoder.ts          # ADMX-backed <Data> payload encoder + xmlEscape
│   │   └── syncml.ts           # buildSyncML(files, configured, configuredCsp, {mode}), EXPORT_MODES[]
│   ├── csp-native/
│   │   ├── types.ts            # CspSetting, CspCatalog, CspValue (union by format), ConfiguredCsp, CspAllowed (discriminated)
│   │   ├── catalog.ts          # imports catalog.json, exposes getCspSetting(), cspAreas()
│   │   ├── catalog.json        # generated — 1.5 MB, 3166 settings, 261 areas, committed
│   │   └── encoder.ts          # cspLocUri(), cspDataPayload(), defaultCspValue()
│   ├── samples.ts              # 10 ADMX samples (?raw imports of Chrome/Edge/Firefox/Office/OneDrive/Adobe/etc.)
│   └── utils.ts                # cn() (clsx + tailwind-merge)
├── store/
│   └── useAdmxStore.ts         # Zustand. Has configured + configuredCsp, selectedKey with admx::/csp:: prefix, per-action setters, defaultScopeFor/policyKey/cspKey helpers
├── components/
│   ├── FileUploader.tsx        # dropzone + pre-filled samples multi-select + collapsible loaded files list (default closed)
│   ├── PolicyList.tsx          # unified searchable nested list: ADMX groups (FileCode icon) + CSP area groups (Shield icon). Applied counts, match counts per group. Search filters both. Group state is manual (no auto-expand on search).
│   ├── PolicyEditor.tsx        # thin dispatcher: selectedKey prefix picks AdmxEditor or CspEditor
│   ├── AdmxEditor.tsx          # Apply switch + 3-state radio (Not Configured/Enabled/Disabled; no radio selected when Apply=off) + scope radio (only enabled for Both) + per-element inputs
│   ├── CspEditor.tsx           # Apply switch + scope radio (only enabled for Both-scope settings) + value input (enum→Select, bool→Switch, int→number with min/max, chr→Input, xml→Textarea monospace, b64→Textarea)
│   ├── ExportPanel.tsx         # Export mode Select dropdown, live SyncML preview (<pre>), copy/download
│   └── PolicyElement/
│       ├── ElementInput.tsx    # shadcn-ish inputs: Switch, number, text, Textarea, Select, list table
│       └── defaults.ts         # defaultValueFor(policyElement)
├── App.tsx
└── main.tsx

scripts/
├── build-csp-catalog.mjs       # Parses DDFv2 zip → catalog.json. `npm run build:csp-catalog`
└── csp-ddf/
    └── DDFv2Feb2026.zip        # Microsoft's official DDF zip (committed, 728 KB)

public/samples/                 # 10 real ADMX/ADML bundles (chrome, edge, firefox, office, outlook, word, onedrive, acrobat-dc, reader-dc, edge-update). All UTF-8 (converted from UTF-16 for a few MSFT ones).
```

## Scripts

```bash
npm install
npm run dev                # http://localhost:5173
npm run build              # tsc -b && vite build → dist/
npm run build:singlefile   # dist-singlefile/index.html (~7.7 MB, emailable, bundles app + 10 ADMX + CSP catalog)
npm run build:csp-catalog  # Regenerate catalog.json from the DDF zip
npm run lint               # ESLint, must pass clean
```

## Export modes (dropdown in ExportPanel)

1. **FleetDM compatible** *(default)* — bare top-level `<Replace>`/`<Delete>`,
   no envelope, **no inline ADMX ingestion** (FleetDM expects ingestion in a
   separate profile — confirmed via their docs).
2. **ADMX Ingestion + Full SyncML envelope** — `<SyncML>`/`<SyncHdr>`/
   `<SyncBody>` + ingestion CDATA + Config commands + `<Final/>`.
3. **ADMX Ingestion (SyncBody only)** — `<SyncBody>` + ingestion + commands,
   no outer `<SyncML>`.
4. **Full SyncML envelope (no ingestion)** — envelope without the ingestion
   `<Replace>`.
5. **SyncBody only (no ingestion)** — just `<SyncBody>` + commands.

## Apply semantics (shared)

- Every policy/CSP has an **Apply** switch, off by default.
- Apply=off → not emitted in SyncML (all 5 modes).
- Any edit to state / scope / element value / CSP value auto-flips Apply=on.
- Values persist when toggling Apply off then on.
- Store actions take the ADMX class (or use CSP scope) to compute default
  scope when creating a new configured entry.
- For ADMX: when Apply is off, the three State radios (Not Configured /
  Enabled / Disabled) are all visually unchecked via `value={apply ? state : ""}`.

## CSP catalog internals

- Source: `DDFv2Feb2026.zip`, 313 XML files.
- Parser walks `<Node>` trees under `./Device/Vendor/MSFT/Policy/Config` and
  `./User/Vendor/MSFT/Policy/Config`. Merges Device+User into a single entry
  with `scope: "Both"` when the same path exists in both.
- `<MSFT:AllowedValues>` is parsed into `{ kind: "enum", items }`,
  `{ kind: "range", min, max }`, `{ kind: "regex", pattern }`,
  `{ kind: "admx-backed" }`, or `{ kind: "other", raw }`.
- DOCTYPE is stripped before XML parse (fxp rejects OMA-DM public IDs).
- Non-Policy CSPs (BitLocker standalone, WiFi, Defender, etc.) are out of
  scope in v1 — they have XML-payload schemas that would need per-CSP editors.

## Key design decisions

- **Unified list**, not tabs — matches the user's preference. ADMX and CSP
  groups are visually distinct via icons (FileCode vs Shield).
- **Singlefile budget acceptable at ~8 MB** — the CSP catalog is 1.5 MB JSON.
  `edition` bitmask was dropped from catalog because it's unreadable and not
  useful for the end user.
- **Defaults seeded lazily**: store creates a `ConfiguredCsp`/`ConfiguredPolicy`
  on first interaction. SyncML builder uses `defaultCspValue(setting)` when
  Apply=on but `cfg.value` is undefined (user toggled Apply without touching
  the value field).
- **Selection keys are prefixed**: `admx::{admxId}::{policyName}` or
  `csp::{settingId}`. `PolicyEditor` dispatches on the prefix. Helpers
  `policyKey()` / `cspKey()` exported from the store.
- **UTF-8 everywhere**: several Microsoft ADMX ship as UTF-16 LE; they were
  pre-converted at repo-add time so `?raw` imports work without a decode
  step.

## Known limitations

- No value-level validation beyond format (e.g. URL validity, IP ranges).
- List-encoded ADMX elements use `U+F000` as the separator per MSFT docs;
  some MDM pipelines expect a different serialization.
- CSP `xml`/`b64` formats are freeform Textareas — no schema-aware editors.
- Parser surfaces ADMX parse failures as a whole; no partial recovery.
- ~1,580 ADMX policies are filtered out by `checkCompatibility()` — usually
  because the registry key is outside `Software\Policies\` (preference
  tattooing) or an element uses an unsupported type (text with
  `expandable="true"`).
- Only English ADML ship in samples; other locales not bundled.

## Natural next steps (not done)

- Standalone CSPs (BitLocker config, WiFi Profile, Email, DeviceLock
  complex tree) — would need per-CSP schemas/templates.
- Policy dependencies from DDF (`<MSFT:DependencyBehavior>`) surfaced in UI.
- Bulk apply / import from existing SyncML XML.
- Export modes: Intune JSON, Jamf Pro XML, generic MDM JSON.
- Tests (no tests currently — architecture keeps lib/ pure for easy unit
  testing if needed).
- Internationalization (strings are currently inlined English; only the
  ADML-pulled strings from samples are already english-locale).

## Gotchas

- `tsc -b` + `vite build` is the canonical build. `resolveJsonModule: true`
  is enabled in `tsconfig.app.json` for the catalog JSON import.
- `lg:grid-cols-[420px_minmax(0,1fr)]` in App.tsx is load-bearing for right
  column overflow — the `minmax(0, 1fr)` is needed because `1fr` defaults to
  `minmax(auto, 1fr)` which allows content to blow out the column width.
- `min-w-0` on the right column + `break-words`/`break-all` on long CSP
  descriptions/keys are also load-bearing.
- fast-xml-parser v5's `isArray(tagName, jPathOrMatcher)` callback returns
  `string | MatcherView` — always coerce with `String(jPath)` before
  comparing.
- The singlefile Vite config uses `publicDir: false` so the `public/samples`
  ADMX are only included via `?raw` imports, not duplicated on disk.
- `/Users/ben/.npm` has root-owned files; use
  `npm install --cache /tmp/npm-cache` if touching deps.

## State at handoff

Everything shipped and verified in-browser. `npm run build`, `npm run lint`,
`npm run build:singlefile` all clean. `dist-singlefile/index.html` = 7.7 MB,
gzip 1.1 MB. Opens via `file://` with full functionality offline.
