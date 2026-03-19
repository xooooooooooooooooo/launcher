import { useEffect, useMemo, useState } from "react";
import type { ConfigSchema, ConfigField, ConfigFieldType } from "../preview/types";

type ModuleConfig = Record<string, unknown>;

const STORAGE_KEY_PREFIX = "hades_preview_config_";

function loadStoredConfig(moduleId: string): ModuleConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + moduleId);
    return raw ? (JSON.parse(raw) as ModuleConfig) : null;
  } catch {
    return null;
  }
}

function saveStoredConfig(moduleId: string, cfg: ModuleConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + moduleId, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export interface ConfigPanelProps {
  moduleId: string;
  schema: ConfigSchema | null;
  onConfigChange: (config: ModuleConfig) => void;
}

export function ConfigPanel({ moduleId, schema, onConfigChange }: ConfigPanelProps) {
  const [config, setConfig] = useState<ModuleConfig>({});

  const fields = schema?.fields ?? [];

  const defaultConfig = useMemo(() => {
    const cfg: ModuleConfig = {};
    for (const f of fields) {
      switch (f.type as ConfigFieldType) {
        case "color":
        case "dropdown":
          cfg[f.id] = (f as any).default;
          break;
        case "slider":
          cfg[f.id] = (f as any).default;
          break;
        case "toggle":
          cfg[f.id] = (f as any).default;
          break;
        default:
          break;
      }
    }
    return cfg;
  }, [fields]);

  useEffect(() => {
    const stored = loadStoredConfig(moduleId);
    const initial = stored ?? defaultConfig;
    setConfig(initial);
    onConfigChange(initial);
  }, [moduleId, defaultConfig, onConfigChange]);

  const handleChange = (id: string, value: unknown) => {
    const updated = { ...config, [id]: value };
    setConfig(updated);
    saveStoredConfig(moduleId, updated);
    onConfigChange(updated);
  };

  const renderField = (field: ConfigField) => {
    if (field.type === "sectionHeader") {
      return (
        <div key={field.id} className="pt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
          {field.label}
        </div>
      );
    }

    const value = config[field.id];

    return (
      <div key={field.id} className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted-foreground/80">{field.label}</label>
        {field.type === "color" && (
          <input
            type="color"
            value={(value as string) ?? (field as any).default}
            onChange={(e) => handleChange(field.id, e.target.value)}
            className="h-8 w-full cursor-pointer rounded border border-border bg-transparent"
          />
        )}
        {field.type === "slider" && (
          <input
            type="range"
            min={(field as any).min}
            max={(field as any).max}
            step={(field as any).step}
            value={typeof value === "number" ? value : (field as any).default}
            onChange={(e) => handleChange(field.id, Number(e.target.value))}
          />
        )}
        {field.type === "toggle" && (
          <input
            type="checkbox"
            checked={Boolean(value ?? (field as any).default)}
            onChange={(e) => handleChange(field.id, e.target.checked)}
          />
        )}
        {field.type === "dropdown" && (
          <select
            value={(value as string) ?? (field as any).default}
            onChange={(e) => handleChange(field.id, e.target.value)}
            className="h-8 rounded border border-border bg-black/60 text-xs"
          >
            {(field as any).options.map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  if (!schema) {
    return (
      <div className="text-xs text-muted-foreground/70">
        No schema loaded for <span className="font-mono">{moduleId}</span>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      {fields.map(renderField)}
    </div>
  );
}

