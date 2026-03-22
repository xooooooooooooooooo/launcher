import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, RefreshCw, AlertCircle, X, ChevronRight } from "lucide-react";

const isElectron = typeof window !== "undefined" && (window as any).require;
const ipcRenderer = isElectron ? (window as any).require("electron").ipcRenderer : null;

export default function AutoUpdater() {
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null);
  const [progress, setProgress] = useState<{ percent: number } | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ipcRenderer) return;

    const onAvailable = (_: any, info: any) => {
      setUpdateInfo(info);
      setVisible(true);
    };
    const onProgress = (_: any, prg: any) => {
      setProgress(prg);
    };
    const onDownloaded = () => {
      setIsDownloaded(true);
      setProgress(null);
    };
    const onError = (_: any, err: string) => {
      setError(err);
      setProgress(null);
    };

    ipcRenderer.on("updater:available", onAvailable);
    ipcRenderer.on("updater:progress", onProgress);
    ipcRenderer.on("updater:downloaded", onDownloaded);
    ipcRenderer.on("updater:error", onError);

    return () => {
      ipcRenderer.removeListener("updater:available", onAvailable);
      ipcRenderer.removeListener("updater:progress", onProgress);
      ipcRenderer.removeListener("updater:downloaded", onDownloaded);
      ipcRenderer.removeListener("updater:error", onError);
    };
  }, []);

  const handleDownload = () => {
    if (!ipcRenderer) return;
    setProgress({ percent: 0 }); // Optimistic UI
    ipcRenderer.invoke("app:download-update");
  };

  const handleInstall = () => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke("app:quit-and-install");
  };

  const handleClose = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-white/10 bg-black/80 p-5 shadow-2xl backdrop-blur-xl"
      >
        <button onClick={handleClose} className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 border border-primary/20 text-primary">
            {error ? <AlertCircle className="h-5 w-5" /> : isDownloaded ? <RefreshCw className="h-5 w-5 animate-spin-slow" /> : <Download className="h-5 w-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white mb-1">
              {error ? "Update Failed" : isDownloaded ? "Update Ready" : updateInfo ? `v${updateInfo.version} Available` : "Checking..."}
            </h3>
            
            {error ? (
              <p className="text-xs text-red-400 mb-3 line-clamp-2">{error}</p>
            ) : isDownloaded ? (
              <p className="text-xs text-muted-foreground mb-3">
                A new version is ready to install. Restart the launcher to apply it.
              </p>
            ) : progress ? (
              <div className="mt-2 mb-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Downloading...</span>
                  <span>{Math.round(progress.percent)}%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                A new update is available. Download it now to get the newest scripts and patches.
              </p>
            )}

            {!progress && !isDownloaded && !error && (
              <button 
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary/20 px-3 py-2 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
              >
                Download Update
              </button>
            )}

            {isDownloaded && !error && (
              <button 
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground hover:brightness-110 transition-all font-display shadow-[0_0_15px_hsl(var(--primary)/0.3)]"
              >
                Restart & Install <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
