import { Trans, useTranslation } from "react-i18next";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdmxStore } from "@/store/useAdmxStore";
import type {
  ElementValue,
  PolicyScope,
  PolicyState,
} from "@/lib/admx/types";
import type {
  CspAdmxElement,
  CspSetting,
  CspValue,
} from "@/lib/csp-native/types";
import {
  cspLocUri,
  defaultAdmxElementValue,
  defaultCspValue,
  instanceSlots,
  isAdmxBackedCsp,
} from "@/lib/csp-native/encoder";
import { summarizeEditions } from "@/lib/csp-native/editions";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  setting: CspSetting;
}

export function CspEditor({ setting }: Props) {
  const { t } = useTranslation();
  const cfg = useAdmxStore((s) => s.configuredCsp[setting.id]);
  const setCspValue = useAdmxStore((s) => s.setCspValue);
  const setCspScope = useAdmxStore((s) => s.setCspScope);
  const setCspApply = useAdmxStore((s) => s.setCspApply);
  const setCspAdmxState = useAdmxStore((s) => s.setCspAdmxState);
  const setCspAdmxElement = useAdmxStore((s) => s.setCspAdmxElement);
  const setCspInstanceName = useAdmxStore((s) => s.setCspInstanceName);

  const apply = cfg?.apply ?? false;
  const scope: PolicyScope =
    cfg?.scope ?? (setting.scope === "User" ? "User" : "Device");
  const scopeFixed = setting.scope !== "Both";
  const effectiveValue = cfg?.value ?? defaultCspValue(setting);
  const admxState: PolicyState = cfg?.admxState ?? "enabled";
  const hasStructuredAdmx = !!setting.admx;
  const editions = summarizeEditions(setting.applicability?.editionAllowList);

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
                {setting.family === "standalone" ? "" : "Policy/"}
                {setting.path.join("/")}
              </span>{" "}
              · family{" "}
              <Badge variant="outline" className="align-middle">
                {setting.family === "standalone"
                  ? t("cspEditor.familyStandalone")
                  : t("cspEditor.familyPolicyCsp")}
              </Badge>{" "}
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
              {t("cspEditor.applyLabel")}
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
            <span className="font-semibold">{t("cspEditor.locUri")} </span>
            <code>{cspLocUri(setting, scope, cfg?.instanceNames)}</code>
          </div>
          {setting.defaultValue !== undefined && (
            <div>
              <span className="font-semibold">{t("cspEditor.default")} </span>
              <code>{setting.defaultValue}</code>
            </div>
          )}
          {setting.applicability?.osBuild && (
            <div>
              <span className="font-semibold">{t("cspEditor.osBuild")} </span>
              <code>{setting.applicability.osBuild}</code>
              {setting.applicability.cspVersion && (
                <>
                  {" · "}
                  <span className="font-semibold">{t("cspEditor.csp")} </span>
                  <code>{setting.applicability.cspVersion}</code>
                </>
              )}
            </div>
          )}
          {editions && (
            <div
              title={editions.editions
                .map((e) => `${e.code} — ${e.label}`)
                .join("\n")}
            >
              <span className="font-semibold">
                {t("cspEditor.windowsEditions")}{" "}
              </span>
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {editions.families.map((f) => (
                  <Badge
                    key={f}
                    variant="secondary"
                    className="font-normal"
                  >
                    {f}
                  </Badge>
                ))}
              </span>
              {!editions.homeSupported && (
                <span className="ml-2 text-muted-foreground">
                  {t("cspEditor.notOnHome")}
                </span>
              )}
            </div>
          )}
          {setting.deprecated && (
            <div className="text-amber-700">
              {t("cspEditor.deprecated")}
              {setting.osBuildDeprecated
                ? t("cspEditor.deprecatedFromBuild", {
                    build: setting.osBuildDeprecated,
                  })
                : ""}
            </div>
          )}
        </div>

        <div className={cn("space-y-5 transition-opacity", !apply && "opacity-60")}>
          {instanceSlots(setting).length > 0 && (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <div className="font-semibold">
                {t("cspEditor.pathParameters.title")}
                <span className="ml-2 text-xs font-normal">
                  {t("cspEditor.pathParameters.hint")}
                </span>
              </div>
              {instanceSlots(setting).map((slot) => {
                const value = cfg?.instanceNames?.[slot.slotIndex] ?? "";
                return (
                  <div key={slot.slotIndex} className="space-y-1">
                    <Label
                      htmlFor={`${setting.id}-inst-${slot.slotIndex}`}
                      className="text-xs"
                    >
                      {slot.label}
                    </Label>
                    <Input
                      id={`${setting.id}-inst-${slot.slotIndex}`}
                      value={value}
                      placeholder={
                        slot.label.toLowerCase().includes("profile")
                          ? t("cspEditor.pathParameters.profilePlaceholder")
                          : t("cspEditor.pathParameters.namePlaceholder")
                      }
                      className="bg-white"
                      onChange={(e) =>
                        setCspInstanceName(
                          setting.id,
                          slot.slotIndex,
                          e.target.value
                        )
                      }
                    />
                  </div>
                );
              })}
              {(() => {
                const missing = instanceSlots(setting).some(
                  (s) => !cfg?.instanceNames?.[s.slotIndex]
                );
                if (!missing) return null;
                return (
                  <p className="text-xs">
                    <Trans
                      i18nKey="cspEditor.pathParameters.missingWarning"
                      components={{ code: <code /> }}
                    />
                  </p>
                );
              })()}
            </div>
          )}

          <div>
            <Label className="mb-2 block">
              {scopeFixed
                ? t("cspEditor.cspScopeFixed")
                : t("cspEditor.cspScope")}
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
                  {t("cspEditor.scopeDevice")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="User"
                  id={`${setting.id}-scope-user`}
                  disabled={scopeFixed}
                />
                <Label htmlFor={`${setting.id}-scope-user`}>
                  {t("cspEditor.scopeUser")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {hasStructuredAdmx ? (
            <>
              <div>
                <Label className="mb-2 block">{t("cspEditor.state")}</Label>
                <RadioGroup
                  value={apply ? admxState : ""}
                  onValueChange={(v) =>
                    setCspAdmxState(setting.id, v as PolicyState)
                  }
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="notConfigured"
                      id={`${setting.id}-nc`}
                    />
                    <Label htmlFor={`${setting.id}-nc`}>
                      {t("cspEditor.stateNotConfigured")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="enabled"
                      id={`${setting.id}-en`}
                    />
                    <Label htmlFor={`${setting.id}-en`}>
                      {t("cspEditor.stateEnabled")}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="disabled"
                      id={`${setting.id}-di`}
                    />
                    <Label htmlFor={`${setting.id}-di`}>
                      {t("cspEditor.stateDisabled")}
                    </Label>
                  </div>
                </RadioGroup>
                <p className="mt-2 text-xs text-muted-foreground">
                  <Trans
                    i18nKey="cspEditor.stateHelp"
                    components={{ code: <code /> }}
                  />
                </p>
              </div>

              {admxState === "enabled" &&
                setting.admx!.elements.length > 0 && (
                  <div className="space-y-4 border-t pt-4">
                    {setting.admx!.elements.map((el) => (
                      <CspAdmxElementInput
                        key={el.id}
                        element={el}
                        value={
                          cfg?.admxElements?.[el.id] ??
                          defaultAdmxElementValue(el)
                        }
                        onChange={(v) =>
                          setCspAdmxElement(setting.id, el.id, v)
                        }
                      />
                    ))}
                  </div>
                )}
            </>
          ) : (
            <ValueInput
              setting={setting}
              value={effectiveValue}
              onChange={handleValueChange}
            />
          )}
        </div>

        {!apply && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            <Trans
              i18nKey="cspEditor.applyOff"
              components={{ strong: <strong /> }}
            />
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
  const { t } = useTranslation();
  const allowed = setting.allowed;
  const enumItems = allowed?.kind === "enum" ? allowed.items : undefined;

  if (isAdmxBackedCsp(setting)) {
    return <AdmxBackedInput setting={setting} value={value} onChange={onChange} />;
  }

  if (enumItems && enumItems.length > 0) {
    const current =
      value.format === "int"
        ? String(value.value)
        : value.format === "chr"
          ? value.value
          : "";
    return (
      <div className="space-y-1">
        <Label>{t("cspEditor.value")}</Label>
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
            <SelectValue placeholder={t("cspEditor.choosePlaceholder")} />
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
          <Label>{t("cspEditor.value")}</Label>
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
          <Label>{t("cspEditor.value")}</Label>
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
          <Label>{t("cspEditor.value")}</Label>
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
          <Label>{t("cspEditor.valueXml")}</Label>
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
          <Label>{t("cspEditor.valueBase64")}</Label>
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

function AdmxBackedInput({ setting, value, onChange }: ValueInputProps) {
  const { t } = useTranslation();
  const current = value.format === "chr" ? value.value : "<enabled/>";

  const setPayload = (next: string) => {
    onChange({ format: "chr", value: next });
  };

  const learnMoreUrl = `https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-${setting.area.toLowerCase().replace(/_/g, "-")}`;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="flex-1 space-y-1">
          <div className="font-semibold">
            {t("cspEditor.admxBacked.title")}
          </div>
          <p>
            <Trans
              i18nKey="cspEditor.admxBacked.intro"
              components={{
                code: <code className="rounded bg-amber-100 px-1" />,
              }}
            />
          </p>
          <pre className="mt-1 overflow-x-auto rounded bg-amber-100/60 p-2 font-mono">
{`<enabled/>
<data id="ElementId1" value="…"/>
<data id="ElementId2" value="…"/>`}
          </pre>
          <p>
            <Trans
              i18nKey="cspEditor.admxBacked.elementHint"
              components={{
                code: <code className="rounded bg-amber-100 px-1" />,
              }}
            />{" "}
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener"
              className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {t("cspEditor.admxBacked.learnMore")}
            </a>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPayload("<enabled/>")}
        >
          {t("cspEditor.admxBacked.insertEnabled")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPayload("<disabled/>")}
        >
          {t("cspEditor.admxBacked.insertDisabled")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setPayload(
              current.replace(/\s*$/, "") +
                '\n<data id="ElementId" value=""/>'
            )
          }
        >
          {t("cspEditor.admxBacked.appendData")}
        </Button>
      </div>

      <Label>{t("cspEditor.admxBacked.payload")}</Label>
      <Textarea
        value={current}
        rows={6}
        spellCheck={false}
        className="font-mono text-xs"
        placeholder={'<enabled/>\n<data id="WallpaperName" value="C:\\Users\\Public\\home.jpg"/>\n<data id="WallpaperStyle" value="2"/>'}
        onChange={(e) => setPayload(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        <Trans
          i18nKey="cspEditor.admxBacked.payloadHelp"
          components={{ code: <code /> }}
        />
      </p>
    </div>
  );
}

interface CspAdmxElementInputProps {
  element: CspAdmxElement;
  value: ElementValue;
  onChange(next: ElementValue): void;
}

function CspAdmxElementInput({
  element,
  value,
  onChange,
}: CspAdmxElementInputProps) {
  const { t } = useTranslation();
  const labelText = element.label ?? element.id;
  const inputId = `csp-el-${element.id}`;

  switch (element.type) {
    case "boolean": {
      const checked = value.type === "boolean" ? value.value : false;
      return (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={inputId}>{labelText}</Label>
          <Switch
            id={inputId}
            checked={checked}
            onCheckedChange={(v) => onChange({ type: "boolean", value: v })}
          />
        </div>
      );
    }
    case "decimal": {
      const v = value.type === "decimal" ? value.value : 0;
      return (
        <div className="space-y-1">
          <Label htmlFor={inputId}>{labelText}</Label>
          <Input
            id={inputId}
            type="number"
            min={element.minValue}
            max={element.maxValue}
            value={v}
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
      const v = value.type === "text" ? value.value : "";
      return (
        <div className="space-y-1">
          <Label htmlFor={inputId}>{labelText}</Label>
          <Input
            id={inputId}
            type="text"
            maxLength={element.maxLength}
            value={v}
            onChange={(e) => onChange({ type: "text", value: e.target.value })}
          />
        </div>
      );
    }
    case "multiText": {
      const lines = value.type === "multiText" ? value.value : [];
      return (
        <div className="space-y-1">
          <Label htmlFor={inputId}>{labelText}</Label>
          <Textarea
            id={inputId}
            rows={4}
            value={lines.join("\n")}
            placeholder={t("elementInput.onePerLine")}
            onChange={(e) =>
              onChange({ type: "multiText", value: e.target.value.split("\n") })
            }
          />
        </div>
      );
    }
    case "enum": {
      const idx = value.type === "enum" ? value.value : 0;
      return (
        <div className="space-y-1">
          <Label>{labelText}</Label>
          <Select
            value={String(idx)}
            onValueChange={(v) => onChange({ type: "enum", value: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("cspEditor.choosePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {element.items.map((item, i) => (
                <SelectItem key={i} value={String(i)}>
                  {item.displayName ||
                    t("elementInput.optionFallback", { index: i })}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("elementInput.valueSuffix", { value: item.value })}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    case "list": {
      const entries = value.type === "list" ? value.value : [];
      const explicit = !!element.explicitValue;
      const update = (next: typeof entries) =>
        onChange({ type: "list", value: next });
      return (
        <div className="space-y-2">
          <Label>{labelText}</Label>
          <div className="divide-y rounded-md border">
            {entries.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                {t("elementInput.noEntries")}
              </p>
            )}
            {entries.map((entry, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto] items-center gap-2 p-2"
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
            <Plus className="mr-1 h-4 w-4" /> {t("elementInput.add")}
          </Button>
        </div>
      );
    }
  }
}
