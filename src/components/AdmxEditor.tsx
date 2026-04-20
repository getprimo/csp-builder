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
import { Badge } from "@/components/ui/badge";
import {
  useAdmxStore,
  policyKey,
  defaultScopeFor,
} from "@/store/useAdmxStore";
import type {
  AdmxFile,
  PolicyDefinition,
  PolicyScope,
  PolicyState,
} from "@/lib/admx/types";
import { ElementInput } from "@/components/PolicyElement/ElementInput";
import { defaultValueFor } from "@/components/PolicyElement/defaults";
import { cn } from "@/lib/utils";

interface Props {
  file: AdmxFile;
  policy: PolicyDefinition;
}

export function AdmxEditor({ file, policy }: Props) {
  const configured = useAdmxStore((s) => s.configured);
  const setPolicyState = useAdmxStore((s) => s.setPolicyState);
  const setPolicyScope = useAdmxStore((s) => s.setPolicyScope);
  const setElementValue = useAdmxStore((s) => s.setElementValue);
  const setApply = useAdmxStore((s) => s.setApply);

  const cfg = configured[policyKey(file.id, policy.name)];
  const apply = cfg?.apply ?? false;
  const state: PolicyState = cfg?.state ?? "notConfigured";
  const scope: PolicyScope = cfg?.scope ?? defaultScopeFor(policy.class);
  const scopeFixed = policy.class !== "Both";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {policy.displayName || policy.name}
            </CardTitle>
            <CardDescription>
              <span className="font-mono text-xs">{policy.name}</span> · class{" "}
              <Badge variant="outline" className="align-middle">
                {policy.class}
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
              onCheckedChange={(v) =>
                setApply(file.id, policy.name, v, policy.class)
              }
            />
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {policy.explainText && (
          <div className="text-sm text-muted-foreground whitespace-pre-line break-words rounded-md bg-muted/50 p-3">
            {policy.explainText}
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1 break-all">
          <div>
            <span className="font-semibold">Registry key: </span>
            <code>{policy.key}</code>
          </div>
          {policy.valueName && (
            <div>
              <span className="font-semibold">Value name: </span>
              <code>{policy.valueName}</code>
            </div>
          )}
          {policy.categoryPath.length > 0 && (
            <div>
              <span className="font-semibold">Category path: </span>
              <code>{policy.categoryPath.join(" → ")}</code>
            </div>
          )}
        </div>

        <div
          className={cn(
            "space-y-5 transition-opacity",
            !apply && "opacity-60"
          )}
        >
          <div>
            <Label className="mb-2 block">
              CSP scope{scopeFixed ? " (fixed by ADMX class)" : ""}
            </Label>
            <RadioGroup
              value={scope}
              onValueChange={(v) =>
                setPolicyScope(file.id, policy.name, v as PolicyScope, policy.class)
              }
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="Device"
                  id={`${policy.name}-scope-device`}
                  disabled={scopeFixed}
                />
                <Label htmlFor={`${policy.name}-scope-device`}>
                  Device (HKLM)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="User"
                  id={`${policy.name}-scope-user`}
                  disabled={scopeFixed}
                />
                <Label htmlFor={`${policy.name}-scope-user`}>User (HKCU)</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="mb-2 block">State</Label>
            <RadioGroup
              value={apply ? state : ""}
              onValueChange={(v) =>
                setPolicyState(file.id, policy.name, v as PolicyState, policy.class)
              }
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="notConfigured" id={`${policy.name}-nc`} />
                <Label htmlFor={`${policy.name}-nc`}>Not Configured</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="enabled" id={`${policy.name}-en`} />
                <Label htmlFor={`${policy.name}-en`}>Enabled</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="disabled" id={`${policy.name}-di`} />
                <Label htmlFor={`${policy.name}-di`}>Disabled</Label>
              </div>
            </RadioGroup>
          </div>

          {state === "enabled" && policy.elements.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              {policy.elements.map((el) => (
                <ElementInput
                  key={el.id}
                  element={el}
                  value={cfg?.elements?.[el.id] ?? defaultValueFor(el)}
                  onChange={(v) =>
                    setElementValue(file.id, policy.name, el.id, v, policy.class)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {!apply && (
          <p className="text-xs text-muted-foreground border-t pt-3">
            Apply is off — this policy is <strong>not</strong> emitted in the
            SyncML payload. Flip the toggle, or change any setting above, to
            include it.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
