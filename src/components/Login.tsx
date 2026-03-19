import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Mail, Lock, Minimize, X, CheckCircle2 } from "lucide-react";

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
        className="h-11 border-white/10 bg-white/5 pl-10 text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary/50"
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
    <div
      className="relative flex h-full w-full items-stretch justify-center"
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
              <CheckCircle2 className="h-16 w-16 text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.5)]" />
              <span className="text-sm font-semibold text-emerald-400">Welcome back</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0a0b0f]">
        {/* Custom window header (drag area + controls) */}
        {ipcRenderer && (
          <div
            className="absolute top-0 left-0 right-0 flex h-8 items-center justify-end px-1"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          >
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <button
                type="button"
                onClick={() => ipcRenderer.invoke("minimize-window")}
                className="flex h-7 w-8 items-center justify-center text-zinc-300/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                <Minimize className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => ipcRenderer.invoke("close-window")}
                className="flex h-7 w-8 items-center justify-center text-zinc-300/80 transition-colors hover:bg-red-500/80 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Background gradient / glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,180,0,0.12),transparent)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_110%,rgba(255,180,0,0.06),transparent)]" />

        <div className="relative mt-4 w-full max-w-[400px] px-6">
          {/* Logo + title */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 scale-150 rounded-full bg-primary/20 blur-2xl" />
              <img
                src="./logo.png"
                alt="Hades"
                className="relative h-20 w-20 object-contain drop-shadow-[0_0_20px_rgba(255,180,0,0.35)]"
              />
            </div>
            <div className="text-center">
              <h1 className="font-display text-2xl font-black tracking-[0.2em] text-foreground [text-shadow:0_0_30px_rgba(255,180,0,0.2)]">
                HADES
              </h1>
              <p className="mt-1 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                Management Suite
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
            <form onSubmit={handleLogin} className="space-y-4">
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
                className="mt-6 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(255,180,0,0.25)] hover:bg-primary/90 hover:shadow-[0_8px_28px_rgba(255,180,0,0.35)]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>Continue</>
                )}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
            Same account as on the website. Purchase licenses and manage your subscription there.
          </p>
        </div>
      </div>
    </div>
  );
}
