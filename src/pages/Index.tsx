import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minimize } from "lucide-react";
import Sidebar from "@/components/launcher/Sidebar";
import InjectPage from "@/components/launcher/InjectPage";
import ConfigPage from "@/components/launcher/ConfigPage";
import ChangelogPage from "@/components/launcher/ChangelogPage";
import SettingsPage from "@/components/launcher/SettingsPage";
import { ShaderBackground } from "@/components/launcher/ShaderBackground";
import { useSettings } from "@/context/SettingsContext";
import DebugReport from "@/components/launcher/DebugReport";
import AutoUpdater from "@/components/launcher/AutoUpdater";
import launcherBg from "@/assets/launcher-bg.jpg";

const API_HOST = "http://localhost";
const API_PORTS = [5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009];

import ProfilePage from "@/components/launcher/ProfilePage";
import VisualConfigPage from "@/components/launcher/VisualConfigPage";
import { ProfessionalHeader } from "@/components/launcher/ProfessionalHeader";

// ... (other imports)

export type Page = "inject" | "config" | "visual" | "changelog" | "settings" | "profile";

// ... (existing code)

export type Status = "searching" | "ready" | "injecting" | "success" | "error";

export interface Process {
  pid: number;
  name: string;
  displayName: string;
  mainWindowTitle: string;
}

export interface DllFile {
  name: string;
  path: string;
  size: number;
}

export interface BackendStatus {
  success: boolean;
  version: string;
  hasAdminPrivileges: boolean;
  dllFolder?: string;
  dllFolderExists?: boolean;
  dllCount?: number;
}

export interface LicenseStatus {
  active: boolean;
  unlimited: boolean;
  expires_at?: string | null;
}

const isElectron = typeof window !== "undefined" && (window as any).require;
const ipcRenderer = isElectron ? (window as any).require("electron").ipcRenderer : null;

// Same translucent glass effect for header and sidebar when shader theme
const SHADER_GLASS_CLASSES =
  "border-white/5 bg-black/30 shadow-[inset_0_1px_rgba(255,255,255,0.02),0_12px_48px_rgba(0,0,0,0.6)] backdrop-blur-[16px] backdrop-saturate-[180%]";

const Index = ({ profile, user, session, dllPayload }: { profile: any; user: any; session?: { access_token?: string } | null; dllPayload: { name: string; buffer: ArrayBuffer } | null }) => {
  const [activePage, setActivePage] = useState<Page>("inject");
  const [status, setStatus] = useState<Status>("searching");
  const [processes, setProcesses] = useState<Process[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [backendOnline, setBackendOnline] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [availableDlls, setAvailableDlls] = useState<DllFile[]>([]);
  const [selectedDll, setSelectedDll] = useState<string>("hades.dll");
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(`${API_HOST}:5000`);
  const [debugReport, setDebugReport] = useState<{
    success: boolean; message: string; backendSteps: string[]; frontendSteps: string[]; timestamp: string; duration: number;
  } | null>(null);
  const [showDebugReport, setShowDebugReport] = useState(false);

  const fetchWithTimeout = React.useCallback(async (url: string, init: RequestInit | undefined, timeoutMs: number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...(init ?? {}), signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  // Probe backend port (5000..5009) and pick the first that responds.
  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      for (const port of API_PORTS) {
        const base = `${API_HOST}:${port}`;
        try {
          const res = await fetchWithTimeout(`${base}/api/status`, undefined, 750);
          if (!res.ok) continue;
          const data = (await res.json()) as BackendStatus;
          if (data?.success) {
            if (!cancelled) setApiBaseUrl(base);
            return;
          }
        } catch {
          // ignore
        }
      }
    };

    probe();
    const interval = setInterval(probe, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const API_URL = React.useMemo(() => `${apiBaseUrl}/api`, [apiBaseUrl]);

  // When the DLL finishes downloading into RAM, automatically mark it as the selected payload
  useEffect(() => {
    if (dllPayload) {
      setSelectedDll(dllPayload.name);
      setAvailableDlls([{ name: dllPayload.name, path: "MEMORY", size: dllPayload.buffer.byteLength }]);
    }
  }, [dllPayload]);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetchWithTimeout(`${API_URL}/status`, undefined, 2000);
        const data: BackendStatus = await response.json();
        setBackendOnline(data.success);
        setBackendStatus(data);
      } catch {
        setBackendOnline(false);
        setBackendStatus(null);
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, [API_URL]);

  // Fetch license state from Supabase Edge Function (so UI matches server-side checks).
  useEffect(() => {
    let cancelled = false;

    const loadLicense = async () => {
      if (!session?.access_token) {
        setLicenseStatus(null);
        return;
      }

      try {
        const fnUrl =
          "https://szxxwxwityixqzzmarlq.supabase.co/functions/v1/launcher-check-subscription";

        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        const data = (await res.json().catch(() => ({}))) as Partial<LicenseStatus> & {
          expires_at?: string | null;
        };

        if (cancelled) return;

        if (!res.ok) {
          try {
            const errData = await res.json();
            throw new Error(errData.message || errData.error || `HTTP ${res.status}`);
          } catch {
            throw new Error(`HTTP ${res.status}`);
          }
        }

        setLicenseStatus({
          active: !!data.active,
          unlimited: !!data.unlimited,
          expires_at: data.expires_at ?? null,
        });
      } catch (err: any) {
        if (!cancelled) {
          setLicenseStatus({
            active: false,
            unlimited: false,
            expires_at: null,
          });
          import("sonner").then(({ toast }) => toast.error(`License check failed: ${err.message}`));
        }
      }
    };

    loadLicense();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!backendOnline) return;
    const fetchDlls = async () => {
      try {
        const response = await fetch(`${API_URL}/dlls`);
        const data = await response.json();
        if (data.success && data.dlls) {
          setAvailableDlls(data.dlls);
          if (data.dlls.length > 0 && !selectedDll) {
            setSelectedDll(data.dlls[0].name);
          }
        } else {
          setAvailableDlls([]);
        }
      } catch {
        setAvailableDlls([]);
      }
    };
    fetchDlls();
    const interval = setInterval(fetchDlls, 2000);
    return () => clearInterval(interval);
  }, [API_URL, backendOnline, selectedDll]);

  const { settings } = useSettings();
  const theme = (settings.launcherTheme ?? "default") as "default" | "minimal" | "professional" | "shader" | "vanguard";

  const hexToHslString = (hex: string) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };
  const primaryHsl = settings.primaryColor ? hexToHslString(settings.primaryColor) : "0 0% 100%";

  useEffect(() => {
    if (ipcRenderer) {
      if (theme === "vanguard") {
        ipcRenderer.invoke("resize-window", { width: 1200, height: 780 });
      } else if (theme === "professional") {
        ipcRenderer.invoke("resize-window", { width: 1250, height: 780 });
      } else {
        ipcRenderer.invoke("resize-window", { width: 1150, height: 720 });
      }
    }
  }, [theme]);

  useEffect(() => {
    if (!backendOnline) return;
    const detectProcess = async () => {
      try {
        const response = await fetch(`${API_URL}/processes`);
        const data = await response.json();
        if (data.success && data.processes?.length > 0) {
          const list: Process[] = data.processes;
          setProcesses(list);
          setSelectedProcess((prev) => {
            const stillInList = prev && list.some((p) => p.pid === prev.pid);
            return stillInList ? prev : list[0];
          });
          if (selectedDll && status !== "injecting" && status !== "success") setStatus("ready");
        } else {
          setProcesses([]);
          setSelectedProcess(null);
          if (status !== "injecting" && status !== "success") setStatus("searching");
        }
      } catch (e) {
        console.error("Failed to detect process:", e);
      }
    };
    detectProcess();
    const interval = setInterval(detectProcess, 2000);
    return () => clearInterval(interval);
  }, [API_URL, backendOnline, selectedDll, status]);

  const handleInject = async (processOverride?: Process) => {
    const process = processOverride ?? selectedProcess;
    if (!process) {
      setStatus("error");
      setErrorMessage("Please select a process.");
      return;
    }
    setStatus("injecting");
    setErrorMessage("");
    const feSteps: string[] = [];
    const startTime = performance.now();
    const feLog = (msg: string) => feSteps.push(`[${Math.round(performance.now() - startTime).toString().padStart(5)}ms] ${msg}`);

    try {
      feLog("Injection started");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
        feLog(`Auth token attached (${session.access_token.length} chars)`);
      } else {
        feLog("No auth token — proceeding without authentication");
      }
      
      let base64Dll = "";
      let payloadName = selectedDll || "hades.dll";

      if (dllPayload && !settings.useLocalFallback) {
        feLog(`Encoding cloud DLL to Base64: ${dllPayload.name} (${(dllPayload.buffer.byteLength / 1024).toFixed(0)} KB)`);
        const blob = new Blob([dllPayload.buffer]);
        base64Dll = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes(",") ? result.split(",")[1] : result);
          };
          reader.readAsDataURL(blob);
        });
        payloadName = dllPayload.name;
        feLog(`Base64 encoded: ${(base64Dll.length / 1024).toFixed(0)} KB`);
      } else if (dllPayload && settings.useLocalFallback) {
        feLog("Cloud DLL available but useLocalFallback is ON — using local DLL");
      } else {
        feLog("No cloud DLL in memory — backend will use local fallback");
      }

      feLog(`Sending POST to ${API_URL}/inject`);
      feLog(`Payload: PID=${process.pid}, name=${payloadName}, ephemeral=${!!base64Dll}, bytes=${base64Dll.length > 0 ? (base64Dll.length / 1024).toFixed(0) + 'KB' : 'none'}`);

      const response = await fetch(`${API_URL}/inject`, {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          processId: process.pid, 
          dllName: payloadName,
          dllBytesBase64: base64Dll,
          ephemeral: !!base64Dll,
          requireSubscription: settings.requireSubscription
        }),
      });
      feLog(`Backend responded: HTTP ${response.status}`);
      const data = await response.json();
      feLog(`Result: ${data.success ? "SUCCESS" : "FAILED"} — ${data.message || data.error || '(no message)'}`);

      const elapsed = Math.round(performance.now() - startTime);
      setDebugReport({
        success: data.success,
        message: data.message || data.error || "Unknown",
        backendSteps: data.steps || [],
        frontendSteps: feSteps,
        timestamp: new Date().toLocaleString(),
        duration: elapsed,
      });
      setShowDebugReport(true);

      if (data.success) {
        setStatus("success");
        import("sonner").then(({ toast }) => toast.success(data.message || "Injection successful!"));
        setTimeout(() => (selectedProcess ? setStatus("ready") : setStatus("searching")), 5000);
      } else {
        setStatus("error");
        setErrorMessage(data.message || data.error || "Injection failed");
        setTimeout(() => (selectedProcess ? setStatus("ready") : setStatus("searching")), 5000);
      }
    } catch (err: any) {
      let msg = err.message;
      if (msg === "fetch failed" || msg.includes("Failed to fetch")) msg += " (Is the Dotnet Backend running?)";
      feLog(`✘ EXCEPTION: ${msg}`);
      const elapsed = Math.round(performance.now() - startTime);
      setDebugReport({
        success: false,
        message: msg,
        backendSteps: [],
        frontendSteps: feSteps,
        timestamp: new Date().toLocaleString(),
        duration: elapsed,
      });
      setShowDebugReport(true);
      setStatus("error");
      setErrorMessage(msg);
      setTimeout(() => (selectedProcess ? setStatus("ready") : setStatus("searching")), 5000);
    }
  };

  const canInject = status === "ready" && backendOnline && !!selectedProcess && !!selectedDll;

  const handleInjectClick = () => {
    // Make the button actionable even when "disabled" so users see the reason.
    if (status === "success") return;
    if (!backendOnline) {
      setStatus("error");
      setErrorMessage(`Backend offline (trying ${apiBaseUrl}). Start backend: cd backend && dotnet run`);
      return;
    }
    if (!selectedDll) {
      // No cloud DLL synced — the backend will find the local DLL automatically
      setSelectedDll("hades.dll");
    }
    
    
    // Cloud sync is optional — backend will fall back to local DLL if no bytes are sent

    if (!selectedProcess) {
      setStatus("error");
      setErrorMessage("No target process detected/selected. Start the game/app first, then select it.");
      return;
    }
    if (status !== "ready") {
      setStatus("error");
      setErrorMessage(`Not ready yet (state: ${status}). Wait for the process scan to finish.`);
      return;
    }
    handleInject();
  };

  const pages: Record<Page, React.ReactNode> = {
    inject: (
      <InjectPage
        status={status}
        processes={processes}
        selectedProcess={selectedProcess}
        onSelectProcess={setSelectedProcess}
        errorMessage={errorMessage}
        backendOnline={backendOnline}
        backendStatus={backendStatus}
        availableDlls={availableDlls}
        selectedDll={selectedDll}
        onSelectDll={setSelectedDll}
        canInject={canInject}
        onInject={handleInjectClick}
        theme={theme}
        apiBaseUrl={apiBaseUrl}
      />
    ),
    config: <ConfigPage theme={theme} />,
    visual: <VisualConfigPage />,
    changelog: <ChangelogPage />,
    settings: <SettingsPage backendOnline={backendOnline} />,
    profile: <ProfilePage profile={profile} user={user} licenseStatus={licenseStatus} />,
  };

  const isVanguard = theme === "vanguard";
  const windowRadius = isVanguard ? "2.5rem" : "1.25rem";
  const clipPath = `inset(0 round ${windowRadius})`;
  return (
    <>
    <style suppressHydrationWarning>{`
      .theme-professional {
        --primary: ${primaryHsl};
        --ring: ${primaryHsl};
        --gold: ${primaryHsl};
        --gold-light: ${primaryHsl};
        --gold-dark: ${primaryHsl};
      }
    `}</style>
    <div
      className={`flex h-full w-full min-h-0 min-w-0 min-h-screen ${theme === "professional" ? "theme-professional" : ""}`}
      style={{
        borderRadius: windowRadius,
        overflow: "hidden",
        clipPath,
        WebkitClipPath: clipPath,
      }}
    >
      {/* Background: theme-based (default = glass, minimal = solid, shader = premium mesh) */}
      <div
        key={`launcher-bg-${theme}`}
        className="absolute inset-0 z-0"
        style={{
          borderRadius: windowRadius,
          overflow: "hidden",
          clipPath,
          WebkitClipPath: clipPath,
        }}
      >
        {theme === "default" && (
          <>
            <img
              src={launcherBg}
              alt=""
              className="launcher-bg-image h-full w-full object-cover opacity-30"
            />
            <div className="launcher-bg-glow absolute inset-0 pointer-events-none" />
            <div className="launcher-bg-glass absolute inset-0 pointer-events-none" />
          </>
        )}
        {theme === "minimal" && (
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card" />
        )}
        {theme === "professional" && (
          <div className="absolute inset-0 z-0 bg-[#020202] overflow-hidden">
            {/* Deep spatial center glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120vw] h-[120vh] bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.03)_0%,_transparent_60%)] pointer-events-none" />
            
            {/* Faint blue/purple atmospheric lights */}
            <motion.div
              animate={{ 
                opacity: [0.3, 0.5, 0.3],
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-[radial-gradient(circle,_rgba(120,80,255,0.05)_0%,_transparent_70%)] blur-3xl pointer-events-none rounded-full"
            />
            <motion.div
              animate={{ 
                opacity: [0.2, 0.4, 0.2],
                scale: [1, 1.05, 1],
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-[-10%] left-[-20%] w-[50%] h-[50%] bg-[radial-gradient(circle,_rgba(255,255,255,0.02)_0%,_transparent_70%)] blur-3xl pointer-events-none rounded-full"
            />

            {/* Grain texture overlay */}
            <div 
              className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
            />
          </div>
        )}
        {theme === "shader" && (
          <>
            <div className="absolute inset-0 h-full w-full min-h-0 min-w-0" style={{ minHeight: "100%", minWidth: "100%" }}>
              <div className="absolute inset-0 bg-gradient-to-b from-[#08090d] via-[#101428] to-[#0a0c12]" aria-hidden />
              <ShaderBackground />
            </div>
            <div className="launcher-bg-shader-overlay absolute inset-0 pointer-events-none" />
          </>
        )}
        {theme === "vanguard" && (
          <div className="absolute inset-0 bg-[#020308] overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#1a1b3b_0%,transparent_50%)] opacity-60" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,#2d1b3b_0%,transparent_60%)] opacity-40" />
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-[20%] -left-[10%] h-[80%] w-[80%] rounded-full bg-[#7161ef]/10 blur-[120px]"
            />
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute -bottom-[20%] -right-[10%] h-[70%] w-[70%] rounded-full bg-[#ff5d8d]/5 blur-[100px]"
            />
          </div>
        )}
      </div>

      <motion.div
        initial={{ scale: 0.99, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={`relative z-10 flex min-h-0 min-w-0 h-full w-full flex-col transition-all duration-1000 ${isVanguard ? "p-4" : ""}`}
        style={{
          borderRadius: windowRadius,
          overflow: "hidden",
          clipPath,
          WebkitClipPath: clipPath,
          boxShadow: isVanguard || theme === "professional" ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.03)",
          background: "transparent",
        }}
      >
        {theme === "professional" ? (
          // --- THE MONOLITH: Immersive Top-Nav Layout ---
          <div className="relative flex flex-1 w-full h-full flex-col overflow-hidden bg-transparent">
            {/* Window Controls integrated into ProfessionalHeader */}

            <ProfessionalHeader 
              activePage={activePage} 
              onNavigate={setActivePage} 
              backendOnline={backendOnline} 
              licenseStatus={licenseStatus}
              profile={profile}
              user={user}
            />

            {/* Main Content Area */}
            <main
              className="flex-1 flex flex-col pt-8 pb-8 px-12 h-full overflow-hidden relative z-10"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <AnimatePresence mode="wait">
                <motion.div 
                  key={activePage} 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.6 }}
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  {pages[activePage as Page]}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        ) : (
          // --- STANDARD / VANGUARD / DEFAULT LAYOUT ---
          <div className={`flex flex-col flex-1 min-h-0 w-full transition-all duration-1000 ${isVanguard ? "rounded-[2rem] bg-black/40 backdrop-blur-2xl border border-white/5 shadow-[0_32px_128px_rgba(0,0,0,0.8)] overflow-hidden" : ""}`}>
            {/* Header bar: same color as sidebar (solid or glass when shader) */}
            <div
              className={`flex h-11 w-full shrink-0 items-center justify-end overflow-hidden pr-1 transition-colors duration-500 ${theme === "shader" || isVanguard
                ? `border-b border-white/5 ${isVanguard ? "bg-white/5" : SHADER_GLASS_CLASSES}`
                : "border-b border-border bg-sidebar shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                }`}
              style={{
                borderTopLeftRadius: windowRadius,
                borderTopRightRadius: windowRadius,
                ...(ipcRenderer ? { WebkitAppRegion: "drag" } as any : {}),
              }}
            >
              {/* Window controls (right) */}
              <div
                className="flex items-center gap-1"
                style={ipcRenderer ? { WebkitAppRegion: "no-drag" } as any : undefined}
              >
                {ipcRenderer && (
                  <button
                    type="button"
                    onClick={() => ipcRenderer.invoke("minimize-window")}
                    className="flex h-8 w-10 items-center justify-center text-sidebar-foreground/60 transition-all hover:bg-white/[0.05] hover:text-foreground"
                  >
                    <Minimize className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => ipcRenderer ? ipcRenderer.invoke("close-window") : window.close()}
                  className="group flex h-8 w-11 items-center justify-center text-sidebar-foreground/60 transition-all hover:bg-red-500/80 hover:text-white"
                >
                  <X className="h-4 w-4 transition-transform group-hover:scale-110" />
                </button>
              </div>
            </div>

            {/* Card body (sidebar + content) — semi-transparent when shader theme so background shows through */}
            <div
              className={`flex min-h-0 flex-1 border-t-0 transition-colors duration-500 ${theme === "shader" || isVanguard ? "bg-black/10" : "bg-card"}`}
              style={{ borderBottomLeftRadius: isVanguard ? 0 : windowRadius, borderBottomRightRadius: isVanguard ? 0 : windowRadius }}
            >
              <div className="flex min-h-0 flex-1 flex-row">
                <Sidebar
                  activePage={activePage}
                  onNavigate={setActivePage}
                  backendOnline={backendOnline}
                  backendStatus={backendStatus}
                  licenseStatus={licenseStatus}
                  isShaderTheme={theme === "shader"}
                  theme={theme}
                  shaderGlassClasses={SHADER_GLASS_CLASSES}
                  profile={profile}
                  user={user}
                />

                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 md:p-8" style={ipcRenderer ? { WebkitAppRegion: "no-drag" } as React.CSSProperties : undefined}>
                    <AnimatePresence mode="wait">
                      <div key={activePage} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        {pages[activePage]}
                      </div>
                    </AnimatePresence>
                  </main>
                </div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
    <DebugReport open={showDebugReport} onClose={() => setShowDebugReport(false)} report={debugReport} />
    <AutoUpdater />
    </>
  );
};

export default Index;

