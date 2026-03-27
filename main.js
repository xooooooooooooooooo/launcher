const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const { autoUpdater } = require('electron-updater');

// Native crash reporting for debugging invisible external machine crashes
process.on('uncaughtException', (error) => {
  dialog.showErrorBox('Hades Critical Crash', `An unexpected error occurred in the core process:\n\n${error.stack || error.message}`);
});
process.on('unhandledRejection', (reason) => {
  dialog.showErrorBox('Hades Unhandled Rejection', `A background task failed critically:\n\n${reason instanceof Error ? reason.stack : String(reason)}`);
});

autoUpdater.autoDownload = false;

// Preview SDK JAR path (Visual Configurator ESP overlay)
function getPreviewSdkJarPath() {
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  return path.join(base, 'assets', 'preview-sdk.jar');
}

// Cubemap path (Visual Configurator panorama) — same base as JAR for dev vs packaged
function getCubemapDir(scenePath) {
  const rel = (scenePath || 'PlayerESP/scene_20260311_003507').replace(/\\/g, path.sep);
  return app.isPackaged
    ? path.join(__dirname, 'dist', 'assets', 'scenes', rel)
    : path.join(__dirname, 'public', 'assets', 'scenes', rel);
}

// Custom protocol so renderer can load cubemap PNGs by URL (avoids IPC size limit on base64)
function registerSceneProtocol() {
  protocol.registerFileProtocol('scene', (request, callback) => {
    try {
      const pathname = request.url.replace(/^scene:\/\/[^/]+\//, '').replace(/%20/g, ' ');
      const parts = pathname.split(/\/|\\/).filter(Boolean);
      if (parts.length < 2) return callback({ error: -2 });
      const file = parts.pop();
      const scenePath = parts.join('/');
      const dir = getCubemapDir(scenePath);
      const filePath = path.join(dir, file);
      const exists = fs.existsSync(filePath);
      if (exists) {
        callback({ path: filePath });
      } else {
        console.warn('[Cubemap] scene:// file not found:', filePath);
        callback({ error: -2 });
      }
    } catch (e) {
      console.warn('[Cubemap] scene:// protocol error', e.message);
      callback({ error: -2 });
    }
  });
}

// Preview SDK bridge: spawns JAR, JSON over stdin/stdout (requires Java 17+)
let previewJvmProcess = null;
const previewPending = new Map();

function startPreviewBridge() {
  const jarPath = getPreviewSdkJarPath();
  if (!fs.existsSync(jarPath)) {
    console.warn('[PreviewBridge] JAR not found:', jarPath);
    return;
  }
  // Prefer JAVA_HOME; then try common Windows JDK paths (Electron often has a different PATH)
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = [];
  if (process.env.JAVA_HOME) {
    candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java' + ext));
  }
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    try {
      const javaDir = path.join(pf, 'Java');
      if (fs.existsSync(javaDir)) {
        const dirs = fs.readdirSync(javaDir).filter((d) => d.startsWith('jdk-'));
        dirs.sort((a, b) => (parseInt(b.replace(/\D/g, ''), 10) || 0) - (parseInt(a.replace(/\D/g, ''), 10) || 0));
        dirs.forEach((d) => candidates.push(path.join(javaDir, d, 'bin', 'java' + ext)));
      }
    } catch (_) {}
    candidates.push('C:\\Program Files\\Java\\jdk-17\\bin\\java.exe');
    candidates.push('C:\\Program Files\\Java\\jdk-21\\bin\\java.exe');
  }
  candidates.push('java');
  const javaBin = candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) || 'java';
  console.log('[PreviewBridge] Using Java:', javaBin);
  previewJvmProcess = spawn(javaBin, ['-jar', jarPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  
  previewJvmProcess.on('error', (err) => {
    console.warn('[PreviewBridge] Failed to start Java process:', err.message);
    previewJvmProcess = null;
    for (const [, p] of previewPending) p.reject(new Error('JVM failed to start'));
    previewPending.clear();
  });

  if (!previewJvmProcess) return;

  let stderrBuf = '';
  if (previewJvmProcess.stderr) {
    previewJvmProcess.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.includes('UnsupportedClassVersionError') && stderrBuf.includes('61.0')) {
        console.warn('[PreviewBridge] preview-sdk.jar requires Java 17+. Install JDK 17 and set JAVA_HOME or add it to PATH.');
      }
    });
  }
  if (previewJvmProcess.stdout) {
    const rl = readline.createInterface({ input: previewJvmProcess.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;
      try {
        const msg = JSON.parse(line);
        const id = msg.requestId;
        if (id && previewPending.has(id)) {
          previewPending.get(id).resolve(msg);
          previewPending.delete(id);
        }
      } catch (_) {}
    });
  }

  previewJvmProcess.on('exit', (code) => {
    previewJvmProcess = null;
    for (const [, p] of previewPending) p.reject(new Error('JVM exited'));
    previewPending.clear();
    setTimeout(startPreviewBridge, 2000);
  });
}

// Enable WebGL/GLSL in Electron (otherwise it may be disabled or use software renderer)
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 680,
    frame: false, // no Windows title bar – custom drag via WebkitAppRegion
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'public', 'icon.png')
  });



  // Load the appropriate URL based on environment
  if (app.isPackaged) {
    // Production: load from built files
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  } else {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  }




  // Disable DevTools (no F12 / Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      event.preventDefault();
    }
  });


  mainWindow.on('closed', () => {

    mainWindow = null;
  });
}

// IPC Handlers for file dialog
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'DLL Files', extensions: ['dll'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC Handlers for window controls
ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('close-window', () => {
  app.quit();
});

ipcMain.handle('resize-window', (_event, { width, height }) => {
  if (mainWindow && typeof width === 'number' && typeof height === 'number') {
    mainWindow.setSize(width, height);
  }
});

// OpenGL ESP Preview: embedded in Visual preview area (child window)
// REMOVED: Now handled via WebGL in Renderer process.

// Skin per Main laden (kein CORS in Electron)
ipcMain.handle('fetch-skin', async (_event, url) => {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'HadesLauncher/1.0' } });
    if (!res.ok) return { ok: false };
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    return { ok: true, base64 };
  } catch {
    return { ok: false };
  }
});

// Backend Process Management
let backendProcess = null;

const startBackend = () => {
  let backendPath;
  if (app.isPackaged) {
    backendPath = path.join(process.resourcesPath, 'backend', 'backend.exe');
  } else {
    // Try development paths
    const potentialPaths = [
      path.join(__dirname, 'backend', 'bin', 'Debug', 'net8.0', 'backend.exe'),
      path.join(__dirname, 'dist-backend', 'backend.exe')
    ];
    backendPath = potentialPaths.find(p => fs.existsSync(p));
  }

  if (backendPath && fs.existsSync(backendPath)) {
    console.log('Starting backend from:', backendPath);
    const env = { ...process.env, SUPABASE_URL: SUPABASE_URL, SUPABASE_ANON_KEY: SUPABASE_KEY };
    backendProcess = spawn(backendPath, [], {
      cwd: path.dirname(backendPath),
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
      env
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`Backend exited with code ${code}`);
      backendProcess = null;
    });
  } else {
    console.warn('Backend executable not found. Skipping auto-start.');
  }
};

// App lifecycle
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Update & DLL Management
const SUPABASE_URL = "https://szxxwxwityixqzzmarlq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6eHh3eHdpdHlpeHF6em1hcmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTkyNDQsImV4cCI6MjA4NjQzNTI0NH0.5XSYOM1VZrKOeQJSErdI-J2PcvWNo2YLHrCfQ5MNxRs";

let latestChangelog = "";

async function checkForUpdates() {
  try {
    console.log("Checking for updates...");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/launcher_versions?select=*&order=created_at.desc&limit=1`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) throw new Error("Failed to fetch updates");
    const data = await response.json();

    if (data.length > 0) {
      const latest = data[0];
      const oldChangelog = latestChangelog;
      latestChangelog = latest.changelog;

      // Notify renderer if changelog changed
      if (oldChangelog !== latestChangelog && mainWindow) {
        mainWindow.webContents.send('changelog-updated', latestChangelog);
      }

      console.log(`Latest version: ${latest.version}`);

      // ... (rest of DLL management logic)
      let backendDir;
      if (backendProcess && backendProcess.spawnargs && backendProcess.spawnargs.length > 0) {
        backendDir = path.dirname(path.join(process.resourcesPath, 'backend', 'backend.exe'));
      }

      let backendPath;
      if (app.isPackaged) {
        backendPath = path.join(process.resourcesPath, 'backend', 'backend.exe');
      } else {
        const potentialPaths = [
          path.join(__dirname, 'backend', 'bin', 'Debug', 'net8.0', 'backend.exe'),
          path.join(__dirname, 'dist-backend', 'backend.exe')
        ];
        backendPath = potentialPaths.find(p => fs.existsSync(p));
      }

      if (backendPath) {
        const dllDir = path.join(path.dirname(backendPath), 'dll');
        if (!fs.existsSync(dllDir)) {
          fs.mkdirSync(dllDir, { recursive: true });
        }

        const dllName = `client-${latest.version}.dll`;
        const dllPath = path.join(dllDir, dllName);

        if (!fs.existsSync(dllPath)) {
          console.log(`Downloading new DLL: ${dllName}`);
          const downloadRes = await fetch(latest.download_url);
          if (downloadRes.ok) {
            const buffer = await downloadRes.arrayBuffer();
            fs.writeFileSync(dllPath, Buffer.from(buffer));
            console.log("DLL Downloaded successfully.");
          }
        }
      }
    }
  } catch (err) {
    console.error("Update check failed:", err);
  }
}

ipcMain.handle('get-changelog', () => latestChangelog);
ipcMain.handle('refresh-changelog', async () => {
  await checkForUpdates();
  return latestChangelog;
});

// Stub module list for Visual Configurator so the UI is testable without real ScenePacks.
ipcMain.handle('preview:list-modules', () => {
  return [
    { id: 'PlayerESP', label: 'Player ESP' },
    { id: 'ChestESP', label: 'Chest ESP' },
    { id: 'ItemESP', label: 'Item ESP' },
    { id: 'HUD', label: 'HUD' },
  ];
});

// Default scene.json path for Visual Configurator (hitbox positions)
function getDefaultSceneJsonPath() {
  return path.join(getCubemapDir('PlayerESP/scene_20260311_003507'), 'scene.json');
}

// Load scene.json for panorama hitboxes (positions from this file, real-time reload)
ipcMain.handle('preview:load-scene', async (_, filePath) => {
  const p = filePath || getDefaultSceneJsonPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
});

// Load one cubemap face (avoids IPC size limit; renderer requests 6 times)
ipcMain.handle('preview:load-cubemap-face', async (_, scenePath, face) => {
  const dir = getCubemapDir(scenePath);
  const filePath = path.join(dir, `cubemap_${face}.png`);
  try {
    const buf = fs.readFileSync(filePath);
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (e) {
    return null;
  }
});

// Single set of IPC handlers: delegate to JVM when running, otherwise stub
ipcMain.handle('preview:schema', async (_, moduleId) => {
  if (previewJvmProcess?.stdin) {
    const id = require('crypto').randomUUID();
    return new Promise((resolve, reject) => {
      previewPending.set(id, { resolve, reject });
      previewJvmProcess.stdin.write(JSON.stringify({ type: 'schema', module: moduleId, requestId: id }) + '\n');
      setTimeout(() => {
        if (previewPending.has(id)) {
          previewPending.delete(id);
          reject(new Error('Schema timeout'));
        }
      }, 5000);
    }).then((r) => r.schema ?? r).catch(() => getStubSchema(moduleId));
  }
  return getStubSchema(moduleId);
});

ipcMain.handle('preview:render', async (_, moduleId, config, entities) => {
  if (!previewJvmProcess?.stdin) return null;
  const id = require('crypto').randomUUID();
  return new Promise((resolve, reject) => {
    previewPending.set(id, { resolve, reject });
    previewJvmProcess.stdin.write(JSON.stringify({ type: 'render', module: moduleId, config, entities, requestId: id }) + '\n');
    setTimeout(() => {
      if (previewPending.has(id)) {
        previewPending.delete(id);
        reject(new Error('Render timeout'));
      }
    }, 2000);
  }).then((r) => {
    if (!r) return null;
    const isFrame = r.type === 'frame' || r.type === 'image';
    const data = r.data ?? r.pixels ?? r.base64;
    if (isFrame && data && r.width > 0 && r.height > 0) {
      return { width: r.width, height: r.height, data };
    }
    return null;
  }).catch(() => null);
});

function getStubSchema(moduleId) {
  return {
    moduleId,
    fields: [
      { id: 'color', label: 'ESP Color', type: 'color', default: '#55ff55' },
      { id: 'thickness', label: 'Line Thickness', type: 'slider', min: 1, max: 5, step: 1, default: 2 },
      { id: 'enabled', label: 'Enabled', type: 'toggle', default: true },
    ],
  };
}

function getStubFrame() {
  const width = 320;
  const height = 180;
  const buf = Buffer.alloc(width * height * 4, 0);
  return { width, height, data: buf.toString('base64') };
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'scene', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

app.whenReady().then(() => {
  registerSceneProtocol();
  startPreviewBridge();

  startBackend();
  createWindow();

  // Initial check (DLLs)
  checkForUpdates();

  // Periodic check (every 5 minutes for Supabase DLLs)
  setInterval(() => {
    checkForUpdates();
  }, 1000 * 60 * 5);

  // Fast-polling check (every 15 seconds for GitHub Launcher Updates)
  setInterval(() => {
    if (app.isPackaged) autoUpdater.checkForUpdates();
  }, 1000 * 15);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Auto-Updater handlers
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

ipcMain.handle('app:check-updates', () => {
  if (app.isPackaged) autoUpdater.checkForUpdates();
});

ipcMain.handle('app:download-update', () => {
  if (app.isPackaged) autoUpdater.downloadUpdate();
});

ipcMain.handle('app:quit-and-install', () => {
  if (app.isPackaged) autoUpdater.quitAndInstall();
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:available', info);
});
autoUpdater.on('update-not-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:not-available', info);
});
autoUpdater.on('download-progress', (progressObj) => {
  if (mainWindow) mainWindow.webContents.send('updater:progress', progressObj);
});
autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('updater:downloaded', info);
});
autoUpdater.on('error', (err) => {
  if (mainWindow) mainWindow.webContents.send('updater:error', err.message || err.toString());
});
