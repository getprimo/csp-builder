import type { PolicyScope } from "@/lib/admx/types";

export type CspFormat = "bool" | "int" | "chr" | "xml" | "b64";

export interface CspEnumItem {
  value: string;
  description: string;
}

export type CspAllowed =
  | { kind: "enum"; items: CspEnumItem[] }
  | { kind: "range"; min?: number; max?: number; raw?: string }
  | { kind: "regex"; pattern: string }
  | { kind: "admx-backed" }
  | { kind: "other"; raw?: string };

export interface CspApplicability {
  osBuild?: string;
  cspVersion?: string;
}

export interface CspSetting {
  /** e.g. "AboveLock/AllowActionCenterNotifications" (scope-agnostic). */
  id: string;
  /** Top-level area, e.g. "AboveLock". */
  area: string;
  /** Leaf node name. */
  name: string;
  /** Path segments below `./{Device,User}/Vendor/MSFT/Policy/Config`. */
  path: string[];
  scope: PolicyScope | "Both";
  format: CspFormat;
  description?: string;
  defaultValue?: string;
  allowed?: CspAllowed;
  applicability?: CspApplicability;
  deprecated?: boolean;
  osBuildDeprecated?: string;
}

export interface CspCatalog {
  generatedAt: string;
  source: string;
  settingCount: number;
  settings: CspSetting[];
}

export type CspValue =
  | { format: "bool"; value: boolean }
  | { format: "int"; value: number }
  | { format: "chr"; value: string }
  | { format: "xml"; value: string }
  | { format: "b64"; value: string };

export interface ConfiguredCsp {
  settingId: string;
  scope: PolicyScope;
  value?: CspValue;
  apply: boolean;
}
