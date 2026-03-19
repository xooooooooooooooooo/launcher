const fs = require('fs');

const file = 'src/pages/Index.tsx';
let src = fs.readFileSync(file, 'utf8');

const startTag = '{theme === "professional" ? (';
const endTag = ') : (\n          // --- STANDARD / VANGUARD / DEFAULT LAYOUT ---';

const startIndex = src.indexOf(startTag);
const endIndex = src.indexOf(endTag);

if (startIndex > -1 && endIndex > -1) {
  const replacement = `{theme === "professional" ? (
          // --- THE MONOLITH: Immersive Top-Nav Layout ---
          <div className="relative flex flex-1 w-full h-full flex-col overflow-hidden bg-transparent">
            {/* Custom Monolith Window Controls */}
            {ipcRenderer && (
              <div
                className="absolute top-0 right-0 h-16 z-[100] flex items-center justify-end px-6"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => ipcRenderer.invoke("minimize-window")}
                    className="flex h-7 w-7 items-center justify-center rounded bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 text-white/50 hover:text-white transition-all backdrop-blur-md"
                  >
                    <Minimize className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => ipcRenderer.invoke("close-window")}
                    className="flex h-7 w-7 items-center justify-center rounded bg-red-500/10 border border-red-500/20 hover:bg-red-500/80 hover:border-red-500 text-red-500 hover:text-white transition-all backdrop-blur-md"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            <ProfessionalHeader 
              activePage={activePage} 
              onNavigate={setActivePage} 
              backendOnline={backendOnline} 
            />

            {/* Main Content Area */}
            <main
              className="flex-1 flex flex-col pt-24 pb-8 px-12 h-full overflow-hidden relative z-10"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <AnimatePresence mode="wait">
                <motion.div 
                  key={activePage} 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.6 }}
                  className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                >
                  {pages[activePage as Page]}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        `;

  src = src.substring(0, startIndex) + replacement + src.substring(endIndex);
  fs.writeFileSync(file, src);
  console.log('Successfully replaced Professional Theme layout. ' + startIndex + ' ' + endIndex);
} else {
  console.error('Could not find layout tags in Index.tsx. ' + startIndex + ' ' + endIndex);
}
