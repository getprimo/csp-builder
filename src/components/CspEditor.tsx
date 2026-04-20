import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdmxStore } from "@/store/useAdmxStore";
import type { PolicyScope } from "@/lib/admx/types";
import type { CspSetting, CspValue } from "@/lib/csp-native/types";
import { defaultCspValue } from "@/lib/csp-native/encoder";
import { cn } from "@/lib/utils";

interface Props {
  setting: CspSetting;
}

export function CspEditor({ setting }: Props) {
  const cfg = useAdmxStore((s) => s.configuredCsp[setting.id]);
  const setCspValue = useAdmxStore((s) => s.setCspValue);
  const setCspScope = useAdmxStore((s) => s.setCspScope);
  const setCspApply = useAdmxStore((s) => s.setCspApply);

  const apply = cfg?.apply ?? false;
  const scope: PolicyScope =
    cfg?.scope ?? (setting.scope === "User" ? "User" : "Device");
  const scopeFixed = setting.scope !== "Both";
  const effectiveValue = cfg?.value ?? defaultCspValue(setting);

  const handleValueChange = (next: CspValue) => {
    setCspValue(setting.id, next);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate">{setting.name}</CardTitle>
            <CardDescription className="break-all">
              <span className="font-mono text-xs">
                Policy/{setting.path.join("/")}
              </span>{" "}
              · scope{" "}
              <Badge variant="outline" className="align-middle">
                {setting.scope}
              </Badge>{" "}
              · format{" "}
              <Badge variant="outline" className="align-middle">
                {setting.format}
              </Badge>
            </CardDescription>
          </div>
          <label className="flex items-center gap-2 select-none cursor-pointer">
            <span
              className={cn(
                "text-sm font-medium",
                apply ? "text-foreground" : "text-muted-foreground"
              )}
            >
              Apply
            </span>
            <Switch
              checked={apply}
              onCheckedChange={(v) => setCspApply(setting.id, v)}
            />
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {setting.description && (
          <div className="text-sm text-muted-foreground whitespace-pre-line break-words rounded-md bg-muted/50 p-3">
            {setting.description}
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1 break-all">
          <div>
            <span className="font-semibold">LocURI: </span>
            <code>
              {scope === "User" ? "./User" : "./Device"}/Vendor/MSFT/Policy/Config/
              {setting.path.join("/")}
            </code>
          </div>
          {setting.defaultValue !== undefined && (
            <div>
              <span className="font-semibold">Default: </span>
              <code>{setting.defaultValue}</code>
            </div>
          )}
          {setting.applicability?.osBuild && (
            <div>
              <span className="font-semibold">OS build: </span>
              <code>{setting.applicability.osBuild}</code>
              {setting.applicability.cspVersion && (
                <>
                  {" · "}
                  <span className="font-semibold">CSP: </span>
                  <code>{setting.applicability.cspVersion}</code>
                </>
              )}
            </div>
          )}
          {setting.deprecated && (
            <div className="text-amber-700">
              ⚠ Deprecated
              {setting.osBuildDeprecated
                ? ` from build ${setting.osBuildDeprecated}`
                : ""}
            </div>
          )}
        </div>

        <div className={cn("space-y-5 transition-opacity", !apply && "opacity-60")}>
          <div>
            <Label className="mb-2 block">
              CSP scope{scopeFixed ? " (fixed by DDF scope)" : ""}
            </Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) => setCspScope(setting.id, v as PolicyScope)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="Device"
                  id={`${setting.id}-scope-device`}
                  disabled={scopeFixed}
                />
                <Label htmlFor={`${setting.id}-scope-device`}>
                  Device (HKLM)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="User"
                  id={`${setting.id}-scope-user`}
                  disabled={scopeFixed}
                />
                <Label htmlFor={`${setting.id}-scope-user`}>User (HKCU)</Label>
              </div>
            </RadioGroup>
          </div>

          <ValueInput
            setting={setting}
            value={effectiveValue}
            onChange={handleValueChange}
          />
        </div>

        {!apply && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            Apply is off — this CSP is <strong>not</strong> emitted in the
            SyncML payload. Flip the toggle, or change the value above, to
            include it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface ValueInputProps {
  setting: CspSetting;
  value: CspValue;
  onChange(next: CspValue): void;
}

function ValueInput({ setting, value, onChange }: ValueInputProps) {
  const allowed = setting.allowed;
  const enumItems = allowed?.kind === "enum" ? allowed.items : undefined;

  if (enumItems && enumItems.length > 0) {
    const current =
      value.format === "int"
        ? String(value.value)
        : value.format === "chr"
          ? value.value
          : "";
    return (
      <div className="space-y-1">
        <Label>Value</Label>
        <Select
          value={current}
          onValueChange={(v) => {
            if (setting.format === "int") {
              onChange({ format: "int", value: Number(v) });
            } else {
              onChange({ format: "chr", value: v });
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {enumItems.map((it, i) => (
              <SelectItem key={i} value={it.value}>
                {it.value} — {it.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  switch (setting.format) {
    case "bool": {
      const checked = value.format === "bool" ? value.value : false;
      return (
        <div className="flex items-center justify-between gap-4">
          <Label>Value</Label>
          <Switch
            checked={checked}
            onCheckedChange={(v) => onChange({ format: "bool", value: v })}
          />
        </div>
      );
    }
    case "int": {
      const v = value.format === "int" ? value.value : 0;
      const range = allowed?.kind === "range" ? allowed : undefined;
      return (
        <div className="space-y-1">
          <Label>Value</Label>
          <Input
            type="number"
            min={range?.min}
            max={range?.max}
            value={v}
            onChange={(e) =>
              onChange({
                format: "int",
                value: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
          {range && (
            <p className="text-xs text-muted-foreground">
              {range.min ?? "-∞"} … {range.max ?? "+∞"}
            </p>
          )}
        </div>
      );
    }
    case "chr": {
      const v = value.format === "chr" ? value.value : "";
      return (
        <div className="space-y-1">
          <Label>Value</Label>
          <Input
            type="text"
            value={v}
            onChange={(e) => onChange({ format: "chr", value: e.target.value })}
          />
        </div>
      );
    }
    case "xml": {
      const v = value.format === "xml" ? value.value : "";
      return (
        <div className="space-y-1">
          <Label>Value (XML)</Label>
          <Textarea
            value={v}
            rows={8}
            className="font-mono text-xs"
            onChange={(e) => onChange({ format: "xml", value: e.target.value })}
          />
        </div>
      );
    }
    case "b64": {
      const v = value.format === "b64" ? value.value : "";
      return (
        <div className="space-y-1">
          <Label>Value (Base64)</Label>
          <Textarea
            value={v}
            rows={5}
            className="font-mono text-xs"
            onChange={(e) => onChange({ format: "b64", value: e.target.value })}
          />
        </div>
      );
    }
  }
}
