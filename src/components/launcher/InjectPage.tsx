import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, CheckCircle2, AlertCircle, Loader2, Shield, Cpu, Terminal, Activity } from "lucide-react";
import type { Status, Process, DllFile, BackendStatus } from "@/pages/Index";

interface InjectPageProps {
  status: Status;
  processes: Process[];
  selectedProcess: Process | null;
  onSelectProcess: (process: Process) => void;
  errorMessage: string;
  backendOnline: boolean;
  backendStatus: BackendStatus | null;
  availableDlls: DllFile[];
  selectedDll: string;
  onSelectDll: (name: string) => void;
  canInject: boolean;
  onInject: () => void;
  theme?: string;
  apiBaseUrl?: string;
}

const InjectPage = ({
  status,
  processes,
  selectedProcess,
  onSelectProcess,
  errorMessage,
  backendOnline,
  backendStatus,
  availableDlls,
  selectedDll,
  onSelectDll,
  canInject,
  onInject,
  theme,
  apiBaseUrl,
}: InjectPageProps) => {
  const hasProcesses = processes.length > 0;

  // Typewriter effect state
  const [typedLogs, setTypedLogs] = React.useState<string[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll terminal and handle typing simulation
  React.useEffect(() => {
    if (theme !== "professional") return;
    
    // Build the desired full text based on current status
    const logs: string[] = [];
    const timestamp = `[${new Date().toISOString().substring(11, 23)}]`;
    
    if (status === "searching") {
      logs.push(`${timestamp} > scanning active processes...`);
    } else if (status === "error") {
      logs.push(`${timestamp} > ERROR: ${errorMessage || "Connection timeout"}`);
    } else if (status === "ready" && selectedProcess) {
       logs.push(`${timestamp} > target established: ${selectedProcess.pid}`);
       logs.push(`${timestamp} > awaiting execution command...`);
    } else if (status === "injecting" && selectedProcess) {
       logs.push(`${timestamp} > target established: ${selectedProcess.pid}`);
       logs.push(`${timestamp} > injecting payload...`);
       logs.push(`${timestamp} > waiting on interface acknowledgment...`);
    } else if (status === "success" && selectedProcess) {
       logs.push(`${timestamp} > target established: ${selectedProcess.pid}`);
       logs.push(`${timestamp} > injecting payload...`);
       logs.push(`${timestamp} > payload acknowledged.`);
       logs.push(`${timestamp} > injection complete. interface active.`);
    } else if (!status) {
       logs.push(`${timestamp} > select target to initialize...`);
    }

    setTypedLogs(logs);
    
    // Auto-scroll logic
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [status, selectedProcess, theme, errorMessage]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden select-none"
    >
      {/* Hero */}
      <div className={`shrink-0 ${theme === "professional" ? "px-0 mb-6 border-b border-white/[0.05] pb-4" : "px-1 mb-5"}`}>
        {theme === "professional" ? (
          <div className="flex items-center justify-between px-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Terminal className="h-5 w-5 text-white/50" />
                <h2 className="text-2xl font-bold tracking-tight text-white">Target Acquisition</h2>
              </div>
              <p className="text-xs text-white/50 max-w-xl mt-1">
                Select an active interface target from the grid below to attach the management suite.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
                <span className="text-[10px] font-mono tracking-widest text-white/40 uppercase">SYS: {status.toUpperCase()}</span>
              </div>
              <span className="text-[10px] font-mono tracking-widest text-white/20 uppercase">
                PID: {selectedProcess?.pid || "NONE"}
              </span>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5 mt-2"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,180,0,0.08),transparent_70%)]" />
            <div className="relative flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-1.5 w-1.5 rounded-full animate-pulse shrink-0 bg-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary/80">System Ready</span>
                </div>
                <h2 className="font-display font-black tracking-tight text-foreground text-xl">
                  Internal Execution
                </h2>
                <p className="font-medium max-w-sm leading-relaxed text-sm text-muted-foreground/80">
                  Connect your management suite to the target process for real-time monitoring and module execution.
                </p>
              </div>
              <div className="hidden md:flex shrink-0 items-center justify-center h-14 w-14 rounded-2xl bg-white/[0.03] border border-white/5">
                <Zap className="h-7 w-7 text-primary drop-shadow-[0_0_10px_rgba(255,180,0,0.4)]" />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Main content - non-scrollable for professional, scrollable for others */}
      <div className={`min-h-0 flex-1 px-1 flex flex-col ${theme === "professional" ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden"}`}>
        {!backendOnline && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">
              Backend offline{apiBaseUrl ? ` (trying ${apiBaseUrl})` : ""}. Start: cd backend && dotnet run
            </p>
          </div>
        )}

        {backendOnline && !backendStatus?.dllFolderExists && (
          <div className="mb-6 rounded-lg border border-orange-500/30 bg-orange-500/10 p-4">
            <p className="text-sm text-orange-400 font-mono">DLL folder not found: {backendStatus?.dllFolder}</p>
          </div>
        )}



        <div className={`flex flex-col flex-1 min-h-0 ${theme === "professional" ? "mb-4" : "mb-6"}`}>
          <div className={`flex items-center justify-between mb-3 px-2 ${theme === "professional" ? "mb-6" : ""}`}>
            <span className={`text-[10px] font-black uppercase tracking-[0.25em] ${theme === "professional" ? "text-white/30 font-mono tracking-widest" : "text-muted-foreground/40"}`}>
              Active Interfaces
            </span>
            {theme !== "professional" && <div className="h-px flex-1 mx-4 bg-white/5" />}
          </div>

          <div className={`flex flex-1 min-h-0 ${theme === "professional" ? "gap-12" : ""}`}>
            {/* Process List */}
            <div className={theme === "professional" ? "flex flex-col gap-1 w-1/2 overflow-y-auto pr-2 custom-scrollbar" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full"}>
              {!hasProcesses ? (
                <div className={`col-span-full flex items-center gap-4 ${theme === "professional" ? "bg-white/[0.02] border border-white/[0.05] rounded-lg p-6" : "rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-6"}`}>
                  <Loader2 className="h-6 w-6 shrink-0 animate-spin text-white/50" />
                  <span className={`text-sm ${theme === "professional" ? "font-mono text-white/40 uppercase tracking-widest" : "font-bold text-white/60 tracking-tight"}`}>
                    Scanning system...
                  </span>
                </div>
              ) : (
                processes.map((proc) => {
                  const isSelected = selectedProcess?.pid === proc.pid;

                  if (theme === "professional") {
                    return (
                      <button
                        key={proc.pid}
                        type="button"
                        onClick={() => onSelectProcess(proc)}
                        className={`group relative flex items-center justify-between w-full px-4 py-3 text-left transition-all duration-300 ${isSelected
                          ? "bg-black/40 text-white"
                          : "bg-transparent hover:bg-white/[0.03] text-white/50 hover:text-white/80"
                          }`}
                      >
                        {/* Target Selection Brackets (Premium Aesthetic) */}
                        {isSelected && (
                          <>
                            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/80 pointer-events-none" />
                            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/80 pointer-events-none" />
                            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/80 pointer-events-none" />
                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/80 pointer-events-none" />
                            
                            {/* Scanning line effect */}
                            <motion.div 
                              className="absolute top-0 bottom-0 left-0 w-[1px] bg-primary/50 shadow-[0_0_8px_hsl(var(--primary)/0.8)] pointer-events-none"
                              animate={{ top: ["0%", "100%", "0%"] }}
                              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                            />
                          </>
                        )}
                        
                        <div className="flex items-center gap-4 min-w-0 relative z-10">
                          <Cpu className={`h-4 w-4 shrink-0 transition-colors ${isSelected ? "text-primary drop-shadow-[0_0_5px_hsl(var(--primary)/0.5)]" : "text-white/30 group-hover:text-white/50"}`} />
                          <span className={`text-xs font-mono tracking-wider truncate uppercase transition-colors`}>
                            {proc.displayName || proc.name}
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono tracking-widest w-12 text-right uppercase transition-colors relative z-10 ${isSelected ? "text-primary font-bold drop-shadow-[0_0_5px_hsl(var(--primary)/0.3)]" : "text-white/30"}`}>
                          {proc.pid}
                        </span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={proc.pid}
                      type="button"
                      onClick={() => onSelectProcess(proc)}
                      className={`group relative flex flex-col gap-3 rounded-2xl border p-4 transition-all duration-300 ${isSelected
                        ? "border-primary/40 bg-primary/10 shadow-[0_8px_20px_rgba(255,180,0,0.1)]"
                        : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:shadow-md"
                        }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${isSelected ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"}`}>
                          <Cpu className="h-5 w-5" />
                        </div>
                        {isSelected ? (
                          <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          </div>
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-white/10 group-hover:bg-primary/40 transition-colors" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className={`truncate text-sm font-black tracking-tight ${isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
                          {proc.displayName || proc.name}
                        </p>
                        <p className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-wider mt-1">ID {proc.pid}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Target HUD (Professional Only) */}
            {theme === "professional" && (
              <div className="flex flex-col flex-1 gap-6 min-h-0">
                <div className="flex-1 border border-white/[0.05] bg-black/40 backdrop-blur-md rounded-sm p-6 flex flex-col relative overflow-hidden min-h-0">
                {/* CRT Scanline Overlay */}
                <div 
                  className="absolute inset-0 pointer-events-none z-0 opacity-[0.03] mix-blend-overlay"
                  style={{
                    backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 2px, #fff 4px)"
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent h-[10%] w-full animate-scanline pointer-events-none z-10 mix-blend-screen" />

                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none z-0">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 0H10V2H2V10H0V0Z" fill="white" />
                    <path d="M40 0H30V2H38V10H40V0Z" fill="white" />
                    <path d="M0 40H10V38H2V30H0V40Z" fill="white" />
                    <path d="M40 40H30V38H38V30H40V40Z" fill="white" />
                  </svg>
                </div>

                <div className="flex items-center gap-3 mb-8">
                  <Activity className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-mono font-bold tracking-[0.2em] text-white uppercase">Selected Target</h3>
                </div>

                {selectedProcess ? (
                  <div className="flex flex-col flex-1">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-8 mb-auto">
                      <div className="flex flex-col gap-1 z-10">
                        <span className="text-[10px] font-mono tracking-widest text-white/30 uppercase">Process Name</span>
                        <span className="text-sm font-mono text-white uppercase truncate drop-shadow-md">{selectedProcess.displayName || selectedProcess.name}</span>
                      </div>
                      <div className="flex flex-col gap-1 z-10">
                        <span className="text-[10px] font-mono tracking-widest text-white/30 uppercase">PID</span>
                        <span className="text-sm font-mono text-primary uppercase drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)]">{selectedProcess.pid}</span>
                      </div>
                      <div className="flex flex-col gap-1 z-10">
                        <span className="text-[10px] font-mono tracking-widest text-white/30 uppercase">Status</span>
                        <span className="text-sm font-mono text-white/70 uppercase flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Running
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 z-10">
                        <span className="text-[10px] font-mono tracking-widest text-white/30 uppercase">Memory</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-white/70 uppercase w-16">~{(Math.random() * 500 + 100).toFixed(1)} MB</span>
                          
                          {/* Live Telemetry Sparkline */}
                          <svg width="60" height="15" viewBox="0 0 60 15" className="opacity-60 overflow-visible">
                            <motion.polyline 
                              points="0,10 5,12 10,8 15,13 20,5 25,12 30,7 35,11 40,6 45,14 50,4 55,9 60,7" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="1" 
                              className="text-primary"
                              initial={{ strokeDasharray: 100, strokeDashoffset: 100 }}
                              animate={{ strokeDashoffset: [100, 0] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Injection Status Block */}
                    <div className="mt-8 border-t border-white/[0.05] pt-6 flex flex-col gap-4 z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold tracking-[0.2em] text-white uppercase">Payload Terminal</span>
                        <div className={`h-2 w-2 rounded-full ${status === 'ready' || status === 'success' ? 'bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]' : 'bg-red-500 animate-pulse w-full max-w-[8px]'}`} />
                      </div>
                      
                      {/* Terminal window with typewriter effect */}
                      <div 
                        ref={scrollRef}
                        className="bg-black/90 font-mono text-[10px] text-primary/80 p-4 rounded-sm border border-white/[0.05] h-24 overflow-y-auto custom-scrollbar flex flex-col shadow-[inset_0_0_15px_rgba(0,0,0,1)] relative"
                      >
                        {typedLogs.map((log, idx) => {
                          const isLast = idx === typedLogs.length - 1;
                          return (
                            <div key={idx} className="flex flex-col">
                              {/* If it's the very last log, type it out and add cursor */}
                              {isLast ? (
                                <motion.span 
                                  initial={{ width: "0%" }}
                                  animate={{ width: "100%" }}
                                  transition={{ duration: 1, ease: "linear" }}
                                  className={`whitespace-nowrap overflow-hidden border-r-4 animate-blink ${log.includes("ERROR") ? "text-red-400" : ""}`}
                                >
                                  {log}
                                </motion.span>
                              ) : (
                                <span className={log.includes("ERROR") ? "text-red-400" : ""}>
                                  {log}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center px-8">
                    <Terminal className="h-12 w-12 text-white/50 mb-4" />
                    <p className="text-xs font-mono tracking-widest uppercase text-white leading-relaxed">
                      Awaiting target selection from process array...
                    </p>
                  </div>
                )}
              </div> {/* Close border box */}
                
              {/* Status + Inject (Professional Only) */}
              <div className="flex w-full items-center justify-end shrink-0 pt-2">
                  <motion.button
                    onClick={onInject}
                    aria-disabled={!canInject || status === "success"}
                    whileHover={canInject && status !== "success" ? { scale: 1.02 } : {}}
                    whileTap={canInject && status !== "success" ? { scale: 0.98 } : {}}
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                    className={`relative overflow-hidden flex h-12 w-48 items-center justify-center gap-3 font-mono text-[13px] font-bold uppercase tracking-[0.2em] transition-all duration-300 rounded-sm ${canInject && status !== "success"
                        ? "bg-white text-black hover:bg-neutral-200"
                        : status === "success"
                          ? "bg-primary/20 text-primary border border-primary/30 font-normal cursor-default"
                          : "bg-white/5 text-white/30 border border-white/10 cursor-not-allowed"
                      }`}
                  >
                    {status === "injecting" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {status === "success" && <CheckCircle2 className="h-4 w-4" />}
                    {(!status || status === "searching" || status === "ready" || status === "error") && <Zap className="h-4 w-4" />}

                    <span>
                      {status === "searching" && "WAITING"}
                      {status === "ready" && "EXECUTE"}
                      {status === "injecting" && "EXECUTING..."}
                      {status === "success" && "TERMINATED"}
                      {status === "error" && "RETRY"}
                      {!status && "EXECUTE"}
                    </span>
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status + Inject (Non-Professional) */}
        {theme !== "professional" && (
          <div className="flex flex-col items-center justify-center mt-6 pb-4">
            <div className="w-full max-w-md flex flex-col items-center gap-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={status}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center gap-3"
                >
                  {status === "searching" && (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/40">Scanning targets...</span>
                    </>
                  )}
                  {status === "ready" && (
                    <>
                      <Shield className="h-8 w-8 text-primary" />
                      <span className="text-xs font-black uppercase tracking-widest text-primary drop-shadow-sm">Ready to inject</span>
                    </>
                  )}
                  {status === "injecting" && (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <span className="text-xs font-black uppercase tracking-widest animate-pulse text-primary">Communicating...</span>
                    </>
                  )}
                  {status === "success" && (
                    <>
                      <CheckCircle2 className="h-8 w-8 text-primary" />
                      <span className="text-xs font-black uppercase tracking-widest text-primary drop-shadow-sm">Success</span>
                    </>
                  )}
                  {status === "error" && (
                    <>
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <span className="text-xs font-bold text-destructive text-center max-w-xs uppercase tracking-tight">{errorMessage || "Injection failed"}</span>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Inject Button */}
              <motion.button
                onClick={onInject}
                aria-disabled={!canInject || status === "success"}
                whileHover={canInject && status !== "success" ? { scale: 1.02 } : {}}
                whileTap={canInject && status !== "success" ? { scale: 0.98 } : {}}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                className={`relative overflow-hidden flex items-center justify-center gap-2 font-display text-[15px] font-bold uppercase transition-all duration-300 rounded-2xl h-14 w-full max-w-sm tracking-widest ${canInject && status !== "success"
                    ? "bg-gradient-to-r from-primary via-primary/80 to-primary text-primary-foreground shadow-[0_15px_30px_rgba(255,180,0,0.2)] hover:shadow-[0_20px_40px_rgba(255,180,0,0.3)] cursor-pointer"
                    : status === "success"
                      ? "bg-primary/10 text-primary border border-primary/20 cursor-default shadow-[inset_0_0_20px_hsl(var(--primary)/0.1)]"
                      : "bg-white/5 text-white/30 cursor-not-allowed border border-white/10"
                  }`}
              >
                {status === "injecting" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : status === "success" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Zap className="h-5 w-5" />
                )}
                {status === "searching" && "WAITING"}
                {status === "ready" && "INJECT NOW"}
                {status === "injecting" && "INJECTING"}
                {status === "success" && "TERMINATED"}
                {status === "error" && "RETRY"}
                {!status && "INJECT NOW"}
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default InjectPage;

