import { create } from "zustand";
import type {
  AdmxFile,
  ConfiguredPolicy,
  ElementValue,
  PolicyClass,
  PolicyScope,
  PolicyState,
} from "@/lib/admx/types";

interface AdmxStoreState {
  files: AdmxFile[];
  configured: Record<string, ConfiguredPolicy>;
  selectedPolicyKey?: string;

  addFile(file: AdmxFile): void;
  removeFile(id: string): void;
  clearFiles(): void;

  selectPolicy(admxId: string, policyName: string): void;

  setPolicyState(
    admxId: string,
    policyName: string,
    state: PolicyState,
    cls: PolicyClass
  ): void;
  setPolicyScope(
    admxId: string,
    policyName: string,
    scope: PolicyScope,
    cls: PolicyClass
  ): void;
  setElementValue(
    admxId: string,
    policyName: string,
    elementId: string,
    value: ElementValue,
    cls: PolicyClass
  ): void;
  setApply(
    admxId: string,
    policyName: string,
    apply: boolean,
    cls: PolicyClass
  ): void;
}

export function defaultScopeFor(cls: PolicyClass): PolicyScope {
  return cls === "User" ? "User" : "Device";
}

export function policyKey(admxId: string, policyName: string): string {
  return `${admxId}::${policyName}`;
}

function upsert(
  s: Record<string, ConfiguredPolicy>,
  admxId: string,
  policyName: string,
  cls: PolicyClass
): ConfiguredPolicy {
  const key = policyKey(admxId, policyName);
  return (
    s[key] ?? {
      admxId,
      policyName,
      state: "enabled",
      scope: defaultScopeFor(cls),
      elements: {},
      apply: false,
    }
  );
}

export const useAdmxStore = create<AdmxStoreState>((set) => ({
  files: [],
  configured: {},
  selectedPolicyKey: undefined,

  addFile: (file) =>
    set((s) => ({
      files: [...s.files.filter((f) => f.id !== file.id), file],
    })),

  removeFile: (id) =>
    set((s) => {
      const remainingConfigured = Object.fromEntries(
        Object.entries(s.configured).filter(([, v]) => v.admxId !== id)
      );
      return {
        files: s.files.filter((f) => f.id !== id),
        configured: remainingConfigured,
        selectedPolicyKey: s.selectedPolicyKey?.startsWith(`${id}::`)
          ? undefined
          : s.selectedPolicyKey,
      };
    }),

  clearFiles: () =>
    set({ files: [], configured: {}, selectedPolicyKey: undefined }),

  selectPolicy: (admxId, policyName) =>
    set({ selectedPolicyKey: policyKey(admxId, policyName) }),

  setPolicyState: (admxId, policyName, state, cls) =>
    set((s) => {
      const key = policyKey(admxId, policyName);
      const existing = upsert(s.configured, admxId, policyName, cls);
      return {
        configured: {
          ...s.configured,
          [key]: { ...existing, state, apply: true },
        },
      };
    }),

  setPolicyScope: (admxId, policyName, scope, cls) =>
    set((s) => {
      const key = policyKey(admxId, policyName);
      const existing = upsert(s.configured, admxId, policyName, cls);
      return {
        configured: {
          ...s.configured,
          [key]: { ...existing, scope, apply: true },
        },
      };
    }),

  setElementValue: (admxId, policyName, elementId, value, cls) =>
    set((s) => {
      const key = policyKey(admxId, policyName);
      const existing = upsert(s.configured, admxId, policyName, cls);
      return {
        configured: {
          ...s.configured,
          [key]: {
            ...existing,
            elements: { ...existing.elements, [elementId]: value },
            apply: true,
          },
        },
      };
    }),

  setApply: (admxId, policyName, apply, cls) =>
    set((s) => {
      const key = policyKey(admxId, policyName);
      const existing = upsert(s.configured, admxId, policyName, cls);
      return {
        configured: {
          ...s.configured,
          [key]: { ...existing, apply },
        },
      };
    }),
}));
