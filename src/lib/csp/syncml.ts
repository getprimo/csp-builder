import { checkCompatibility } from "@/lib/admx/compatibility";
import type {
  AdmxFile,
  ConfiguredPolicy,
  PolicyDefinition,
} from "@/lib/admx/types";
import type { ConfiguredCsp } from "@/lib/csp-native/types";
import { getCspSetting } from "@/lib/csp-native/catalog";
import {
  cspDataPayload,
  cspLocUri,
  defaultCspValue,
} from "@/lib/csp-native/encoder";
import { buildPolicyPayload, xmlEscape } from "./encoder";

export type ExportMode =
  | "fleetdm"
  | "envelope-with-ingestion"
  | "envelope-only"
  | "body-with-ingestion"
  | "body-only";

export interface ExportModeInfo {
  id: ExportMode;
  label: string;
  description: string;
}

export const EXPORT_MODES: ExportModeInfo[] = [
  {
    id: "fleetdm",
    label: "FleetDM compatible",
    description:
      "Raw top-level <Replace>/<Delete> commands — policy ops only, no envelope, no inline ADMX ingestion. Ingest custom ADMX through a separate FleetDM profile before applying.",
  },
  {
    id: "envelope-with-ingestion",
    label: "ADMX Ingestion + Full SyncML envelope",
    description:
      "Full <SyncML> + <SyncHdr> + <SyncBody>, ADMX ingested inline, policy commands inside, closing <Final/>.",
  },
  {
    id: "body-with-ingestion",
    label: "ADMX Ingestion (SyncBody only)",
    description:
      "<SyncBody> fragment with ADMX ingestion and policy commands. No outer <SyncML>/<SyncHdr>.",
  },
  {
    id: "envelope-only",
    label: "Full SyncML envelope (no ingestion)",
    description:
      "Full <SyncML> envelope, but skip the ADMX ingestion <Replace>. Useful when the ADMX is already uploaded on the target.",
  },
  {
    id: "body-only",
    label: "SyncBody only (no ingestion)",
    description: "Just a <SyncBody> fragment with policy commands, nothing else.",
  },
];

export interface SyncMLOptions {
  mode?: ExportMode;
}

function uriSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9._~-]/g, "_");
}

function sanitizeAppName(name: string): string {
  return uriSafe(name.trim() || "App");
}

function sanitizeUniqueId(file: AdmxFile): string {
  const base = file.targetNamespace || file.targetPrefix || file.admxFileName;
  return uriSafe(base.replace(/^.*\./, "") || "Policy");
}

function policyScope(
  policy: PolicyDefinition,
  configuredScope: "Device" | "User" | undefined
): "Device" | "User" {
  if (policy.class === "User") return "User";
  if (policy.class === "Machine") return "Device";
  // Both: honor the user's per-policy choice, falling back to Device.
  return configuredScope ?? "Device";
}

function ingestionScope(file: AdmxFile): "Device" | "User" {
  // Ingest under Device by default. ADMX installed at Device is visible to both
  // ./Device/Vendor/MSFT/Policy/Config and ./User/Vendor/MSFT/Policy/Config on
  // current Windows builds, which keeps the payload small for Both policies.
  void file;
  return "Device";
}

function areaUri(
  file: AdmxFile,
  policy: PolicyDefinition,
  configuredScope: "Device" | "User" | undefined
): string {
  const scope = policyScope(policy, configuredScope);
  const appName = sanitizeAppName(file.targetPrefix);
  const catPath = policy.categoryPath.map(uriSafe).join("~");
  const area = catPath ? `${appName}~Policy~${catPath}` : `${appName}~Policy`;
  return `./${scope}/Vendor/MSFT/Policy/Config/${area}/${uriSafe(policy.name)}`;
}

function ingestionUri(file: AdmxFile): string {
  const scope = ingestionScope(file);
  const appName = sanitizeAppName(file.targetPrefix);
  const uniqueId = sanitizeUniqueId(file);
  return `./${scope}/Vendor/MSFT/Policy/ConfigOperations/ADMXInstall/${appName}/Policy/${uniqueId}`;
}

interface CommandArgs {
  cmdId: number;
  locUri: string;
  format: string;
  data?: string;
  kind: "Replace" | "Delete";
  dataIsCData?: boolean;
}

function commandXml(args: CommandArgs): string {
  const { cmdId, locUri, format, data, kind, dataIsCData } = args;
  const dataBlock =
    kind === "Delete"
      ? ""
      : dataIsCData
        ? `\n      <Data><![CDATA[${data ?? ""}]]></Data>`
        : `\n      <Data>${data ?? ""}</Data>`;
  const metaBlock =
    kind === "Delete"
      ? ""
      : `\n      <Meta><Format xmlns="syncml:metinf">${format}</Format></Meta>`;
  return `  <${kind}>
    <CmdID>${cmdId}</CmdID>
    <Item>
      <Target>
        <LocURI>${xmlEscape(locUri)}</LocURI>
      </Target>${metaBlock}${dataBlock}
    </Item>
  </${kind}>`;
}

export function buildSyncML(
  files: AdmxFile[],
  configured: Record<string, ConfiguredPolicy>,
  configuredCsp: Record<string, ConfiguredCsp> = {},
  opts: SyncMLOptions = {}
): string {
  const mode: ExportMode = opts.mode ?? "fleetdm";
  const includeIngestion =
    mode === "envelope-with-ingestion" || mode === "body-with-ingestion";
  const wrapMode: "full" | "body" | "raw" =
    mode === "fleetdm"
      ? "raw"
      : mode === "envelope-with-ingestion" || mode === "envelope-only"
        ? "full"
        : "body";

  let cmdId = 1;
  const parts: string[] = [];

  const filesById = new Map<string, AdmxFile>();
  for (const f of files) filesById.set(f.id, f);

  const touchedAdmxIds = new Set<string>();
  for (const cfg of Object.values(configured)) {
    if (!cfg.apply) continue;
    if (cfg.state !== "notConfigured") touchedAdmxIds.add(cfg.admxId);
  }

  if (includeIngestion) {
    for (const file of files) {
      if (!touchedAdmxIds.has(file.id)) continue;
      parts.push(
        commandXml({
          cmdId: cmdId++,
          locUri: ingestionUri(file),
          format: "chr",
          data: file.rawAdmx,
          kind: "Replace",
          dataIsCData: true,
        })
      );
    }
  }

  for (const cfg of Object.values(configured)) {
    if (!cfg.apply) continue;
    const file = filesById.get(cfg.admxId);
    if (!file) continue;
    const policy = file.policies.find((p) => p.name === cfg.policyName);
    if (!policy) continue;
    if (!checkCompatibility(policy).ingestable) continue;

    const uri = areaUri(file, policy, cfg.scope);
    if (cfg.state === "notConfigured") {
      parts.push(
        commandXml({ cmdId: cmdId++, locUri: uri, format: "chr", kind: "Delete" })
      );
      continue;
    }
    const payload = buildPolicyPayload(policy, cfg);
    if (payload === undefined) continue;
    parts.push(
      commandXml({
        cmdId: cmdId++,
        locUri: uri,
        format: "chr",
        data: xmlEscape(payload),
        kind: "Replace",
      })
    );
  }

  // Native CSP commands.
  for (const cfg of Object.values(configuredCsp)) {
    if (!cfg.apply) continue;
    const setting = getCspSetting(cfg.settingId);
    if (!setting) continue;
    const value = cfg.value ?? defaultCspValue(setting);
    const uri = cspLocUri(setting, cfg.scope);
    const { format, data } = cspDataPayload(value, setting);
    parts.push(
      commandXml({
        cmdId: cmdId++,
        locUri: uri,
        format,
        data,
        kind: "Replace",
      })
    );
  }

  if (wrapMode === "raw") {
    // FleetDM: top-level commands with no SyncBody/SyncML/Final wrappers.
    // Emit the inner commands with leading indentation stripped so they sit
    // flush at the start of each line.
    return parts.map((p) => p.replace(/^ {2}/gm, "")).join("\n") + "\n";
  }

  const body = `<SyncBody>
${parts.join("\n")}
  <Final/>
</SyncBody>`;

  if (wrapMode === "body") return body + "\n";

  return `<?xml version="1.0" encoding="UTF-8"?>
<SyncML xmlns="SYNCML:SYNCML1.2">
  <SyncHdr>
    <VerDTD>1.2</VerDTD>
    <VerProto>DM/1.2</VerProto>
    <SessionID>1</SessionID>
    <MsgID>1</MsgID>
  </SyncHdr>
${body}
</SyncML>
`;
}
