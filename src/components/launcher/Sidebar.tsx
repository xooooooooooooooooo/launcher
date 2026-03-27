import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Zap, Sliders, ListOrdered, Settings, User, LogOut, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Page } from "@/pages/Index";
import type { BackendStatus } from "@/pages/Index";
import type { LicenseStatus } from "@/pages/Index";

const navItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: "inject", label: "Inject", icon: Zap },
  { id: "config", label: "Config", icon: Sliders },
  { id: "changelog", label: "Changelog", icon: ListOrdered },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  backendOnline?: boolean;
  backendStatus?: BackendStatus | null;
  licenseStatus?: LicenseStatus | null;
  isShaderTheme?: boolean;
  /** Same glass effect classes as header (from Index) */
  shaderGlassClasses?: string;
  profile?: any;
  user?: any;
  theme?: string;
}

function getLicenseLabel(profile: any): string {
  const end = profile?.subscription_end_date;
  if (!end) return "Inactive";
  const endDate = new Date(end);
  const now = new Date();
  if (endDate.getTime() < now.getTime()) return "Expired";
  const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 7) return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  return `Expires ${endDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
}

const Sidebar = ({
  activePage,
  onNavigate,
  backendOnline,
  backendStatus,
  licenseStatus,
  isShaderTheme,
  shaderGlassClasses,
  profile,
  user,
  theme,
}: SidebarProps) => {
  const navigate = useNavigate();
  const isVanguard = theme === "vanguard";
  const licenseLabel = React.useMemo(() => {
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
    return getLicenseLabel(profile);
  }, [licenseStatus, profile]);

  const handleLogOut = async () => {
    const { supabase } = await import("@/lib/supabaseClient");
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  const glassClasses = isVanguard
    ? "border-none bg-transparent"
    : shaderGlassClasses ?? "border-white/10 bg-black/40 shadow-[inset_0_1px_0_1px_rgba(255,255,255,0.02)] backdrop-blur-3xl backdrop-saturate-150";

  // Professional Floating Bottom Dock Layout
  if (theme === "professional") {
    return (
      <div
        className="professional-sidebar relative flex flex-col items-center justify-between w-20 py-8 border border-white/10 bg-white/[0.03] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.05)] backdrop-blur-[40px] z-40 h-[95%] my-auto rounded-[2rem] ml-2"
        style={{ WebkitAppRegion: "drag", backdropFilter: "blur(40px) saturate(150%)" } as React.CSSProperties}
      >
        {/* Top Section: Logo */}
        <div className="flex flex-col items-center gap-6" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="flex items-center justify-center">
            <img src="./logo.png" alt="Hades" className="h-8 w-8 object-contain opacity-90 saturate-0 brightness-200" />
          </div>

          <div className="w-8 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Middle Section: Nav Items */}
          <nav className="flex flex-col items-center gap-2">
            {navItems.map((item) => {
              const isActive = activePage === item.id;
              return (
                <div key={item.id} className="group relative">
                  <button
                    onClick={() => onNavigate(item.id)}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300 ${isActive
                      ? "bg-white/[0.1] text-white shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)] border border-white/[0.05]"
                      : "text-white/40 hover:text-white hover:bg-white/[0.04]"}`}
                  >
                    <item.icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.5} />
                    {isActive && (
                      <motion.div
                        layoutId="nav-active-pro"
                        className="absolute -left-[5px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-white opacity-90 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      />
                    )}
                  </button>
                  {/* Tooltip */}
                  <div className="absolute left-[130%] top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-[#111]/90 backdrop-blur-md border border-white/10 text-white/90 text-xs font-medium tracking-wide opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shadow-xl whitespace-nowrap z-50">
                    {item.label}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Profile & Status */}
        <div className="flex flex-col items-center gap-5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          
          <div className="w-8 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Status dot */}
          {backendStatus && (
            <div className="group relative flex items-center justify-center">
              <div className={`h-2.5 w-2.5 rounded-full border border-black/50 ${backendOnline ? "bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]" : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]"}`} />
              <div className="absolute left-[200%] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-[#111]/90 backdrop-blur-md border border-white/10 text-white/90 text-[10px] font-medium tracking-wide opacity-0 -translate-x-1 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 shadow-xl whitespace-nowrap z-50">
                {backendOnline ? "Backend Online" : "Backend Offline"}
              </div>
            </div>
          )}

          {/* User avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 hover:border-white/30 transition-colors duration-300 outline-none bg-white/5 shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-5 w-5 text-white/70" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" sideOffset={20} className="w-56 rounded-xl border border-white/10 bg-[#0A0A0A]/95 backdrop-blur-2xl shadow-[0_20px_40px_rgba(0,0,0,0.8)] py-1.5">
              <DropdownMenuLabel className="font-normal px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-white">{profile?.username || "Developer"}</span>
                  <span className="text-[11px] text-white/40">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onSelect={() => onNavigate("settings")} className="cursor-pointer gap-2.5 px-3 py-2 text-white/70 focus:text-white focus:bg-white/10 text-xs rounded-md mx-1">
                <Settings className="h-[14px] w-[14px]" /> Configuration
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onNavigate("profile")} className="cursor-pointer gap-2.5 px-3 py-2 text-white/70 focus:text-white focus:bg-white/10 text-xs rounded-md mx-1">
                <User className="h-[14px] w-[14px]" /> View Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onSelect={handleLogOut} className="cursor-pointer gap-2.5 px-3 py-2 text-red-400 focus:text-red-300 focus:bg-red-500/10 text-xs rounded-md mx-1">
                <LogOut className="h-[14px] w-[14px]" /> Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Default Sidebar Layout
  return (
    <div
      className={`flex h-full min-w-[160px] w-[clamp(160px,22%,260px)] max-w-[260px] shrink-0 flex-col transition-all duration-700 ${isShaderTheme || isVanguard ? `border-r border-white/5 ${glassClasses}` : "border-r border-border bg-sidebar"
        }`}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <div className={`flex flex-col items-center transition-all duration-700 ${isVanguard ? "py-14 gap-4" : "py-10"}`}>
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-4"
        >
          <div className="absolute inset-0 scale-150 blur-2xl opacity-20 rounded-full bg-primary/40" />
          <img
            src="./logo.png"
            alt="Hades"
            className="relative h-16 w-16 object-contain drop-shadow-[0_0_15px_rgba(255,180,0,0.3)]"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-1"
        >
          <h1 className="font-display text-2xl font-black tracking-[0.2em] text-foreground gold-glow">
            HADES
          </h1>
          <div className="h-px w-8 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <span className="text-[9px] font-bold tracking-[0.4em] text-muted-foreground/60 uppercase">
            Management Suite
          </span>
        </motion.div>
        {backendStatus && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[9px]">
            <div className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5">
              <div className={`h-1 w-1 rounded-full ${backendOnline ? "bg-primary" : "bg-red-400"} animate-pulse`} />
              <span className="font-medium text-muted-foreground/80 uppercase tracking-wider">Interface</span>
            </div>
            {backendStatus.dllFolderExists && (
              <div className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-2 py-0.5">
                <span className="font-medium text-muted-foreground/80 uppercase tracking-wider">{backendStatus.dllCount} Modules</span>
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-4">
        {navItems.map((item, i) => {
          const isActive = activePage === item.id;
          return (
            <motion.button
              key={item.id}
              initial={{ x: -10, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              onClick={() => onNavigate(item.id)}
              className={`group relative flex min-h-[42px] items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all duration-300 ${isActive
                ? "text-primary translate-x-1"
                : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                }`}
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${isActive ? "bg-primary/15 text-primary scale-110" : "bg-transparent group-hover:bg-white/5"}`}>
                <item.icon className="h-4 w-4 shrink-0" />
              </div>
              <span className={`text-[13px] font-semibold tracking-tight transition-all ${isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"}`}>
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  className="absolute left-1 h-1 w-1 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Account – left bottom corner, click opens profile menu */}
      <div className={`shrink-0 border-t px-3 py-3 ${isShaderTheme ? "border-white/10" : "border-sidebar-border"}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`group flex w-full items-center gap-3 rounded-full py-2 px-2 text-left transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-primary/30 ${isShaderTheme
                ? "bg-white/[0.04] border border-white/5 hover:bg-white/[0.08] hover:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_20px_rgba(0,0,0,0.3)]"
                : "bg-sidebar-accent/50 hover:bg-sidebar-accent border border-sidebar-border"
                }`}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/20 ring-1 ring-primary/30 group-hover:ring-primary/50 group-hover:scale-105 transition-all duration-300">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (next) next.style.display = "flex";
                    }}
                  />
                ) : (
                  <User className="h-4 w-4 text-primary" />
                )}
                <span className="hidden h-full w-full items-center justify-center bg-primary/20 text-xs font-semibold text-primary" style={{ display: "none" }}>
                  {(profile?.username || user?.email || "?")[0].toUpperCase()}
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate text-xs font-bold tracking-tight text-foreground transition-all group-hover:text-primary">
                  {profile?.username || user?.email?.split("@")[0] || "Account"}
                </span>
                <span className={`truncate text-[9px] font-medium ${licenseLabel === "Inactive" ? "text-muted-foreground/60" : licenseLabel === "Expired" ? "text-destructive/90" : "text-primary/80"}`}>
                  {licenseLabel}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56 rounded-2xl border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium uppercase tracking-wider">
                  {profile?.username || "Authorized User"}
                </span>
                <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                <span className={`text-[11px] font-medium mt-0.5 ${licenseLabel === "Inactive" ? "text-muted-foreground/70" : licenseLabel === "Expired" ? "text-destructive/90" : "text-primary/80"}`}>
                  License: {licenseLabel}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onNavigate("settings")} className="cursor-pointer gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNavigate("profile")} className="cursor-pointer gap-2">
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogOut} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default Sidebar;

