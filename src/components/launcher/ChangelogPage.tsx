import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";

const CHANGELOG_URL = import.meta.env.VITE_CHANGELOG_URL as string | undefined;
const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
const FALLBACK_CHANGELOG_URL = `${API_BASE}/api/changelog`;

const POLL_INTERVAL_MS = 60_000;

async function fetchChangelog(): Promise<{ text: string; version?: string }> {
  const url = CHANGELOG_URL || FALLBACK_CHANGELOG_URL;
  const response = await fetch(url, { cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (contentType.includes("application/json")) {
    try {
      const json = JSON.parse(raw) as { changelog?: string; content?: string; version?: string };
      const text = json.changelog ?? json.content ?? raw;
      return { text: typeof text === "string" ? text : raw, version: json.version };
    } catch {
      return { text: raw };
    }
  }
  return { text: raw };
}

const ChangelogPage = () => {
  const [changelog, setChangelog] = useState<string>("Loading...");
  const [version, setVersion] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevTextRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);
        const { text, version: v } = await fetchChangelog();
        if (cancelled) return;
        setChangelog(text || "No changelog available.");
        if (v) setVersion(v);
        if (prevTextRef.current && prevTextRef.current !== text) {
          setIsUpdating(true);
          setTimeout(() => setIsUpdating(false), 3000);
        }
        prevTextRef.current = text;
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load changelog";
        setError(msg);
        setChangelog("Changelog could not be loaded. Updates are published from the website.");
      }
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 shrink-0">
        <div>
          <h2 className="font-display text-4xl font-black tracking-tight text-foreground">
            Changelog
          </h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground/60">
            Evolution of the Hades Management Suite. Updates when we push new versions on the site.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {version && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              v{version}
            </span>
          )}
          {isUpdating && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary border border-primary/20"
            >
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Update received
            </motion.div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        <div className="h-full w-full overflow-auto rounded-[2rem] border border-white/5 bg-black/20 p-8 backdrop-blur-sm custom-scrollbar">
          <div className="space-y-6 text-[13px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap font-mono selection:bg-primary/30">
            {changelog}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChangelogPage;
