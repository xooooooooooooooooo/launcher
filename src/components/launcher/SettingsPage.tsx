import { motion } from "framer-motion";
import { Settings as SettingsIcon, Palette, Image, Sparkles, Crown, Briefcase } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import type { ShaderPresetId, SettingKey, LauncherTheme } from "@/context/SettingsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import React from "react";

const isElectron = typeof window !== "undefined" && (window as any).require;
const ipcRenderer = isElectron ? (window as any).require("electron").ipcRenderer : null;

const SHADER_PRESETS: { id: ShaderPresetId; label: string }[] = [
  { id: "gold-orbs", label: "Gold orbs" },
  { id: "stars", label: "Starfield" },
  { id: "aurora", label: "Aurora" },
  { id: "waves", label: "Waves" },
];

interface SettingsPageProps {
  backendOnline: boolean;
}

const SettingsPage = ({ backendOnline }: SettingsPageProps) => {
  const { settings, updateSetting, setShaderPreset, setPrimaryColor } = useSettings();

  const toggle = (key: SettingKey) => {
    const newValue = !settings[key];
    updateSetting(key, newValue);

    // Auto-link: Cloud OFF → Local ON, Cloud ON → Local OFF
    if (key === "useCloudSync") {
      updateSetting("useLocalFallback", !newValue);
    } else if (key === "useLocalFallback") {
      updateSetting("useCloudSync", !newValue);
    }
  };

  const settingGroups: { title: string; items: { key: SettingKey; label: string; desc: string }[] }[] = [
    {
      title: "Injection",
      items: [
        { key: "autoInject", label: "Auto-inject on launch", desc: "Automatically inject when Minecraft starts" },
        { key: "stealthMode", label: "Stealth mode", desc: "Use advanced injection techniques" },
      ],
    },
    {
      title: "General",
      items: [
        { key: "startMinimized", label: "Start minimized", desc: "Launch in system tray" },
        { key: "checkUpdates", label: "Check for updates", desc: "Automatically check for new versions" },
      ],
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="mb-10 border-b border-white/[0.05] pb-6 px-2">
            <div className="flex items-center gap-3">
              <SettingsIcon className="h-6 w-6 text-white/50" />
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight text-white">System Configuration</h2>
                <p className="text-xs text-white/50 max-w-xl mt-1">
                  Runtime parameters & interface rendering.
                </p>
              </div>
            </div>
        </div>

        <div className="mb-12 flex flex-col gap-6">
          <div className="flex flex-col gap-1 px-2">
            <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-white">
              Interface Renderer
            </h3>
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/40">Core dashboard visualization model.</p>
          </div>
          
          <div className="flex items-center gap-4 mt-4 theme-professional-glass p-6 rounded-2xl">
            <div 
              className="w-12 h-12 rounded-full border-2 border-white/10 shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-transform hover:scale-105"
              style={{ backgroundColor: settings.primaryColor, boxShadow: `0 0 20px ${settings.primaryColor}40` }}
            />
            <div className="flex-1">
              <label className="text-xs font-bold text-white uppercase tracking-widest mb-1 block">Accent Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={settings.primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-8 h-8 rounded shrink-0 cursor-pointer bg-transparent border-0 p-0"
                />
                <span className="text-xs font-mono text-white/50">{settings.primaryColor.toUpperCase()}</span>
              </div>
            </div>
            <button 
              onClick={() => setPrimaryColor("#ffffff")}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors border border-white/5"
            >
              Reset
            </button>
          </div>

          {settings.launcherTheme === "shader" && (
            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Shader style</label>
              <Select value={settings.shaderPreset} onValueChange={(v) => setShaderPreset(v as ShaderPresetId)}>
                <SelectTrigger className="w-full max-w-[220px] rounded-lg border-border bg-surface">
                  <SelectValue placeholder="Choose shader" />
                </SelectTrigger>
                <SelectContent>
                  {SHADER_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-10">
          {settingGroups.map((group) => (
            <motion.div variants={{ hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } }} key={group.title}>
              <div className="flex flex-col gap-6 px-2">
                <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-white pb-2 border-b border-white/[0.05]">
                  {group.title}
                </h3>
              </div>
              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="contents">
                  {group.items.map((item) => {
                    const enabled = settings[item.key as keyof typeof settings] as boolean;               
                    return (
                      <div key={item.key} className="flex flex-col gap-4 p-6 theme-professional-glass rounded-2xl w-full">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-1.5">
                            <p className="text-xs font-mono font-bold text-white uppercase tracking-widest">{item.label}</p>
                            <p className="text-[10px] font-mono text-primary uppercase tracking-widest">STATE: {enabled ? "ACTIVE" : "INACTIVE"}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            onClick={() => toggle(item.key)}
                            className={`relative flex h-8 w-14 shrink-0 cursor-pointer items-center border transition-all duration-150 ${
                              enabled 
                                ? "bg-primary/20 border-primary/50 shadow-[0_0_15px_hsl(var(--primary)/0.2)]" 
                                : "bg-black border-white/10"
                              }`}
                          >
                            <div
                              className={`absolute h-6 w-6 border transition-all duration-150 transform ${
                                enabled 
                                  ? "translate-x-7 bg-primary border-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)]" 
                                  : "translate-x-1 bg-white/20 border-white/5"
                                }`}
                            />
                          </button>
                        </div>
                        <p className="text-[9px] font-mono text-white/30 font-medium uppercase tracking-[0.15em] border-t border-white/[0.05] pt-3 mt-auto">
                          {item.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 items-center justify-center pb-10">
          <button
            onClick={() => {
              if (ipcRenderer) {
                ipcRenderer.invoke("app:check-updates");
                toast.success("Checking GitHub...", { description: "Polling remote repository latest.yml manifest." });
              } else {
                toast.error("Offline", { description: "Cannot check updates in browser." });
              }
            }}
            className="px-6 py-2 rounded border border-primary/20 bg-primary/10 text-primary font-bold tracking-widest text-[10px] uppercase hover:bg-primary/20 transition-all shadow-[0_0_10px_hsl(var(--primary)/0.1)]"
          >
            Check For Updates
          </button>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/20">
            <SettingsIcon className="h-3 w-3" />
            <span>Hades Architecture v2.0</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsPage;
