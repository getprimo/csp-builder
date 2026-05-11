import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type {
  ElementValue,
  ListValue,
  PolicyElement,
} from "@/lib/admx/types";

interface ElementInputProps {
  element: PolicyElement;
  value: ElementValue | undefined;
  onChange(next: ElementValue): void;
}

export function ElementInput({ element, value, onChange }: ElementInputProps) {
  const { t } = useTranslation();
  const labelText = element.label ?? element.id;

  switch (element.type) {
    case "boolean": {
      const v = value?.type === "boolean" ? value.value : false;
      return (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={element.id}>{labelText}</Label>
          <Switch
            id={element.id}
            checked={v}
            onCheckedChange={(checked) =>
              onChange({ type: "boolean", value: checked })
            }
          />
        </div>
      );
    }
    case "decimal": {
      const v = value?.type === "decimal" ? value.value : "";
      return (
        <div className="space-y-1">
          <Label htmlFor={element.id}>{labelText}</Label>
          <Input
            id={element.id}
            type="number"
            min={element.minValue}
            max={element.maxValue}
            value={v as number | ""}
            onChange={(e) =>
              onChange({
                type: "decimal",
                value: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
          {(element.minValue !== undefined || element.maxValue !== undefined) && (
            <p className="text-xs text-muted-foreground">
              {element.minValue ?? "-∞"} … {element.maxValue ?? "+∞"}
            </p>
          )}
        </div>
      );
    }
    case "text": {
      const v = value?.type === "text" ? value.value : "";
      return (
        <div className="space-y-1">
          <Label htmlFor={element.id}>{labelText}</Label>
          <Input
            id={element.id}
            type="text"
            maxLength={element.maxLength}
            value={v}
            onChange={(e) => onChange({ type: "text", value: e.target.value })}
          />
          {element.maxLength !== undefined && (
            <p className="text-xs text-muted-foreground">
              {t("elementInput.maxChars", { count: element.maxLength })}
            </p>
          )}
        </div>
      );
    }
    case "multiText": {
      const lines = value?.type === "multiText" ? value.value : [];
      return (
        <div className="space-y-1">
          <Label htmlFor={element.id}>{labelText}</Label>
          <Textarea
            id={element.id}
            value={lines.join("\n")}
            rows={5}
            onChange={(e) =>
              onChange({
                type: "multiText",
                value: e.target.value.split("\n"),
              })
            }
            placeholder={t("elementInput.onePerLine")}
          />
        </div>
      );
    }
    case "enum": {
      const idx = value?.type === "enum" ? value.value : 0;
      return (
        <div className="space-y-1">
          <Label>{labelText}</Label>
          <Select
            value={String(idx)}
            onValueChange={(v) =>
              onChange({ type: "enum", value: Number(v) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("cspEditor.choosePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {element.items.map((item, i) => (
                <SelectItem key={i} value={String(i)}>
                  {item.displayName ||
                    t("elementInput.optionFallback", { index: i })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case "list": {
      const entries: ListValue = value?.type === "list" ? value.value : [];
      const explicit = !!element.explicitValue;
      const update = (next: ListValue) => onChange({ type: "list", value: next });
      return (
        <div className="space-y-2">
          <Label>{labelText}</Label>
          <div className="border rounded-md divide-y">
            <div className="grid grid-cols-[1fr_auto] gap-2 p-2 text-xs font-semibold text-muted-foreground">
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <span>
                  {explicit
                    ? t("elementInput.name")
                    : t("elementInput.nameValue")}
                </span>
                {explicit && <span>{t("elementInput.data")}</span>}
              </div>
              <span />
            </div>
            {entries.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                {t("elementInput.noEntries")}
              </p>
            )}
            {entries.map((entry, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto] gap-2 p-2 items-center"
              >
                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  <Input
                    value={entry.name}
                    placeholder={t("elementInput.name")}
                    onChange={(e) => {
                      const next = [...entries];
                      next[i] = { ...next[i], name: e.target.value };
                      update(next);
                    }}
                  />
                  {explicit && (
                    <Input
                      value={entry.data ?? ""}
                      placeholder={t("elementInput.data")}
                      onChange={(e) => {
                        const next = [...entries];
                        next[i] = { ...next[i], data: e.target.value };
                        update(next);
                      }}
                    />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => update(entries.filter((_, j) => j !== i))}
                  aria-label={t("elementInput.remove")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update([...entries, { name: "", data: "" }])}
          >
            <Plus className="h-4 w-4 mr-1" /> {t("elementInput.add")}
          </Button>
          {element.valuePrefix && (
            <p className="text-xs text-muted-foreground">
              {t("elementInput.registryPrefix")}{" "}
              <code>{element.valuePrefix}</code>
            </p>
          )}
        </div>
      );
    }
  }
}
