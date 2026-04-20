export type PolicyClass = "User" | "Machine" | "Both";

export type RegistryValue =
  | { kind: "decimal"; value: number }
  | { kind: "longDecimal"; value: number }
  | { kind: "string"; value: string }
  | { kind: "delete" };

export interface AdmxNamespace {
  prefix: string;
  namespace: string;
}

export interface AdmxCategory {
  name: string;
  displayName: string;
  parentRef?: string;
}

export interface SupportedOnDefinition {
  name: string;
  displayName: string;
}

interface ElementBase {
  id: string;
  valueName?: string;
  label?: string;
  required?: boolean;
}

export interface BooleanElement extends ElementBase {
  type: "boolean";
  trueValue?: RegistryValue;
  falseValue?: RegistryValue;
}

export interface DecimalElement extends ElementBase {
  type: "decimal";
  minValue?: number;
  maxValue?: number;
  storeAsText?: boolean;
}

export interface TextElement extends ElementBase {
  type: "text";
  maxLength?: number;
  expandable?: boolean;
  soft?: boolean;
}

export interface MultiTextElement extends ElementBase {
  type: "multiText";
  maxLength?: number;
  soft?: boolean;
}

export interface EnumItem {
  displayName: string;
  value: RegistryValue;
}

export interface EnumElement extends ElementBase {
  type: "enum";
  items: EnumItem[];
}

export interface ListElement extends ElementBase {
  type: "list";
  valuePrefix?: string;
  additive?: boolean;
  expandable?: boolean;
  explicitValue?: boolean;
  keyPath?: string;
}

export type PolicyElement =
  | BooleanElement
  | DecimalElement
  | TextElement
  | MultiTextElement
  | EnumElement
  | ListElement;

export interface PolicyDefinition {
  name: string;
  class: PolicyClass;
  displayName: string;
  explainText?: string;
  key: string;
  valueName?: string;
  parentCategory?: string;
  supportedOn?: string;
  presentation?: string;
  enabledValue?: RegistryValue;
  disabledValue?: RegistryValue;
  elements: PolicyElement[];
  categoryPath: string[];
}

export interface AdmxFile {
  id: string;
  admxFileName: string;
  admlFileName?: string;
  targetPrefix: string;
  targetNamespace: string;
  usings: AdmxNamespace[];
  strings: Record<string, string>;
  presentations: Record<string, Record<string, string>>;
  categories: AdmxCategory[];
  policies: PolicyDefinition[];
  supportedOn: SupportedOnDefinition[];
  rawAdmx: string;
  appName: string;
}

export interface CompatibilityResult {
  ingestable: boolean;
  reasons: string[];
}

export type PolicyState = "notConfigured" | "enabled" | "disabled";

export type PolicyScope = "Device" | "User";

export type ListValue = { name: string; data?: string }[];

export type ElementValue =
  | { type: "boolean"; value: boolean }
  | { type: "decimal"; value: number }
  | { type: "text"; value: string }
  | { type: "multiText"; value: string[] }
  | { type: "enum"; value: number }
  | { type: "list"; value: ListValue };

export interface ConfiguredPolicy {
  admxId: string;
  policyName: string;
  state: PolicyState;
  /** Effective scope for the CSP Config URI. For class=Both this is user-selected
   *  (defaulting to Device). For class=Machine/User it is fixed. */
  scope: PolicyScope;
  elements: Record<string, ElementValue>;
  /** When false, the policy is present in the configuration UI but is NOT
   *  emitted into the SyncML export. Any user edit (state/scope/element)
   *  flips this to true automatically. */
  apply: boolean;
}
