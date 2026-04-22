import type { ElementValue, PolicyScope, PolicyState } from "@/lib/admx/types";

export type CspFormat = "bool" | "int" | "chr" | "xml" | "b64";

/**
 * Payload-ready element schema for an ADMX-backed native CSP.
 * All `value` fields here are already the strings that go into
 * `<data id="…" value="…"/>` — no further resolution needed at emit time.
 */
interface CspAdmxElementBase {
  id: string;
  label?: string;
  required?: boolean;
}

export interface CspAdmxBooleanElement extends CspAdmxElementBase {
  type: "boolean";
  trueValue: string;
  falseValue: string;
}

export interface CspAdmxDecimalElement extends CspAdmxElementBase {
  type: "decimal";
  minValue?: number;
  maxValue?: number;
}

export interface CspAdmxTextElement extends CspAdmxElementBase {
  type: "text";
  maxLength?: number;
}

export interface CspAdmxMultiTextElement extends CspAdmxElementBase {
  type: "multiText";
}

export interface CspAdmxEnumElement extends CspAdmxElementBase {
  type: "enum";
  items: { displayName: string; value: string }[];
}

export interface CspAdmxListElement extends CspAdmxElementBase {
  type: "list";
  explicitValue?: boolean;
}

export type CspAdmxElement =
  | CspAdmxBooleanElement
  | CspAdmxDecimalElement
  | CspAdmxTextElement
  | CspAdmxMultiTextElement
  | CspAdmxEnumElement
  | CspAdmxListElement;

export interface CspAdmxMeta {
  elements: CspAdmxElement[];
  explainText?: string;
  displayName?: string;
}

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
  /**
   * ADMX policy schema matched from the Windows PolicyDefinitions mirror.
   * Present only for ADMX-backed CSPs whose area was resolved to a bundled
   * ADMX file. When present, the UI renders structured inputs and the
   * exporter emits a proper `<enabled/><data…/>` payload.
   */
  admx?: CspAdmxMeta;
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
  /**
   * Scalar value for regular native CSPs (bool / int / chr / xml / b64) and
   * fallback for ADMX-backed CSPs without a bundled ADMX schema.
   */
  value?: CspValue;
  /**
   * Enabled / Disabled / Not Configured state for ADMX-backed CSPs that have
   * a bundled ADMX schema (`setting.admx` present).
   */
  admxState?: PolicyState;
  /**
   * Per-element values (keyed by element id) for ADMX-backed CSPs with a
   * bundled ADMX schema. Uses the same `ElementValue` union as the uploaded
   * ADMX flow so the editor can share input components.
   */
  admxElements?: Record<string, ElementValue>;
  apply: boolean;
}
