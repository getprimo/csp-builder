import type {
  ConfiguredPolicy,
  ElementValue,
  PolicyDefinition,
  PolicyElement,
} from "@/lib/admx/types";

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attrEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function encodeListValue(
  entries: { name: string; data?: string }[],
  explicit: boolean
): string {
  const DELIM = "\uF000";
  if (explicit) {
    return entries
      .map((e) => `${e.name ?? ""}${DELIM}${e.data ?? ""}`)
      .join(DELIM);
  }
  return entries.map((e) => e.name ?? "").join(DELIM);
}

function encodeElementValue(
  element: PolicyElement,
  value: ElementValue | undefined
): string {
  switch (element.type) {
    case "boolean":
      return value?.type === "boolean" && value.value ? "1" : "0";
    case "decimal":
      return String(value?.type === "decimal" ? value.value : 0);
    case "text":
      return value?.type === "text" ? value.value : "";
    case "multiText": {
      const lines = value?.type === "multiText" ? value.value : [];
      return lines.join("\n");
    }
    case "enum": {
      const idx = value?.type === "enum" ? value.value : 0;
      return String(idx);
    }
    case "list": {
      const entries = value?.type === "list" ? value.value : [];
      return encodeListValue(entries, !!element.explicitValue);
    }
  }
}

/**
 * Build the unescaped ADMX-backed payload, e.g.
 *   <enabled/><data id="Foo" value="42"/>
 * Callers that embed this inside SyncML <Data> must XML-escape the result.
 */
export function buildPolicyPayload(
  policy: PolicyDefinition,
  configured: ConfiguredPolicy | undefined
): string | undefined {
  const state = configured?.state ?? "notConfigured";
  if (state === "notConfigured") return undefined;
  if (state === "disabled") return "<disabled/>";

  let inner = "<enabled/>";
  for (const el of policy.elements) {
    const raw = encodeElementValue(el, configured?.elements?.[el.id]);
    inner += `<data id="${attrEscape(el.id)}" value="${attrEscape(raw)}"/>`;
  }
  return inner;
}
