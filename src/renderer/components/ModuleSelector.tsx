import { useEffect, useState } from "react";

interface ModuleInfo {
  id: string;
  label: string;
}

export interface ModuleSelectorProps {
  activeModuleId: string;
  onSelect: (moduleId: string) => void;
}

const ipc =
  typeof window !== "undefined" && (window as any).require?.("electron")?.ipcRenderer;

export function ModuleSelector({ activeModuleId, onSelect }: ModuleSelectorProps) {
  const [modules, setModules] = useState<ModuleInfo[]>([]);

  useEffect(() => {
    if (!ipc) return;
    ipc
      .invoke("preview:list-modules")
      .then((list: ModuleInfo[]) => {
        if (Array.isArray(list)) setModules(list);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  if (modules.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2">
      {modules.map((m) => {
        const isActive = m.id === activeModuleId;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-black/40 text-muted-foreground hover:bg-black/60"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

