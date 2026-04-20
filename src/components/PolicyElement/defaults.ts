import type { ElementValue, PolicyElement } from "@/lib/admx/types";

export function defaultValueFor(el: PolicyElement): ElementValue {
  switch (el.type) {
    case "boolean":
      return { type: "boolean", value: false };
    case "decimal":
      return { type: "decimal", value: el.minValue ?? 0 };
    case "text":
      return { type: "text", value: "" };
    case "multiText":
      return { type: "multiText", value: [] };
    case "enum":
      return { type: "enum", value: 0 };
    case "list":
      return { type: "list", value: [] };
  }
}
