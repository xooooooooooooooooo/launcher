/**
 * Config save/load as .cfg (INI-style).
 * Same format can be used on the website so configs are interchangeable.
 */

import type { PreviewOptions } from "@/components/launcher/StevePreview";

const CFG_SECTION = "hades_config";
const CFG_VERSION = "1";

export interface SavedConfig {
  id: string;
  name: string;
  createdAt: number;
  options: PreviewOptions;
}

export const DEFAULT_WEBSITE_CONFIGS_URL = "https://hades-injector.com/configs";

function escapeCfgValue(s: string): string {
  return s.replace(/\r/g, "").replace(/\n/g, "\\n");
}

function unescapeCfgValue(s: string): string {
  return s.replace(/\\n/g, "\n");
}

export function previewOptionsToCfg(options: PreviewOptions, name?: string): string {
  const lines: string[] = [`[${CFG_SECTION}]`, `version=${CFG_VERSION}`];
  if (name) lines.push(`name=${escapeCfgValue(name)}`);
  lines.push(`esp_enabled=${options.espEnabled ? "1" : "0"}`);
  lines.push(`esp_mode=${options.espMode ?? "box"}`);
  lines.push(`esp_shader_preset=${options.espShaderPreset ?? "classic"}`);
  lines.push(`esp_nametag=${options.espNametag ? "1" : "0"}`);
  lines.push(`esp_nametag_style=${options.espNametagStyle ?? "modern"}`);
  lines.push(`esp_skeleton=${options.espSkeleton ? "1" : "0"}`);
  lines.push(`esp_tracers=${options.espTracers ? "1" : "0"}`);
  lines.push(`target_hud=${options.targetHud ? "1" : "0"}`);
  lines.push(`esp_color=${options.espColor ?? "#55ff55"}`);
  lines.push(`esp_bloom_radius=${options.espBloomRadius ?? 8}`);
  lines.push(`esp_bloom_intensity=${options.espBloomIntensity ?? 0.6}`);
  if (options.espCustomFragmentShader) {
    lines.push(`esp_custom_shader=${escapeCfgValue(options.espCustomFragmentShader)}`);
  }
  return lines.join("\n");
}

export interface CfgImportResult {
  options: PreviewOptions;
  name?: string;
}

export function cfgToPreviewOptions(cfgText: string): CfgImportResult | null {
  const options: PreviewOptions = {};
  let name: string | undefined;
  let inSection = false;
  for (const line of cfgText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inSection = trimmed === `[${CFG_SECTION}]`;
      continue;
    }
    if (!inSection) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key === "name") {
      name = unescapeCfgValue(value);
      continue;
    }
    switch (key) {
      case "esp_enabled":
        options.espEnabled = value === "1";
        break;
      case "esp_mode":
        options.espMode = (value === "glow" || value === "shader" || value === "outline" ? value : "box") as PreviewOptions["espMode"];
        break;
      case "esp_shader_preset":
        options.espShaderPreset = (["classic", "outline", "chalk", "chromatic", "neon", "ghost", "scanline"].includes(value) ? value : "classic") as PreviewOptions["espShaderPreset"];
        break;
      case "esp_nametag":
        options.espNametag = value === "1";
        break;
      case "esp_nametag_style":
        options.espNametagStyle = (value === "minecraft" || value === "modern" ? value : "modern");
        break;
      case "esp_skeleton":
        options.espSkeleton = value === "1";
        break;
      case "esp_tracers":
        options.espTracers = value === "1";
        break;
      case "target_hud":
        options.targetHud = value === "1";
        break;
      case "esp_color":
        options.espColor = value || "#55ff55";
        break;
      case "esp_bloom_radius":
        options.espBloomRadius = parseFloat(value) || 8;
        break;
      case "esp_bloom_intensity":
        options.espBloomIntensity = parseFloat(value) || 0.6;
        break;
      case "esp_custom_shader":
        options.espCustomFragmentShader = unescapeCfgValue(value);
        break;
    }
  }
  return { options, name };
}

const STORAGE_KEY = "hades_configs";

export function loadSavedConfigs(): SavedConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSavedConfigs(configs: SavedConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch (e) {
    console.error("Failed to save configs:", e);
  }
}

export function generateId(): string {
  return `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
