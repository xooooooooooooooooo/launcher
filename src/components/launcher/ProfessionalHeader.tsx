import React from "react";
import { motion } from "framer-motion";
import { Cpu, Settings, Eye, LogOut, User, Minimize, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { LicenseStatus } from "@/pages/Index";
interface HeaderProps {
  activePage: string;
  onNavigate: (page: any) => void;
  backendOnline: boolean;
  licenseStatus?: LicenseStatus | null;
  profile?: any;
  user?: any;
}

const navItems = [
  { id: "inject", label: "INJECTOR", icon: Cpu },
  { id: "settings", label: "SYSTEM", icon: Settings },
  { id: "visual", label: "VISUALS", icon: Eye },
];

const isElectron = typeof window !== "undefined" && (window as any).require;
const ipcRenderer = isElectron ? (window as any).require("electron").ipcRenderer : null;

export const ProfessionalHeader: React.FC<HeaderProps> = ({
  activePage,
  onNavigate,
  backendOnline,
  licenseStatus,
  profile,
  user,
}) => {
  const navigate = useNavigate();

  const handleLogOut = async () => {
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      await supabase.auth.signOut();
      navigate("/", { replace: true });
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const licenseLabel = React.useMemo(() => {
    // Prefer server-side license state.
    if (licenseStatus?.unlimited) return "Unlimited";
    if (licenseStatus && !licenseStatus.active) return "Inactive";
    if (licenseStatus?.active && licenseStatus.expires_at) {
      const endDate = new Date(licenseStatus.expires_at);
      const now = new Date();
      if (endDate.getTime() < now.getTime()) return "Expired";
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
      return `Expires ${endDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
    }

    // Fallback to the DB field used previously.
    const end = profile?.subscription_end_date;
    if (!end) return "Inactive";
    const endDate = new Date(end);
    const now = new Date();
    if (endDate.getTime() < now.getTime()) return "Expired";
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
    return `Expires ${endDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  }, [licenseStatus, profile]);

  return (
    <header 
      className="shrink-0 h-16 flex items-center justify-between pl-8 pr-6 relative z-50 bg-black/40 backdrop-blur-md border-b border-white/5"
      style={{ WebkitAppRegion: "drag", userSelect: "none" } as any}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <img src="./logo.png" alt="Hades" className="h-6 w-6 object-contain opacity-90 saturate-0 brightness-200" />
          <span className="text-white font-bold tracking-widest text-sm uppercase">Hades</span>
        </div>
        
        <div className="h-4 w-px bg-white/20 mx-2" />

        <div className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`relative px-4 py-1.5 rounded-sm transition-colors text-xs font-mono tracking-widest flex items-center gap-2 ${
                  isActive 
                    ? "text-white bg-white/10" 
                    : "text-white/40 hover:text-white/80 hover:bg-white/5"
                }`}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="top-nav-active"
                    className="absolute bottom-0 left-0 right-0 h-[1px] bg-white"
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className={`h-2 w-2 rounded-full ${backendOnline ? "bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`} />
          <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase">
            {backendOnline ? "SYS: ON" : "SYS: ERR"}
          </span>
        </div>
        
        <div className="h-4 w-px bg-white/20" />

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <button 
            onClick={() => onNavigate("profile")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors cursor-pointer border ${
              activePage === "profile" 
                ? "bg-white/10 border-white/20 text-white" 
                : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
            }`}
            title="Access Profile"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
            ) : (
              <User className="w-4 h-4" />
            )}
            <span className="text-xs font-mono tracking-wider font-bold uppercase">
              {profile?.username || user?.email?.split("@")[0] || "ADMIN"}
            </span>
          </button>

          <button
            onClick={handleLogOut}
            className="flex items-center justify-center p-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/80 hover:text-white hover:border-red-500 transition-all cursor-pointer h-[32px] w-[32px]"
            title="Disconnect Session"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {ipcRenderer && (
          <>
            <div className="h-4 w-px bg-white/20 ml-2" />
            <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
              <button
                type="button"
                onClick={() => ipcRenderer.invoke("minimize-window")}
                className="flex h-7 w-7 items-center justify-center rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white/50 hover:text-white transition-all cursor-pointer relative z-[100]"
              >
                <Minimize className="h-3 w-3 pointer-events-none" />
              </button>
              <button
                type="button"
                onClick={() => ipcRenderer.invoke("close-window")}
                className="flex h-7 w-7 items-center justify-center rounded bg-red-500/10 border border-red-500/20 hover:bg-red-500/80 hover:border-red-500 text-red-500 hover:text-white transition-all cursor-pointer relative z-[100]"
              >
                <X className="h-3.5 w-3.5 pointer-events-none" />
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};


