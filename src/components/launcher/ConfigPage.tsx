import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Sliders, Box, LayoutList, Eye, User, Activity, Crosshair, Sparkles, Upload, Plus, FileDown, FileUp, Trash2, ExternalLink, Shield, Cloud, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabaseClient";

interface CloudConfig {
  id: string;
  name: string;
  category: string;
  file_path: string | null;
}
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { OpenGLPreviewEmbed } from "./OpenGLPreviewEmbed";
import type { PreviewOptions, EspMode, EspShaderPreset } from "./StevePreview";
import {
  loadSavedConfigs,
  saveSavedConfigs,
  generateId,
  previewOptionsToCfg,
  cfgToPreviewOptions,
  type SavedConfig,
  DEFAULT_WEBSITE_CONFIGS_URL,
} from "@/lib/configCfg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ConfigPageProps {
  theme?: string;
}

const ConfigPage = ({ theme }: ConfigPageProps) => {
  const importCfgInputRef = useRef<HTMLInputElement>(null);
  const skinFileInputRef = useRef<HTMLInputElement>(null);
  const [previewOptions, setPreviewOptions] = useState<PreviewOptions>({
    espEnabled: false,
    espMode: "box",
    espShaderPreset: "classic",
    espNametag: false,
    targetHud: false,
    espCustomFragmentShader: "",
  });
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>(() => loadSavedConfigs());
  const [newConfigName, setNewConfigName] = useState("");
  const [cloudConfigs, setCloudConfigs] = useState<CloudConfig[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [hoveredEspMode, setHoveredEspMode] = useState<EspMode | null>(null);

  const ESP_MODE_LABELS: Record<EspMode, string> = {
    box: "Box ESP",
    glow: "Glow ESP",
    outline: "Outline ESP",
    shader: "Shader ESP",
  };

  const ESP_MODE_VIDEO_MAP: Record<EspMode, string> = {
    box: "/esp-previews/esp_box.mp4",
    glow: "/esp-previews/esp_glow.mp4",
    outline: "/esp-previews/esp_outline.mp4",
    shader: "/esp-previews/esp_shader.mp4",
  };

  useEffect(() => {
    saveSavedConfigs(savedConfigs);
  }, [savedConfigs]);

  useEffect(() => {
    const fetchCloudConfigs = async () => {
      setLoadingCloud(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;
        const userId = userData.user.id;

        const { data: ownConfigs } = await supabase
          .from("configs")
          .select("id, name, category, file_path")
          .eq("user_id", userId);

        const { data: purchases } = await supabase
          .from("config_purchases")
          .select("config_id")
          .eq("user_id", userId);

        let purchasedConfigs: CloudConfig[] = [];
        if (purchases && purchases.length > 0) {
          const configIds = purchases.map((p) => p.config_id);
          const { data: pConfigs } = await supabase
            .from("configs")
            .select("id, name, category, file_path")
            .in("id", configIds);
          if (pConfigs) purchasedConfigs = pConfigs;
        }

        const allConfigs = [...(ownConfigs || []), ...purchasedConfigs];
        const uniqueConfigs = Array.from(new Map(allConfigs.map(c => [c.id, c])).values());
        
        setCloudConfigs(uniqueConfigs);
      } catch (err) {
        console.error("Failed to fetch cloud configs:", err);
      } finally {
        setLoadingCloud(false);
      }
    };

    fetchCloudConfigs();
  }, []);

  const setBoolOption = <K extends keyof PreviewOptions>(key: K, value: boolean) => {
    setPreviewOptions((p) => ({ ...p, [key]: value }));
  };

  const handleSaveCurrentAs = () => {
    const name = newConfigName.trim() || `Config ${savedConfigs.length + 1}`;
    setSavedConfigs((list) => [
      ...list,
      { id: generateId(), name, createdAt: Date.now(), options: { ...previewOptions } },
    ]);
    setNewConfigName("");
  };

  const handleApplyConfig = (cfg: SavedConfig) => {
    setPreviewOptions({ ...cfg.options });
  };

  const handleDeleteConfig = (id: string) => {
    setSavedConfigs((list) => list.filter((c) => c.id !== id));
  };

  const handleExportCfg = (cfg: SavedConfig) => {
    const blob = new Blob([previewOptionsToCfg(cfg.options, cfg.name)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cfg.name.replace(/[^a-z0-9-_]/gi, "_")}.cfg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadCloudConfig = async (cfg: CloudConfig) => {
    if (!cfg.file_path) return;
    try {
      const { data, error } = await supabase.storage.from("configs").download(cfg.file_path);
      if (error) throw error;
      const text = await data.text();
      const result = cfgToPreviewOptions(text);
      if (result) {
        setPreviewOptions(result.options);
      }
    } catch (err) {
      console.error("Failed to load cloud config:", err);
    }
  };

  const handleImportCfg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result ?? "");
      const result = cfgToPreviewOptions(text);
      if (result) {
        const name = result.name || f.name.replace(/\.cfg$/i, "") || "Imported";
        setSavedConfigs((list) => [
          ...list,
          { id: generateId(), name, createdAt: Date.now(), options: result.options },
        ]);
        setPreviewOptions(result.options);
      }
      e.target.value = "";
    };
    r.readAsText(f);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className={`mb-10 ${theme === "professional" ? "px-0 mb-6" : "px-1"}`}>
        {theme === "professional" ? (
          <div className="flex flex-col gap-1.5 px-1 pt-2 mb-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Configuration
            </h2>
            <p className="text-xs text-white/40 max-w-lg">
              Fine-tune the execution parameters and visual overlays in real-time.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">Configuration</span>
            </div>
            <h2 className="font-display text-4xl font-black tracking-tight text-foreground">Global Parameters</h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground/60 max-w-lg leading-relaxed">
              Fine-tune the execution parameters and visual overlays. Changes are applied in real-time to the active management instance.
            </p>
          </>
        )}
      </div>

      <div className={`grid min-h-0 flex-1 overflow-y-auto pb-10 ${theme === "professional" ? "gap-6 md:grid-cols-2 px-2" : "gap-10 md:grid-cols-2"}`}>
        {/* Left: Config selection */}
        <div className={`flex flex-col ${theme === "professional" ? "gap-4" : "gap-8"}`}>
          {theme !== "professional" && (
            <>
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Execution Presets</span>
              </div>
              <p className="px-1 text-xs font-medium text-muted-foreground/60 leading-relaxed">
                Select from optimized execution modes. Each mode adjusts the monitoring frequency and overlay intensity.
              </p>
            </>
          )}

          <div className={`flex flex-col gap-4 ${theme === "professional" ? "theme-professional-glass rounded-[1.5rem] p-6 text-white" : "border border-white/5 bg-white/[0.02] rounded-[2rem] p-8"}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex items-center justify-center ${theme === "professional" ? "h-10 w-10 rounded-xl bg-white/10 text-white shadow-inner border border-white/20" : "h-8 w-8 rounded-xl bg-primary/10 text-primary"}`}>
                <Sliders className={theme === "professional" ? "h-5 w-5 drop-shadow-md" : "h-4 w-4"} />
              </div>
              <span className={`font-black uppercase tracking-widest ${theme === "professional" ? "text-sm text-white" : "text-sm text-foreground"}`}>Overlay (In-Game Stats)</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="esp-toggle" className="text-xs font-bold text-muted-foreground/80 cursor-pointer flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" /> ESP Master
                </Label>
                <Switch
                  id="esp-toggle"
                  checked={!!previewOptions.espEnabled}
                  onCheckedChange={(v) => setBoolOption("espEnabled", v)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-2">
                    <Box className="h-3.5 w-3.5" /> Render Mode
                  </Label>
                  <Select
                    value={previewOptions.espMode}
                    onValueChange={(v) => setPreviewOptions((p) => ({ ...p, espMode: v as EspMode }))}
                    disabled={!previewOptions.espEnabled}
                  >
                    <SelectTrigger className="h-9 w-32 text-xs font-bold rounded-xl border-white/5 bg-white/[0.03]">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-white/10 bg-black/90 backdrop-blur-xl">
                      <SelectItem
                        value="box"
                        onMouseEnter={() => setHoveredEspMode("box")}
                        onMouseLeave={() => setHoveredEspMode(null)}
                      >
                        Box ESP
                      </SelectItem>
                      <SelectItem
                        value="glow"
                        onMouseEnter={() => setHoveredEspMode("glow")}
                        onMouseLeave={() => setHoveredEspMode(null)}
                      >
                        Glow ESP
                      </SelectItem>
                      <SelectItem
                        value="outline"
                        onMouseEnter={() => setHoveredEspMode("outline")}
                        onMouseLeave={() => setHoveredEspMode(null)}
                      >
                        Outline ESP
                      </SelectItem>
                      <SelectItem
                        value="shader"
                        onMouseEnter={() => setHoveredEspMode("shader")}
                        onMouseLeave={() => setHoveredEspMode(null)}
                      >
                        Shader ESP
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {hoveredEspMode && (
                  <div className="mt-1 rounded-xl border border-white/10 bg-black/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        In-game preview: {ESP_MODE_LABELS[hoveredEspMode]}
                      </span>
                    </div>
                    <video
                      key={hoveredEspMode}
                      src={ESP_MODE_VIDEO_MAP[hoveredEspMode]}
                      className="h-24 w-full rounded-lg object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  </div>
                )}
              </div>
              {previewOptions.espMode === "shader" && (
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" /> Shader Preset
                  </Label>
                  <Select
                    value={previewOptions.espShaderPreset ?? "classic"}
                    onValueChange={(v) => setPreviewOptions((p) => ({ ...p, espShaderPreset: v as EspShaderPreset }))}
                  >
                    <SelectTrigger className="h-9 w-36 text-xs font-bold rounded-xl border-white/5 bg-white/[0.03]">
                      <SelectValue placeholder="Preset" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-white/10 bg-black/90 backdrop-blur-xl">
                      <SelectItem value="classic">Classic</SelectItem>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="chalk">Chalk</SelectItem>
                      <SelectItem value="chromatic">Chromatic</SelectItem>
                      <SelectItem value="neon">Neon</SelectItem>
                      <SelectItem value="ghost">Ghost</SelectItem>
                      <SelectItem value="scanline">Scanline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <Switch id="esp-nametag" checked={!!previewOptions.espNametag} onCheckedChange={(v) => setBoolOption("espNametag", v)} />
              </div>
              {previewOptions.espNametag && (
                <div className="flex items-center justify-between gap-4">
                  <Label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-2">
                    Nametag Style
                  </Label>
                  <Select
                    value={previewOptions.espNametagStyle ?? "modern"}
                    onValueChange={(v) => setPreviewOptions(p => ({ ...p, espNametagStyle: v as "modern" | "minecraft" }))}
                  >
                    <SelectTrigger className="h-9 w-36 text-xs font-bold rounded-xl border-white/5 bg-white/[0.03]">
                      <SelectValue placeholder="Style" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-white/10 bg-black/90 backdrop-blur-xl">
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="minecraft">Minecraft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="esp-skeleton" className="text-xs font-bold text-muted-foreground/80 cursor-pointer flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" /> Skeleton
                </Label>
                <Switch id="esp-skeleton" checked={!!previewOptions.espSkeleton} onCheckedChange={(v) => setBoolOption("espSkeleton", v)} />
              </div>
              {/* Advanced ESP Settings */}
              {previewOptions.espEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-4 pt-2 border-t border-white/5 mt-2"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">ESP Color</Label>
                      <div
                        className="h-4 w-4 rounded-full border border-white/10 shadow-sm"
                        style={{ backgroundColor: previewOptions.espColor ?? "#55ff55" }}
                      />
                    </div>
                    <Input
                      type="color"
                      value={previewOptions.espColor ?? "#55ff55"}
                      onChange={(e) => setPreviewOptions(p => ({ ...p, espColor: e.target.value }))}
                      className="h-8 w-full p-0 border-none bg-transparent cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">Bloom Radius</Label>
                      <span className="text-[10px] font-mono text-primary">{previewOptions.espBloomRadius ?? 8}px</span>
                    </div>
                    <Slider
                      value={[previewOptions.espBloomRadius ?? 8]}
                      min={1}
                      max={20}
                      step={1}
                      onValueChange={([v]) => setPreviewOptions(p => ({ ...p, espBloomRadius: v }))}
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">Bloom Intensity</Label>
                      <span className="text-[10px] font-mono text-primary">{Math.round((previewOptions.espBloomIntensity ?? 0.6) * 100)}%</span>
                    </div>
                    <Slider
                      value={[(previewOptions.espBloomIntensity ?? 0.6) * 100]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setPreviewOptions(p => ({ ...p, espBloomIntensity: v / 100 }))}
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          <div className={`flex flex-col gap-4 ${theme === "professional" ? "theme-professional-glass rounded-[1.5rem] p-6 text-white" : "border border-white/5 bg-white/[0.02] rounded-[2rem] p-8"}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex items-center justify-center ${theme === "professional" ? "h-10 w-10 rounded-xl bg-white/10 text-white shadow-inner border border-white/20" : "h-8 w-8 rounded-xl bg-primary/10 text-primary"}`}>
                <User className={theme === "professional" ? "h-5 w-5 drop-shadow-md" : "h-4 w-4"} />
              </div>
              <span className={`font-black uppercase tracking-widest ${theme === "professional" ? "text-sm text-white" : "text-sm text-foreground"}`}>Character Customization</span>
            </div>
            <p className="text-[10px] font-medium text-muted-foreground/50 leading-relaxed">
              Personalize your preview. Enter a Minecraft username or direct skin URL to visualize the ESP suite on a specific model.
            </p>
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">Minecraft Username</Label>
                <Input
                  type="text"
                  value={previewOptions.espSkinUsername ?? ""}
                  onChange={(e) => setPreviewOptions(p => ({ ...p, espSkinUsername: e.target.value }))}
                  placeholder="e.g. Notch"
                  className="h-9 rounded-xl border-white/5 bg-white/[0.03] text-xs font-bold"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">Direct Skin URL</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={previewOptions.espSkinUrl ?? ""}
                    onChange={(e) => setPreviewOptions(p => ({ ...p, espSkinUrl: e.target.value }))}
                    placeholder="https://imgur.com/..."
                    className="h-9 flex-1 rounded-xl border-white/5 bg-white/[0.03] text-xs font-bold"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => skinFileInputRef.current?.click()}
                    className="h-9 px-4 rounded-xl border-white/5 bg-white/[0.03] text-[10px] font-black uppercase tracking-widest"
                    title="Upload local skin file"
                  >
                    <Upload className="h-3 w-3" />
                  </Button>
                  <input
                    ref={skinFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = reader.result as string;
                          setPreviewOptions((p) => ({ ...p, espSkinUrl: dataUrl }));
                        };
                        reader.onerror = () => {
                          console.error("Failed to read skin file");
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right: Visual preview */}
        <div className={`flex flex-col ${theme === "professional" ? "gap-4" : "gap-8"}`}>
          {theme !== "professional" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">Visual Verification</span>
              </div>
              <p className="px-1 text-xs font-medium text-muted-foreground/60 leading-relaxed">
                Live "In-Game" verification system. Simulates the Minecraft environment with the Hades scanning engine. Drag to rotate, scroll to zoom.
              </p>
            </div>
          )}

          <motion.div
            className={`flex flex-col gap-4 ${theme === "professional" ? "theme-professional-glass rounded-[1.5rem] p-6 text-white" : "border border-white/5 bg-white/[0.02] rounded-[2rem] p-8"}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center ${theme === "professional" ? "h-10 w-10 rounded-xl bg-white/10 text-white shadow-inner border border-white/20" : "h-8 w-8 rounded-xl bg-primary/10 text-primary"}`}>
                  <Eye className={theme === "professional" ? "h-5 w-5 drop-shadow-md" : "h-4 w-4"} />
                </div>
                <span className={`font-black uppercase tracking-widest ${theme === "professional" ? "text-sm text-white" : "text-sm text-foreground"}`}>Model View</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5">
                <div className="h-1 w-1 rounded-full bg-primary" />
                <span className="text-[9px] font-bold text-primary uppercase tracking-tight">Active Preview</span>
              </div>
            </div>

            <div className={`flex flex-col overflow-hidden border border-white/5 bg-black/20 shadow-inner ${theme === "professional" ? "rounded h-[300px]" : "rounded-3xl h-[360px]"}`}>
              <OpenGLPreviewEmbed previewOptions={previewOptions} />
            </div>
          </motion.div>

          <div className={`flex flex-col gap-4 ${theme === "professional" ? "theme-professional-glass rounded-[1.5rem] p-6 text-white" : "border border-white/5 bg-white/[0.02] rounded-[2rem] p-8"}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex items-center justify-center ${theme === "professional" ? "h-10 w-10 rounded-xl bg-white/10 text-white shadow-inner border border-white/20" : "h-8 w-8 rounded-xl bg-primary/10 text-primary"}`}>
                <FileUp className={theme === "professional" ? "h-5 w-5 drop-shadow-md" : "h-4 w-4"} />
              </div>
              <span className={`font-black uppercase tracking-widest ${theme === "professional" ? "text-sm text-white" : "text-sm text-foreground"}`}>Configuration Repository</span>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="New profile name..."
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                className="h-10 flex-1 rounded-xl border-white/5 bg-white/[0.03] text-xs font-bold focus:ring-primary/20"
              />
              <Button type="button" className="h-10 rounded-xl px-4 font-black uppercase tracking-widest text-[10px]" onClick={handleSaveCurrentAs}>
                <Plus className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>

            <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
              {savedConfigs.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed ${theme === "professional" ? "border-white/10 opacity-40 text-white" : "border-white/5 opacity-20"}`}>
                  <Box className="h-8 w-8 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Empty Repository</p>
                </div>
              ) : (
                savedConfigs.map((cfg) => (
                  <li
                    key={cfg.id}
                    className={`group flex items-center justify-between gap-4 rounded-xl border px-4 py-2.5 transition-all ${theme === "professional" ? "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"}`}
                  >
                    <span className={`truncate text-[11px] font-bold transition-all ${theme === "professional" ? "text-white/60 group-hover:text-white" : "text-muted-foreground group-hover:text-foreground"}`}>{cfg.name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" className={`h-8 text-[10px] font-black uppercase px-3 rounded-lg ${theme === "professional" ? "hover:bg-white/10 hover:text-white text-white/70" : "hover:bg-primary/20 hover:text-primary"}`} onClick={() => handleApplyConfig(cfg)}>
                        Load
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDeleteConfig(cfg.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive/50 hover:text-destructive transition-colors" />
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Cloud Configs Repository */}
          <div className={`flex flex-col gap-4 ${theme === "professional" ? "theme-professional-glass rounded-[1.5rem] p-6 text-white" : "rounded-[2rem] border border-white/5 bg-white/[0.02] p-8"}`}>
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex items-center justify-center ${theme === "professional" ? "h-10 w-10 rounded-xl bg-white/10 text-white shadow-inner border border-white/20" : "h-8 w-8 rounded-xl bg-primary/10 text-primary"}`}>
                <Cloud className={theme === "professional" ? "h-5 w-5 drop-shadow-md" : "h-4 w-4"} />
              </div>
              <span className={`font-black uppercase tracking-widest ${theme === "professional" ? "text-sm text-white" : "text-sm text-foreground"}`}>Cloud Repository</span>
            </div>

            <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
              {loadingCloud ? (
                <div className={`flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed ${theme === "professional" ? "border-white/10 opacity-40 text-white" : "border-white/5 opacity-20"}`}>
                  <Loader2 className="h-8 w-8 mb-2 animate-spin" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Loading...</p>
                </div>
              ) : cloudConfigs.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed ${theme === "professional" ? "border-white/10 opacity-40 text-white" : "border-white/5 opacity-20"}`}>
                  <Cloud className="h-8 w-8 mb-2" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">No Cloud Configs</p>
                </div>
              ) : (
                cloudConfigs.map((cfg) => (
                  <li
                    key={cfg.id}
                    className={`group flex items-center justify-between gap-4 rounded-xl border px-4 py-2.5 transition-all ${theme === "professional" ? "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05]"}`}
                  >
                    <div className="flex flex-col overflow-hidden">
                      <span className={`truncate text-[11px] font-bold transition-all ${theme === "professional" ? "text-white/60 group-hover:text-white" : "text-muted-foreground group-hover:text-foreground"}`}>{cfg.name}</span>
                      <span className={`text-[9px] font-semibold uppercase tracking-widest ${theme === "professional" ? "text-white/40" : "text-primary/70"}`}>{cfg.category}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" className={`h-8 text-[10px] font-black uppercase px-3 rounded-lg ${theme === "professional" ? "hover:bg-white/10 hover:text-white text-white/70" : "hover:bg-primary/20 hover:text-primary"}`} onClick={() => handleLoadCloudConfig(cfg)}>
                        Load
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </motion.div >
  );
};

export default ConfigPage;
