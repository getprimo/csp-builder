import type { CompatibilityResult, PolicyDefinition } from "./types";

const SUPPORTED_ELEMENT_TYPES = new Set([
  "boolean",
  "decimal",
  "enum",
  "text",
  "multiText",
  "list",
]);

const SUPPORTED_CLASSES = new Set<string>(["Machine", "User", "Both"]);

export function checkCompatibility(
  policy: PolicyDefinition
): CompatibilityResult {
  const reasons: string[] = [];

  if (!SUPPORTED_CLASSES.has(policy.class)) {
    reasons.push(`class="${policy.class}" inconnue`);
  }

  const normalizedKey = policy.key.replace(/\//g, "\\").toLowerCase();
  if (!normalizedKey.startsWith("software\\policies\\")) {
    reasons.push(
      `Registre hors Software\\Policies\\ (clé: ${policy.key || "(vide)"})`
    );
  }

  const hasValueName = !!policy.valueName;
  const hasEnabledOrDisabled = !!policy.enabledValue || !!policy.disabledValue;
  const hasElements = policy.elements.length > 0;
  if (!hasValueName && !hasEnabledOrDisabled && !hasElements) {
    reasons.push("Pas de valueName, enabledValue/disabledValue, ni éléments");
  }

  for (const el of policy.elements) {
    if (!SUPPORTED_ELEMENT_TYPES.has(el.type)) {
      reasons.push(`Type d'élément non supporté: ${el.type}`);
      continue;
    }
    if (el.type === "text" && el.expandable) {
      reasons.push(
        `Type 'text' avec expandable=true non supporté (id=${el.id})`
      );
    }
  }

  return { ingestable: reasons.length === 0, reasons };
}
