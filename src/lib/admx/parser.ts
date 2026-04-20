import { XMLParser } from "fast-xml-parser";
import type {
  AdmxCategory,
  AdmxFile,
  AdmxNamespace,
  BooleanElement,
  DecimalElement,
  EnumElement,
  EnumItem,
  ListElement,
  MultiTextElement,
  PolicyClass,
  PolicyDefinition,
  PolicyElement,
  RegistryValue,
  SupportedOnDefinition,
  TextElement,
} from "./types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName, jPath) => {
    const collectionPaths = new Set([
      "policyDefinitions.policyNamespaces.using",
      "policyDefinitions.categories.category",
      "policyDefinitions.policies.policy",
      "policyDefinitions.supportedOn.definitions.definition",
      "policyDefinitionResources.resources.stringTable.string",
      "policyDefinitionResources.resources.presentationTable.presentation",
    ]);
    if (collectionPaths.has(String(jPath))) return true;
    if (tagName === "item") return true;
    return false;
  },
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function attr(node: unknown, name: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const v = (node as Record<string, unknown>)[`@_${name}`];
  return v === undefined ? undefined : String(v);
}

function attrBool(node: unknown, name: string): boolean | undefined {
  const v = attr(node, name);
  if (v === undefined) return undefined;
  return v === "true" || v === "1";
}

function attrNum(node: unknown, name: string): number | undefined {
  const v = attr(node, name);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function textOf(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") return node;
  if (typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec["#text"] === "string") return rec["#text"];
    if (typeof rec["#text"] === "number") return String(rec["#text"]);
  }
  return undefined;
}

function parseRegistryValue(node: unknown): RegistryValue | undefined {
  if (!node || typeof node !== "object") return undefined;
  const rec = node as Record<string, unknown>;
  if ("decimal" in rec) {
    const v = attrNum(rec.decimal, "value") ?? 0;
    return { kind: "decimal", value: v };
  }
  if ("longDecimal" in rec) {
    const v = attrNum(rec.longDecimal, "value") ?? 0;
    return { kind: "longDecimal", value: v };
  }
  if ("string" in rec) {
    const v = textOf(rec.string) ?? "";
    return { kind: "string", value: v };
  }
  if ("delete" in rec) {
    return { kind: "delete" };
  }
  return undefined;
}

function resolveString(ref: string | undefined, strings: Record<string, string>): string {
  if (!ref) return "";
  const m = /^\$\(string\.([^)]+)\)$/.exec(ref);
  if (!m) return ref;
  const key = m[1];
  return strings[key] ?? `$(string.${key})`;
}

export function parseAdml(admlText: string): {
  strings: Record<string, string>;
  presentations: Record<string, Record<string, string>>;
  appDisplayName?: string;
} {
  const adml = xmlParser.parse(admlText);
  const root = adml.policyDefinitionResources;
  if (!root) throw new Error("Invalid ADML: missing policyDefinitionResources root");

  const strings: Record<string, string> = {};
  const stringNodes = asArray(root?.resources?.stringTable?.string);
  for (const s of stringNodes) {
    const id = attr(s, "id");
    if (!id) continue;
    const val = textOf(s) ?? "";
    strings[id] = val;
  }

  const presentations: Record<string, Record<string, string>> = {};
  const presNodes = asArray(root?.resources?.presentationTable?.presentation);
  for (const p of presNodes) {
    const id = attr(p, "id");
    if (!id) continue;
    const labelByRefId: Record<string, string> = {};
    if (typeof p === "object" && p !== null) {
      for (const [key, val] of Object.entries(p as Record<string, unknown>)) {
        if (key.startsWith("@_") || key === "#text") continue;
        const nodes = Array.isArray(val) ? val : [val];
        for (const n of nodes) {
          const refId = attr(n, "refId");
          if (!refId) continue;
          let lbl: string | undefined;
          if (typeof n === "object" && n !== null) {
            const nrec = n as Record<string, unknown>;
            if (typeof nrec.label === "string") lbl = nrec.label;
            else if (typeof nrec.label === "object" && nrec.label !== null) {
              lbl = textOf(nrec.label);
            }
          }
          if (lbl) labelByRefId[refId] = lbl.trim();
        }
      }
    }
    presentations[id] = labelByRefId;
  }

  let appDisplayName: string | undefined;
  if (typeof root.displayName === "string") appDisplayName = root.displayName;
  else if (typeof root.displayName === "object" && root.displayName) {
    appDisplayName = textOf(root.displayName);
  }

  return { strings, presentations, appDisplayName };
}

function parseElements(
  elementsNode: unknown,
  policyValueName: string | undefined,
  strings: Record<string, string>
): PolicyElement[] {
  if (!elementsNode || typeof elementsNode !== "object") return [];
  const rec = elementsNode as Record<string, unknown>;
  const out: PolicyElement[] = [];

  for (const [tag, raw] of Object.entries(rec)) {
    if (tag.startsWith("@_") || tag === "#text") continue;
    const nodes = Array.isArray(raw) ? raw : [raw];
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const id = attr(n, "id");
      if (!id) continue;
      const valueName = attr(n, "valueName") ?? policyValueName;
      const required = attrBool(n, "required");
      const base = { id, valueName, required } as const;

      switch (tag) {
        case "boolean": {
          const nrec = n as Record<string, unknown>;
          const el: BooleanElement = {
            type: "boolean",
            ...base,
            trueValue: parseRegistryValue(nrec.trueValue),
            falseValue: parseRegistryValue(nrec.falseValue),
          };
          out.push(el);
          break;
        }
        case "decimal":
        case "longDecimal": {
          const el: DecimalElement = {
            type: "decimal",
            ...base,
            minValue: attrNum(n, "minValue"),
            maxValue: attrNum(n, "maxValue"),
            storeAsText: attrBool(n, "storeAsText"),
          };
          out.push(el);
          break;
        }
        case "text": {
          const el: TextElement = {
            type: "text",
            ...base,
            maxLength: attrNum(n, "maxLength"),
            expandable: attrBool(n, "expandable"),
            soft: attrBool(n, "soft"),
          };
          out.push(el);
          break;
        }
        case "multiText": {
          const el: MultiTextElement = {
            type: "multiText",
            ...base,
            maxLength: attrNum(n, "maxLength"),
            soft: attrBool(n, "soft"),
          };
          out.push(el);
          break;
        }
        case "enum": {
          const nrec = n as Record<string, unknown>;
          const items: EnumItem[] = [];
          for (const it of asArray(nrec.item)) {
            if (!it || typeof it !== "object") continue;
            const dn = attr(it, "displayName") ?? "";
            const value = parseRegistryValue((it as Record<string, unknown>).value);
            if (!value) continue;
            items.push({ displayName: resolveString(dn, strings), value });
          }
          const el: EnumElement = { type: "enum", ...base, items };
          out.push(el);
          break;
        }
        case "list": {
          const el: ListElement = {
            type: "list",
            ...base,
            valuePrefix: attr(n, "valuePrefix"),
            additive: attrBool(n, "additive"),
            expandable: attrBool(n, "expandable"),
            explicitValue: attrBool(n, "explicitValue"),
            keyPath: attr(n, "key"),
          };
          out.push(el);
          break;
        }
        default:
          // unknown element type — keep as unsupported marker
          break;
      }
    }
  }
  return out;
}

function buildCategoryPath(
  leafRef: string | undefined,
  byName: Map<string, AdmxCategory>
): string[] {
  const path: string[] = [];
  if (!leafRef) return path;
  let current = byName.get(stripCategoryNamespace(leafRef));
  const visited = new Set<string>();
  while (current && !visited.has(current.name)) {
    visited.add(current.name);
    path.unshift(current.name);
    if (!current.parentRef) break;
    current = byName.get(stripCategoryNamespace(current.parentRef));
  }
  return path;
}

function stripCategoryNamespace(ref: string): string {
  const idx = ref.indexOf(":");
  return idx >= 0 ? ref.slice(idx + 1) : ref;
}

export function parseAdmx(
  admxText: string,
  admlText?: string,
  opts: { admxFileName?: string; admlFileName?: string; id?: string } = {}
): AdmxFile {
  const admx = xmlParser.parse(admxText);
  const root = admx.policyDefinitions;
  if (!root) throw new Error("Invalid ADMX: missing policyDefinitions root");

  const admlParsed = admlText
    ? parseAdml(admlText)
    : { strings: {}, presentations: {}, appDisplayName: undefined };
  const strings = admlParsed.strings;
  const presentations = admlParsed.presentations;

  const target = root?.policyNamespaces?.target;
  const targetPrefix = attr(target, "prefix") ?? "unknown";
  const targetNamespace = attr(target, "namespace") ?? "unknown";

  const usings: AdmxNamespace[] = asArray(root?.policyNamespaces?.using).map(
    (u) => ({
      prefix: attr(u, "prefix") ?? "",
      namespace: attr(u, "namespace") ?? "",
    })
  );

  const supportedOn: SupportedOnDefinition[] = asArray(
    root?.supportedOn?.definitions?.definition
  ).map((d) => ({
    name: attr(d, "name") ?? "",
    displayName: resolveString(attr(d, "displayName"), strings),
  }));

  const categories: AdmxCategory[] = asArray(root?.categories?.category).map(
    (c) => ({
      name: attr(c, "name") ?? "",
      displayName: resolveString(attr(c, "displayName"), strings),
      parentRef: attr(
        (c as Record<string, unknown>).parentCategory as Record<string, unknown>,
        "ref"
      ),
    })
  );
  const catByName = new Map<string, AdmxCategory>();
  for (const c of categories) catByName.set(c.name, c);

  const policies: PolicyDefinition[] = asArray(root?.policies?.policy).map(
    (p) => {
      const name = attr(p, "name") ?? "";
      const cls = (attr(p, "class") ?? "Both") as PolicyClass;
      const key = attr(p, "key") ?? "";
      const valueName = attr(p, "valueName");
      const presentationRef = attr(p, "presentation");
      const presentationId = presentationRef
        ? /^\$\(presentation\.([^)]+)\)$/.exec(presentationRef)?.[1]
        : undefined;

      const parent = (p as Record<string, unknown>).parentCategory as
        | Record<string, unknown>
        | undefined;
      const parentRef = attr(parent, "ref");

      const supportedOnNode = (p as Record<string, unknown>).supportedOn as
        | Record<string, unknown>
        | undefined;
      const supportedOnRef = attr(supportedOnNode, "ref");

      const enabledValue = parseRegistryValue(
        (p as Record<string, unknown>).enabledValue
      );
      const disabledValue = parseRegistryValue(
        (p as Record<string, unknown>).disabledValue
      );

      const elementsNode = (p as Record<string, unknown>).elements;
      const rawElements = parseElements(elementsNode, valueName, strings);

      const presentationMap = presentationId
        ? presentations[presentationId] ?? {}
        : {};

      const elements = rawElements.map((el) => ({
        ...el,
        label: presentationMap[el.id] ?? el.label,
      }));

      return {
        name,
        class: cls,
        displayName: resolveString(attr(p, "displayName"), strings),
        explainText: resolveString(attr(p, "explainText"), strings),
        key,
        valueName,
        parentCategory: parentRef,
        supportedOn: supportedOnRef,
        presentation: presentationId,
        enabledValue,
        disabledValue,
        elements,
        categoryPath: buildCategoryPath(parentRef, catByName),
      };
    }
  );

  const appName =
    admlParsed.appDisplayName ??
    targetPrefix ??
    opts.admxFileName?.replace(/\.admx$/i, "") ??
    "App";

  return {
    id:
      opts.id ??
      `${targetPrefix}-${Math.random().toString(36).slice(2, 8)}`,
    admxFileName: opts.admxFileName ?? "policy.admx",
    admlFileName: opts.admlFileName,
    targetPrefix,
    targetNamespace,
    usings,
    strings,
    presentations,
    categories,
    policies,
    supportedOn,
    rawAdmx: admxText,
    appName,
  };
}
