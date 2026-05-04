import { useTranslation } from "react-i18next";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAdmxStore, policyKey } from "@/store/useAdmxStore";
import type { AdmxFile, PolicyDefinition } from "@/lib/admx/types";
import { AdmxEditor } from "@/components/AdmxEditor";
import { CspEditor } from "@/components/CspEditor";
import { getCspSetting } from "@/lib/csp-native/catalog";

function findAdmxSelection(
  files: AdmxFile[],
  selectedKey: string | undefined
): { file: AdmxFile; policy: PolicyDefinition } | undefined {
  if (!selectedKey) return undefined;
  for (const f of files) {
    for (const p of f.policies) {
      if (policyKey(f.id, p.name) === selectedKey) return { file: f, policy: p };
    }
  }
  return undefined;
}

export function PolicyEditor() {
  const files = useAdmxStore((s) => s.files);
  const selectedKey = useAdmxStore((s) => s.selectedKey);

  if (!selectedKey) return <EmptySelection />;

  if (selectedKey.startsWith("csp::")) {
    const id = selectedKey.slice("csp::".length);
    const setting = getCspSetting(id);
    if (!setting) return <EmptySelection />;
    return <CspEditor setting={setting} />;
  }

  const admxSel = findAdmxSelection(files, selectedKey);
  if (!admxSel) return <EmptySelection />;
  return <AdmxEditor file={admxSel.file} policy={admxSel.policy} />;
}

function EmptySelection() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("policyEditor.emptyTitle")}</CardTitle>
        <CardDescription>{t("policyEditor.emptyDescription")}</CardDescription>
      </CardHeader>
    </Card>
  );
}

