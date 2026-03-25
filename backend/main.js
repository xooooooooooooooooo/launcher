import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let backendProcess = null;
const BACKEND_URL = 'http://localhost:5000';
const APP_VERSION = '10.0.2';

// ============================================
// AUTO-START BACKEND (Optional - can be disabled)
// ============================================

function startBackend() {
  console.log('🚀 Starting .NET backend...');
  
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '../backend');

  console.log('📂 Backend directory:', backendDir);

  if (!fs.existsSync(backendDir)) {
    console.warn('⚠️ Backend directory not found. Please start backend manually:');
    console.warn('   cd backend && dotnet run');
    return;
  }

  try {
    backendProcess = spawn('dotnet', ['run'], {
      cwd: backendDir,
      stdio: 'inherit',
      shell: true
    });

    backendProcess.on('error', (error) => {
      console.error('❌ Failed to start backend:', error);
      console.log('💡 Please start backend manually: cd backend && dotnet run');
    });

    backendProcess.on('exit', (code) => {
      console.log(`🛑 Backend exited with code ${code}`);
    });

    console.log('✅ Backend process started');
    setTimeout(checkBackendHealth, 5000);
  } catch (error) {
    console.error('❌ Error starting backend:', error);
    console.log('💡 Start backend manually: cd backend && dotnet run');
  }
}

async function checkBackendHealth() {
  try {
    const response = await fetch(BACKEND_URL);
    const data = await response.json();
    console.log('✅ Backend health check:', data);
  } catch (error) {
    console.warn('⚠️ Backend not responding. Make sure backend is running:');
    console.warn('   cd backend && dotnet run');
  }
}

function stopBackend() {
  if (backendProcess) {
    console.log('🛑 Stopping backend...');
    backendProcess.kill();
    backendProcess = null;
  }
}

// ============================================
// ELECTRON WINDOW
// ============================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f1419',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Window loaded');
  });
}

// ============================================
// APP LIFECYCLE
// ============================================

app.whenReady().then(() => {
  console.log('===========================================');
  console.log('🎮 Hades Injector Launcher Starting...');
  console.log('🔖 Version:', APP_VERSION);
  console.log('===========================================');
  
  // Comment out this line if you want to start backend manually
  startBackend();
  
  // Wait a bit for backend to start before creating window
  setTimeout(createWindow, 3000);
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============================================
// IPC HANDLERS
// ============================================

ipcMain.handle('write-debug', (event, filename, content) => {
  try {
    const tempPath = require('os').tmpdir();
    const filePath = path.join(tempPath, filename);
    fs.appendFileSync(filePath, content);
    console.log(`✅ Dropped debug file to ${filePath}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to write debug file:', error);
    return false;
  }
});

// Window Controls
ipcMain.handle('minimize-window', () => {
  console.log('📥 IPC: minimize-window');
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  console.log('📥 IPC: maximize-window');
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  console.log('📥 IPC: close-window');
  if (mainWindow) mainWindow.close();
});

// File Dialog
ipcMain.handle('select-dll-file', async () => {
  console.log('📥 IPC: select-dll-file');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'DLL Files', extensions: ['dll'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    console.log('✅ File selected:', result.filePaths[0]);
    return result.filePaths[0];
  }
  return null;
});

// Check File Exists (via backend)
ipcMain.handle('check-file-exists', async (event, filePath) => {
  console.log('📥 IPC: check-file-exists', filePath);
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/check-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    });
    
    const data = await response.json();
    return data.exists || false;
  } catch (error) {
    console.error('❌ Error checking file:', error);
    // Fallback to local check
    return fs.existsSync(filePath);
  }
});

// Get Processes (from backend)
ipcMain.handle('get-processes', async () => {
  console.log('📥 IPC: get-processes');
  
  try {
    const response = await fetch(`${BACKEND_URL}/api/processes`, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.processes) {
      console.log(`✅ Got ${data.processes.length} processes from backend`);
      return data.processes;
    } else {
      console.error('❌ Backend error:', data.message);
      return [];
    }
  } catch (error) {
    console.error('❌ Failed to get processes from backend:', error.message);
    console.log('💡 Make sure backend is running: cd backend && dotnet run');
    
    // Return empty array - let frontend show error
    return [];
  }
});

// Inject DLL (via backend)
ipcMain.handle('inject-dll', async (event, dllPath, processName, bearerToken) => {
  console.log('📥 IPC: inject-dll');
  console.log('   Backend URL:', BACKEND_URL);
  console.log('   Process:', processName);
  console.log('   DLL:', dllPath);
  console.log(`   Token attached: ${!!bearerToken}`);
  
  try {
    // First check if backend is reachable
    const healthCheck = await fetch(BACKEND_URL, {
      signal: AbortSignal.timeout(2000)
    }).catch(() => null);
    
    if (!healthCheck) {
      return {
        success: false,
        message: 'Cannot connect to backend!\n\nPlease make sure backend is running:\n1. Open PowerShell as Administrator\n2. cd backend\n3. dotnet run\n\nBackend should be listening on http://localhost:5000'
      };
    }
    
    const headers = { 'Content-Type': 'application/json' };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    // Send injection request
    const response = await fetch(`${BACKEND_URL}/api/inject`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        processName: processName,
        dllPath: dllPath
      }),
      signal: AbortSignal.timeout(120000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log('📤 Backend response:', data);
    
    return {
      success: data.success,
      message: data.message || (data.success ? 'Injection successful!' : 'Injection failed')
    };
  } catch (error) {
    console.error('❌ Injection error:', error);
    
    let errorMessage = 'Injection failed!\n\n';
    
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      errorMessage += 'Connection timeout. Backend is not responding.\n\n';
    } else if (error.message.includes('fetch')) {
      errorMessage += 'Cannot connect to backend.\n\n';
    } else {
      errorMessage += `Error: ${error.message}\n\n`;
    }
    
    errorMessage += 'Make sure backend is running:\n';
    errorMessage += '1. Open PowerShell as Administrator\n';
    errorMessage += '2. cd backend\n';
    errorMessage += '3. dotnet run';
    
    return {
      success: false,
      message: errorMessage
    };
  }
});

console.log('✅ All IPC handlers registered');
console.log('📡 Backend URL:', BACKEND_URL);
console.log('===========================================');
