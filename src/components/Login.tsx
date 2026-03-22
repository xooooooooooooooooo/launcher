import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Minimize, X, CheckCircle2 } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface LoginProps {
  onLoginSuccess: () => void;
}

interface InputGroupProps {
  id: string;
  type: string;
  label: string;
  placeholder: string;
  value: string;
  icon: React.ElementType;
  onChange: (val: string) => void;
}

const InputGroup = ({ id, type, label, placeholder, value, icon: Icon, onChange }: InputGroupProps) => (
  <div className="space-y-2">
    <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
      {label}
    </Label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="h-11 rounded-xl border-white/5 bg-black/20 pl-10 text-white placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-primary/50 transition-all font-medium backdrop-blur-md"
      />
    </div>
  </div>
);

const isElectron = typeof window !== "undefined" && (window as any).require;
const ipcRenderer = isElectron ? (window as any).require("electron").ipcRenderer : null;

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const { settings } = useSettings();

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
      ipcRenderer.invoke("resize-window", { width: 440, height: 680 });
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error("Login failed: " + error.message);
      } else if (data.user) {
        toast.success("Logged in successfully!");
        setShowSuccess(true);
        onLoginSuccess();
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <style suppressHydrationWarning>{`
      .login-theme {
        --primary: ${primaryHsl};
        --ring: ${primaryHsl};
      }
    `}</style>
    <div
      className="login-theme relative flex h-full w-full items-stretch justify-center select-none"
      style={{ borderRadius: 24, overflow: "hidden" }}
    >
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0b0f]/95 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="flex flex-col items-center gap-3"
            >
              <CheckCircle2 className="h-16 w-16 text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.5)]" />
              <span className="text-sm font-semibold text-primary">Welcome back</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#030303]">
        {/* Subtle Grid Pattern from Professional Theme */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none" 
          style={{ 
            backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
            backgroundSize: '40px 40px' 
          }} 
        />

        {/* Custom window header (drag area + controls) */}
        {ipcRenderer && (
          <div
            className="absolute top-0 left-0 right-0 z-50 flex h-11 items-center justify-end px-1"
            style={{ WebkitAppRegion: "drag", borderTopLeftRadius: 24, borderTopRightRadius: 24 } as React.CSSProperties}
          >
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <button
                type="button"
                onClick={() => ipcRenderer.invoke("minimize-window")}
                className="flex h-8 w-10 items-center justify-center text-white/50 transition-colors hover:bg-white/10 hover:text-white rounded-md"
              >
                <Minimize className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => ipcRenderer.invoke("close-window")}
                className="flex h-8 w-11 items-center justify-center text-white/50 transition-colors hover:bg-red-500/80 hover:text-white rounded-md mr-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="relative z-10 w-full max-w-[400px] px-6">
          {/* Logo + title */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative"
            >
              <div className="absolute inset-0 scale-[1.5] rounded-full bg-white/5 blur-[20px]" />
              <img
                src="./logo.png"
                alt="Hades"
                className="relative h-20 w-20 object-contain saturate-0 brightness-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] pointer-events-none select-none"
                draggable="false"
              />
            </motion.div>
            <motion.div 
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center"
            >
              <h1 className="font-display text-2xl font-black tracking-[0.25em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                HADES
              </h1>
              <p className="mt-1.5 text-[10px] font-bold tracking-[0.3em] text-primary uppercase">
                Management Suite
              </p>
            </motion.div>
          </div>

          {/* Card */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-8 backdrop-blur-md shadow-2xl"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.08),transparent_70%)] pointer-events-none" />
            <form onSubmit={handleLogin} className="relative z-10 space-y-4">
              <InputGroup
                id="email"
                type="email"
                label="Email"
                placeholder="name@example.com"
                value={email}
                icon={Mail}
                onChange={setEmail}
              />
              <InputGroup
                id="password"
                type="password"
                label="Password"
                placeholder="••••••••"
                value={password}
                icon={Lock}
                onChange={setPassword}
              />
              <Button
                type="submit"
                disabled={loading}
                className="mt-6 h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.3)] hover:brightness-110 transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>Authenticate</>
                )}
              </Button>
            </form>
          </motion.div>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-8 text-center text-xs font-medium text-white/40"
          >
            A Hades Network License is required to enter.
          </motion.p>
        </div>
      </div>
    </div>
    </>
  );
}

