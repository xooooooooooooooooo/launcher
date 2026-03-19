import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, FileText } from "lucide-react";

const DllManagerPage = () => {
  const [dlls, setDlls] = useState<string[]>([
    "C:\\Users\\User\\mods\\hades-client.dll",
    "C:\\Users\\User\\mods\\render-hook.dll",
  ]);
  const [selected, setSelected] = useState<number | null>(null);

  const handleAdd = () => {
    const newDll = `C:\\Users\\User\\mods\\module-${dlls.length + 1}.dll`;
    setDlls((prev) => [...prev, newDll]);
  };

  const handleRemove = () => {
    if (selected !== null) {
      setDlls((prev) => prev.filter((_, i) => i !== selected));
      setSelected(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col"
    >
      <div className="mb-8">
        <h2 className="font-display text-3xl font-bold text-foreground">DLL Manager</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your DLL library</p>
      </div>

      <div className="gradient-border mb-6 flex-1 overflow-hidden rounded-lg">
        <div className="h-full overflow-y-auto rounded-lg bg-surface p-3">
          <AnimatePresence>
            {dlls.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No DLLs added yet
              </div>
            ) : (
              dlls.map((dll, i) => (
                <motion.button
                  key={dll + i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setSelected(i === selected ? null : i)}
                  className={`mb-2 flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left text-sm transition-all ${
                    selected === i
                      ? "border border-primary/30 bg-primary/10 text-foreground"
                      : "border border-transparent bg-card text-secondary-foreground hover:bg-surface-hover"
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{dll.split("\\").pop()}</span>
                  <span className="ml-auto max-w-[200px] truncate text-xs text-muted-foreground">
                    {dll}
                  </span>
                </motion.button>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={handleAdd}
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-medium text-secondary-foreground transition-colors hover:border-primary hover:bg-surface-hover"
        >
          <Plus className="h-4 w-4" />
          Add DLL
        </button>
        <button
          onClick={handleRemove}
          disabled={selected === null}
          className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-sm font-medium text-secondary-foreground transition-colors hover:border-destructive hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </button>
      </div>
    </motion.div>
  );
};

export default DllManagerPage;
