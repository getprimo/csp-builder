# ADMX → SyncML Builder

A client-only web demo that:

1. Ingests one or more ADMX files (with optional ADML labels).
2. Filters **CSP-ingestable** (ADMX-backed) policies, with a rejection reason
   for each one that doesn't pass.
3. Provides a dynamic editor to configure the retained policies.
4. Exports the configuration as **SyncML** ready to push via an MDM.

Stack: React 19 · TypeScript · Vite · TailwindCSS · fast-xml-parser · Zustand ·
Radix/shadcn components · react-dropzone.

---

## Running the project

```bash
npm install
npm run dev
# → http://localhost:5173
```

Production build:

```bash
npm run build
npm run preview
```

### Ship the app as a single HTML file

```bash
npm run build:singlefile
# → dist-singlefile/index.html (~6 MB, standalone — 10 ADMX included)
```

The file inlines JS, CSS, favicon, and **all sample ADMX** (Chrome, Edge,
Firefox, Office, OneDrive, Adobe, etc.). It opens directly via `file://` or
can be emailed, dropped on a network share, served static — no server or
runtime fetch required.

### Pre-filled samples

The **"Pre-filled samples"** button opens a multi-select embedding 10 ADMX
downloaded from their official sources or community mirrors, converted to
UTF-8 for `?raw` bundling:

| ID          | Vendor    | Source                                                                  |
|-------------|-----------|-------------------------------------------------------------------------|
| chrome      | Google    | `dl.google.com/.../policy_templates.zip` (official)                     |
| edge        | Microsoft | `edgeupdates.microsoft.com` (CAB `MicrosoftEdgePolicyTemplates`)        |
| edge-update | Microsoft | same CAB                                                                |
| firefox     | Mozilla   | `github.com/mozilla/policy-templates` (official release)                |
| onedrive    | Microsoft | `github.com/bastienperez/admx-onedrive` (community mirror)              |
| acrobat-dc  | Adobe     | `github.com/systmworks/Adobe-DC-ADMX` (extended community template)     |
| reader-dc   | Adobe     | `github.com/nsacyber/Windows-Secure-Host-Baseline`                      |
| office      | Microsoft | `github.com/iothacker/Microsoft-Office-365-Business-Group-Policy-ADMX…` |
| word        | Microsoft | same repo (word16-365)                                                  |
| outlook     | Microsoft | same repo (outlk16-365)                                                 |

With all samples checked, the app loads ≈ 4,000 ADMX policies of which
≈ 2,400 pass the CSP filter.

---

## CSP compatibility rules

A policy is **ingestable** iff all of the following hold:

- `class` is `Machine`, `User`, or `Both` (all three are supported by CSP).
- `key` starts with `Software\Policies\` (case-insensitive, `\` or `/`).
- Every `elements` entry uses a supported type (see the table below).
- The policy exposes at least one storage mechanism: `valueName`,
  `enabledValue`/`disabledValue`, **or** at least one element.
- `text` elements must not be `expandable="true"`.

### Machine / User scope

- `class="Machine"` → pushed under `./Device/Vendor/MSFT/Policy/Config/…` (HKLM).
- `class="User"` → pushed under `./User/Vendor/MSFT/Policy/Config/…` (HKCU).
- `class="Both"` → admin chooses per policy (Device by default). The editor
  exposes a **Device (HKLM) / User (HKCU)** toggle when the policy is Both.

ADMX ingestion always happens under
`./Device/Vendor/MSFT/Policy/ConfigOperations/ADMXInstall/…` (visible from both
scopes on current Windows 10/11). Chrome, Edge, and Firefox use `class="Both"`
everywhere and work seamlessly this way.

Rejected policies are listed in grey with their exact reason ("Registry
outside `Software\Policies\`", "Type 'text' with `expandable=true` not
supported", etc.).

### Supported element types

| ADMX type   | UI rendering                       | CSP encoding (`<data value="…"/>`) |
|-------------|------------------------------------|------------------------------------|
| `boolean`   | Switch                             | `0`/`1`                            |
| `decimal`   | Number input (min/max)             | integer as text                    |
| `longDecimal`| Number input                      | integer as text                    |
| `text`      | Text input (maxLength)             | raw text                           |
| `multiText` | Textarea (one value per line)      | lines joined by `\n`               |
| `enum`      | Select                             | **index** (0-based) of the item    |
| `list`      | Add-able key/value table           | entries joined by `\uF000`         |

### Not supported (rejected)

- `expandableString` / `text expandable="true"` — require environment variable
  expansion on the device, not transmitted through CSP.
- Policies whose registry key is outside `Software\Policies\` (preference
  tattooing, not a CSP pattern).
- Any `element` whose tag isn't in the table above.

---

## Apply toggle (per policy)

Each policy has an **Apply** switch in the editor, off by default. A policy is
emitted in the SyncML payload **only when Apply is on**. The state radio
(Not Configured / Enabled / Disabled) and the element values are still
editable with Apply off — they're just gated by the switch.

Editing any setting (state, scope, an element value) flips Apply to on
automatically — the user doesn't have to remember to toggle it.

Turning Apply off removes the policy from the SyncML payload while preserving
the configured values, so the user can flip it back on at any time without
retyping.

---

## Export

The Export panel offers a **Format** dropdown with five presets:

| Preset | Outer wrapper | Ingestion included | Use case |
|--------|--------------|--------------------|----------|
| **FleetDM compatible** (default) | none (bare top-level tags) | **no** — ingest ADMX through a separate FleetDM profile | Paste straight into a FleetDM Windows MDM command profile |
| ADMX Ingestion + Full SyncML envelope | `<SyncML>` + `<SyncHdr>` + `<SyncBody>` | yes | Classic DM session payload |
| ADMX Ingestion (SyncBody only) | `<SyncBody>` + `<Final/>` | yes | When the caller injects its own SyncHdr |
| Full SyncML envelope (no ingestion) | `<SyncML>` + `<SyncHdr>` + `<SyncBody>` | no | Target already has the ADMX registered |
| SyncBody only (no ingestion) | `<SyncBody>` + `<Final/>` | no | Minimal policy fragment |

Two kinds of commands are produced (wrapped or not, depending on the preset):

### 1) ADMX ingestion — once per file with at least one applied policy

```xml
<Replace>
  <CmdID>1</CmdID>
  <Item>
    <Target>
      <LocURI>./Device/Vendor/MSFT/Policy/ConfigOperations/ADMXInstall/{AppName}/Policy/{UniqueID}</LocURI>
    </Target>
    <Meta><Format xmlns="syncml:metinf">chr</Format></Meta>
    <Data><![CDATA[… raw ADMX …]]></Data>
  </Item>
</Replace>
```

### 2) Policy application

```xml
<Replace>
  <CmdID>2</CmdID>
  <Item>
    <Target>
      <LocURI>./Device/Vendor/MSFT/Policy/Config/{AreaName}~Policy~{CategoryPath}/{PolicyName}</LocURI>
    </Target>
    <Meta><Format xmlns="syncml:metinf">chr</Format></Meta>
    <Data>&lt;enabled/&gt;&lt;data id="ElementId" value="123"/&gt;</Data>
  </Item>
</Replace>
```

- `AreaName` = ADMX prefix (`chrome`, `microsoft_edge`, …).
- `CategoryPath` = parent categories joined by `~`.
- Scope (`Device` vs `User`) follows the policy's `class`.
- `Not Configured` → `<Delete>` instead of `<Replace>`.
- `Disabled` → `<Data>&lt;disabled/&gt;</Data>`.
- `Enabled` with no elements → `<Data>&lt;enabled/&gt;</Data>`.
- `Enabled` with elements → `<enabled/>` followed by one
  `<data id=… value=…/>` per element, the whole thing XML-escaped inside
  `<Data>`.

Click **"Download .xml"** to save as `policies.syncml.xml`, or **"Copy"** to
drop it into the clipboard.

---

## Architecture

```
src/
├─ lib/
│  ├─ admx/
│  │   ├─ types.ts          # PolicyDefinition, PolicyElement, …
│  │   ├─ parser.ts         # ADMX + ADML → AdmxFile
│  │   └─ compatibility.ts  # checkCompatibility()
│  ├─ csp/
│  │   ├─ encoder.ts        # buildPolicyPayload()
│  │   └─ syncml.ts         # buildSyncML()
│  └─ samples.ts            # 10 pre-filled ADMX bundles (?raw imports)
├─ store/
│  └─ useAdmxStore.ts       # Zustand store (files + configured values)
├─ components/
│  ├─ FileUploader.tsx
│  ├─ PolicyList.tsx        # nested by ADMX, searchable
│  ├─ PolicyEditor.tsx      # includes the Apply toggle
│  ├─ ExportPanel.tsx
│  ├─ PolicyElement/ElementInput.tsx
│  └─ ui/                   # buttons, inputs, shadcn-style primitives
└─ App.tsx
```

The separation between pure logic (`lib/`) and UI (`components/`) lets you
unit-test `parser`, `compatibility`, `encoder`, and `syncml` without mounting
React. No tests ship in v1, but the architecture is ready for them.

---

## Known limitations

- List encoding uses `U+F000` as the separator (per MSFT docs); some MDM
  pipelines expect a different serialization.
- The parser surfaces parse failures as a whole rather than partial recovery.
- No value-level validation (e.g. URL validity, port ranges) — the value is
  encoded as-is.
