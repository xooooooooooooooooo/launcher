import { motion } from "framer-motion";
import { Settings as SettingsIcon, Palette, Image, Sparkles, Crown, Briefcase } from "lucide-react";
import { useSettings, SettingKey, LauncherTheme, ShaderPresetId } from "@/context/SettingsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import React from "react";

interface SettingsPageProps {
  backendOnline: boolean;
}

const THEMES: { id: LauncherTheme; label: string; desc: string; icon: React.ElementType; premium?: boolean }[] = [
  { id: "default", label: "Default", desc: "Glassmorphism + animated image", icon: Image },
  { id: "minimal", label: "Minimal", desc: "Clean solid background", icon: Palette },
  { id: "professional", label: "Professional", desc: "Sleek, corporate UI", icon: Briefcase },
  { id: "shader", label: "Shader", desc: "Animated gradient mesh", icon: Sparkles, premium: true },
  { id: "vanguard", label: "Vanguard", desc: "Cinematic 3D experience", icon: Crown, premium: true },
];

const SHADER_PRESETS: { id: ShaderPresetId; label: string }[] = [
  { id: "gold-orbs", label: "Gold orbs" },
  { id: "stars", label: "Starfield" },
  { id: "aurora", label: "Aurora" },
  { id: "waves", label: "Waves" },
];

const SettingsPage = ({ backendOnline }: SettingsPageProps) => {
  const { settings, updateSetting, setLauncherTheme, setShaderPreset } = useSettings();

  const toggle = (key: SettingKey) => {
    updateSetting(key, !settings[key]);
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
        <div className={`mb-10 ${settings.launcherTheme === "professional" ? "border-b border-white/[0.05] pb-6 px-2" : ""}`}>
          {settings.launcherTheme === "professional" ? (
            <div className="flex items-center gap-3">
              <SettingsIcon className="h-6 w-6 text-white/50" />
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight text-white">System Configuration</h2>
                <p className="text-xs text-white/50 max-w-xl mt-1">
                  Runtime parameters & interface rendering.
                </p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="font-display text-3xl font-bold text-foreground">Settings</h2>
              <p className="mt-1 text-sm text-muted-foreground">Configure your injector preferences</p>
            </>
          )}
        </div>

        <div className={`mb-12 ${settings.launcherTheme === "professional" ? "" : "gradient-border rounded-lg"}`}>
          {settings.launcherTheme !== "professional" && (
            <div className={`mb-8 ${settings.launcherTheme === "professional" ? "bg-transparent text-white" : "rounded-lg bg-surface p-4"}`}>
              <h3 className={`mb-4 text-[11px] font-black uppercase tracking-[0.2em] ${settings.launcherTheme === "professional" ? "text-white/40" : "text-muted-foreground"}`}>
                Service Status
              </h3>
              <div className="flex items-center gap-3 text-sm">
                <div className={`h-3 w-3 rounded-full shrink-0 border border-black/50 ${backendOnline ? "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]"}`} />
                <span className={`font-bold tracking-tight ${settings.launcherTheme === "professional" ? "text-white" : "text-muted-foreground"}`}>Backend is {backendOnline ? "Online" : "Offline"}</span>
              </div>
              <p className={`mt-3 text-[10px] uppercase font-bold tracking-widest ${settings.launcherTheme === "professional" ? "text-white/30" : "text-muted-foreground/70"}`}>Real-time connection stream</p>
            </div>
          )}
        </div>

        <div className={`mb-12 ${settings.launcherTheme === "professional" ? "flex flex-col gap-6" : ""}`}>
          <div className="flex flex-col gap-1 px-2">
            <h3 className={`text-[11px] font-mono font-bold uppercase tracking-[0.2em] ${settings.launcherTheme === "professional" ? "text-white" : "text-muted-foreground"}`}>
              Interface Renderer
            </h3>
            <p className={`text-[10px] font-mono uppercase tracking-widest ${settings.launcherTheme === "professional" ? "text-white/40" : "text-muted-foreground"}`}>Core dashboard visualization model.</p>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {THEMES.map((theme) => {
              const Icon = theme.icon;
              const isActive = settings.launcherTheme === theme.id;
              
              if (settings.launcherTheme === "professional") {
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setLauncherTheme(theme.id)}
                    className={`group flex items-center gap-4 border p-4 text-left transition-all duration-150 ${isActive
                      ? "border-emerald-500/50 bg-emerald-500/5 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]"
                      : "border-white/[0.05] bg-black/40 hover:border-white/20 hover:bg-white/[0.02]"
                      }`}
                  >
                    <div className={`p-3 shrink-0 flex items-center justify-center border transition-all duration-150 ${isActive ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400" : "border-white/10 bg-white/5 text-white/50 group-hover:text-white"}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs font-mono font-bold uppercase tracking-widest transition-colors duration-150 ${isActive ? "text-emerald-400" : "text-white group-hover:text-white/80"}`}>
                        {theme.label}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 line-clamp-1">{theme.desc}</span>
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setLauncherTheme(theme.id)}
                  className={`relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all ${isActive
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface/50 hover:border-primary/40 hover:bg-surface/80"
                    }`}
                >
                  {theme.premium && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <Crown className="h-3 w-3" /> Premium
                    </span>
                  )}
                  <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{theme.label}</span>
                  <span className="mt-0.5 text-xs text-muted-foreground">{theme.desc}</span>
                </button>
              );
            })}
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

        <div className={`flex flex-col gap-10 ${settings.launcherTheme === "professional" ? "px-2" : ""}`}>
          {settingGroups.map((group, gi) => (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.1 }}
              className={settings.launcherTheme === "professional" ? "flex flex-col gap-6" : ""}
            >
              <h3 className={`text-[11px] font-mono font-bold uppercase tracking-[0.2em] ${settings.launcherTheme === "professional" ? "text-white pb-2 border-b border-white/[0.05]" : "text-muted-foreground mb-5"}`}>
                {group.title}
              </h3>
              <div className={`${settings.launcherTheme === "professional" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "gradient-border rounded-lg"}`}>
                <div className={`${settings.launcherTheme === "professional" ? "contents" : "divide-y divide-border rounded-lg bg-surface"}`}>
                  {group.items.map((item) => {
                    const enabled = settings[item.key];
                    
                    if (settings.launcherTheme === "professional") {
                      return (
                        <div key={item.key} className="flex flex-col gap-4 p-5 bg-black/40 border border-white/[0.05]">
                          <div className="flex items-start justify-between">
                            <div className="flex flex-col gap-1.5">
                              <p className="text-xs font-mono font-bold text-white uppercase tracking-widest">{item.label}</p>
                              <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">STATE: {enabled ? "ACTIVE" : "INACTIVE"}</p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={enabled}
                              onClick={() => toggle(item.key)}
                              className={`relative flex h-8 w-14 shrink-0 cursor-pointer items-center border transition-all duration-150 ${
                                enabled 
                                  ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]" 
                                  : "bg-black border-white/10"
                                }`}
                            >
                              <div
                                className={`absolute h-6 w-6 border transition-all duration-150 transform ${
                                  enabled 
                                    ? "translate-x-7 bg-emerald-400 border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.5)]" 
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
                    }

                    return (
                      <div key={item.key} className="flex items-center justify-between px-5 py-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          onClick={() => toggle(item.key)}
                          className={`flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${enabled ? "bg-primary" : "bg-muted"
                            }`}
                        >
                          <span
                            className={`block h-5 w-5 rounded-full bg-foreground transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"
                              }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/20 pb-10">
          <SettingsIcon className="h-3 w-3" />
          <span>Hades Architecture v2.0</span>
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsPage;
