import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { useState } from "react";

interface DebugReportProps {
  open: boolean;
  onClose: () => void;
  report: {
    success: boolean;
    message: string;
    backendSteps: string[];
    frontendSteps: string[];
    timestamp: string;
    duration: number;
  } | null;
}

export default function DebugReport({ open, onClose, report }: DebugReportProps) {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (!report) return null;

  const allSteps = [
    ...report.frontendSteps.map(s => ({ source: "FRONTEND", text: s })),
    ...report.backendSteps.map(s => ({ source: "BACKEND", text: s })),
  ];

  const copyReport = () => {
    const text = [
      `=== HADES INJECTION DEBUG REPORT ===`,
      `Time: ${report.timestamp}`,
      `Result: ${report.success ? "SUCCESS" : "FAILED"}`,
      `Message: ${report.message}`,
      `Duration: ${report.duration}ms`,
      ``,
      `--- Frontend Steps ---`,
      ...report.frontendSteps,
      ``,
      `--- Backend Steps ---`,
      ...report.backendSteps,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-[560px] max-h-[80vh] flex flex-col rounded-xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 24px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                {report.success ? (
                  <CheckCircle size={20} className="text-primary" />
                ) : (
                  <XCircle size={20} className="text-red-400" />
                )}
                <div>
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.15em]"
                    style={{ color: report.success ? "#34d399" : "#f87171" }}>
                    {report.success ? "Injection Successful" : "Injection Failed"}
                  </h3>
                  <p className="text-[11px] text-white/40 mt-0.5 font-mono">{report.timestamp}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono transition-all"
                  style={{
                    background: copied ? "hsl(var(--primary)/0.15)" : "rgba(255,255,255,0.05)",
                    color: copied ? "#34d399" : "rgba(255,255,255,0.5)",
                    border: `1px solid ${copied ? "hsl(var(--primary)/0.3)" : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 transition-colors">
                  <X size={16} className="text-white/40" />
                </button>
              </div>
            </div>

            {/* Summary bar */}
            <div className="px-5 py-3 flex items-center gap-4 text-[11px] font-mono" style={{ background: "rgba(0,0,0,0.2)" }}>
              <div className="flex items-center gap-1.5 text-white/50">
                <Clock size={12} />
                <span>{report.duration}ms</span>
              </div>
              <div className="text-white/30">|</div>
              <div className="text-white/50">{allSteps.length} steps</div>
              <div className="text-white/30">|</div>
              <div className="text-white/50 truncate flex-1">{report.message}</div>
              <button onClick={() => setCollapsed(!collapsed)} className="p-1 hover:bg-white/10 rounded transition-colors">
                {collapsed ? <ChevronDown size={14} className="text-white/40" /> : <ChevronUp size={14} className="text-white/40" />}
              </button>
            </div>

            {/* Steps log */}
            {!collapsed && (
              <div className="flex-1 overflow-y-auto px-5 py-3" style={{ maxHeight: "50vh" }}>
                {/* Frontend steps */}
                <div className="mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/60 mb-2">Frontend</div>
                  {report.frontendSteps.map((step, i) => (
                    <StepLine key={`fe-${i}`} step={step} source="frontend" />
                  ))}
                </div>

                {/* Backend steps */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/60 mb-2">Backend</div>
                  {report.backendSteps.length > 0 ? (
                    report.backendSteps.map((step, i) => (
                      <StepLine key={`be-${i}`} step={step} source="backend" />
                    ))
                  ) : (
                    <p className="text-[11px] text-white/30 font-mono italic">No response from backend</p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepLine({ step, source }: { step: string; source: "frontend" | "backend" }) {
  const isSuccess = step.includes("✔") || step.includes("succeeded") || step.includes("successful");
  const isError = step.includes("✘") || step.includes("CRASH") || step.includes("FATAL") || step.includes("failed");
  const isWarning = step.includes("⚠") || step.includes("proceeding anyway");

  let dotColor = "rgba(255,255,255,0.2)";
  if (isSuccess) dotColor = "#34d399";
  if (isError) dotColor = "#f87171";
  if (isWarning) dotColor = "#fbbf24";

  return (
    <div className="flex items-start gap-2 py-0.5 group">
      <div className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
      <p
        className="text-[11px] font-mono leading-relaxed"
        style={{
          color: isError ? "#f87171" : isSuccess ? "#34d399" : isWarning ? "#fbbf24" : "rgba(255,255,255,0.55)",
        }}
      >
        {step}
      </p>
    </div>
  );
}

