import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AdmxFile,
  ConfiguredPolicy,
  ElementValue,
  PolicyClass,
  PolicyScope,
  PolicyState,
} from "@/lib/admx/types";
import type { ConfiguredCsp, CspValue } from "@/lib/csp-native/types";
import { getCspSetting } from "@/lib/csp-native/catalog";
import { defaultAdmxElementValue } from "@/lib/csp-native/encoder";

interface AdmxStoreState {
  files: AdmxFile[];
  configured: Record<string, ConfiguredPolicy>;
  configuredCsp: Record<string, ConfiguredCsp>;
  selectedKey?: string;
  /**
   * Whether the bundled Microsoft Policy CSP catalog is surfaced in the
   * Policies list. Defaults to true — users can un-check it if they only
   * want to work with their own ADMX. Persisted.
   */
  cspCatalogEnabled: boolean;
  /**
   * IDs of pre-filled ADMX samples the user has checked in the "Policy
   * sources" panel. Persisted so samples re-hydrate on reload.
   */
  enabledSampleIds: string[];

  addFile(file: AdmxFile): void;
  removeFile(id: string): void;
  clearFiles(): void;
  setCspCatalogEnabled(v: boolean): void;
  setEnabledSampleIds(ids: string[]): void;

  /** Select an ADMX policy for editing. */
  selectPolicy(admxId: string, policyName: string): void;
  /** Select a native CSP setting for editing. */
  selectCsp(settingId: string): void;

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

  setCspValue(settingId: string, value: CspValue): void;
  setCspScope(settingId: string, scope: PolicyScope): void;
  setCspApply(settingId: string, apply: boolean): void;

  /** Clear every configured / applied policy in one shot. Keeps loaded ADMX
   *  files intact — only the user's per-policy choices are reset. */
  resetConfigurations(): void;
  setCspAdmxState(settingId: string, state: PolicyState): void;
  setCspAdmxElement(
    settingId: string,
    elementId: string,
    value: ElementValue
  ): void;
  setCspInstanceName(
    settingId: string,
    slotIndex: number,
    name: string
  ): void;
}

export function defaultScopeFor(cls: PolicyClass): PolicyScope {
  return cls === "User" ? "User" : "Device";
}

export function defaultCspScope(s: "Device" | "User" | "Both"): PolicyScope {
  return s === "User" ? "User" : "Device";
}

export function policyKey(admxId: string, policyName: string): string {
  return `admx::${admxId}::${policyName}`;
}

export function cspKey(settingId: string): string {
  return `csp::${settingId}`;
}

function upsertAdmx(
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

function upsertCsp(
  s: Record<string, ConfiguredCsp>,
  settingId: string
): ConfiguredCsp {
  const existing = s[settingId];
  if (existing) return existing;
  const setting = getCspSetting(settingId);
  const base: ConfiguredCsp = {
    settingId,
    scope: defaultCspScope(setting?.scope ?? "Device"),
    value: undefined,
    apply: false,
  };
  if (setting?.admx) {
    base.admxState = "enabled";
    base.admxElements = {};
    for (const el of setting.admx.elements) {
      base.admxElements[el.id] = defaultAdmxElementValue(el);
    }
  }
  return base;
}

export const useAdmxStore = create<AdmxStoreState>()(
  persist(
    (set) => ({
  files: [],
  configured: {},
  configuredCsp: {},
  selectedKey: undefined,
  cspCatalogEnabled: true,
  enabledSampleIds: [],

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
        selectedKey: s.selectedKey?.startsWith(`admx::${id}::`)
          ? undefined
          : s.selectedKey,
      };
    }),

  clearFiles: () =>
    set({ files: [], configured: {}, selectedKey: undefined }),

  setCspCatalogEnabled: (v) => set({ cspCatalogEnabled: v }),

  setEnabledSampleIds: (ids) => set({ enabledSampleIds: ids }),

  selectPolicy: (admxId, policyName) =>
    set({ selectedKey: policyKey(admxId, policyName) }),

  selectCsp: (settingId) => set({ selectedKey: cspKey(settingId) }),

  setPolicyState: (admxId, policyName, state, cls) =>
    set((s) => {
      const key = policyKey(admxId, policyName);
      const existing = upsertAdmx(s.configured, admxId, policyName, cls);
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
      const existing = upsertAdmx(s.configured, admxId, policyName, cls);
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
      const existing = upsertAdmx(s.configured, admxId, policyName, cls);
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
      const existing = upsertAdmx(s.configured, admxId, policyName, cls);
      return {
        configured: {
          ...s.configured,
          [key]: { ...existing, apply },
        },
      };
    }),

  setCspValue: (settingId, value) =>
    set((s) => {
      const existing = upsertCsp(s.configuredCsp, settingId);
      return {
        configuredCsp: {
          ...s.configuredCsp,
          [settingId]: { ...existing, value, apply: true },
        },
      };
    }),

  setCspScope: (settingId, scope) =>
    set((s) => {
      const existing = upsertCsp(s.configuredCsp, settingId);
      return {
        configuredCsp: {
          ...s.configuredCsp,
          [settingId]: { ...existing, scope, apply: true },
        },
      };
    }),

  setCspApply: (settingId, apply) =>
    set((s) => {
      const existing = upsertCsp(s.configuredCsp, settingId);
      return {
        configuredCsp: {
          ...s.configuredCsp,
          [settingId]: { ...existing, apply },
        },
      };
    }),

  resetConfigurations: () =>
    set({ configured: {}, configuredCsp: {}, selectedKey: undefined }),

  setCspAdmxState: (settingId, state) =>
    set((s) => {
      const existing = upsertCsp(s.configuredCsp, settingId);
      return {
        configuredCsp: {
          ...s.configuredCsp,
          [settingId]: { ...existing, admxState: state, apply: true },
        },
      };
    }),

  setCspAdmxElement: (settingId, elementId, value) =>
    set((s) => {
      const existing = upsertCsp(s.configuredCsp, settingId);
      return {
        configuredCsp: {
          ...s.configuredCsp,
          [settingId]: {
            ...existing,
            admxElements: { ...existing.admxElements, [elementId]: value },
            apply: true,
          },
        },
      };
    }),

  setCspInstanceName: (settingId, slotIndex, name) =>
    set((s) => {
      const existing = upsertCsp(s.configuredCsp, settingId);
      const next = [...(existing.instanceNames ?? [])];
      next[slotIndex] = name;
      return {
        configuredCsp: {
          ...s.configuredCsp,
          [settingId]: { ...existing, instanceNames: next, apply: true },
        },
      };
    }),
    }),
    {
      name: "csp-builder-store",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only persist the user's configured policies — not the (large,
      // derivable) `files` array nor the transient `selectedKey`. Sample ADMX
      // re-hydrate from ?raw imports when the user re-checks them.
      partialize: (s) => ({
        configured: s.configured,
        configuredCsp: s.configuredCsp,
        cspCatalogEnabled: s.cspCatalogEnabled,
        enabledSampleIds: s.enabledSampleIds,
      }),
      // `files` is intentionally not persisted (too large, re-parsed from the
      // bundled samples at mount). Without the custom merge below, zustand's
      // default shallow-merge would leave `files` at its initial `[]` — which
      // is actually what we want here, so the default works. This callback
      // ensures the initial state is completely overridden by what was stored.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
      }),
    }
  )
);
