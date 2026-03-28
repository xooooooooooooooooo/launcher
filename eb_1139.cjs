const path = require('path');
const fs = require('fs');

const previewExe = path.join(__dirname, 'resources', 'preview.exe');
const hasPreview = fs.existsSync(previewExe);
const previewJar = path.join(__dirname, 'assets', 'preview-sdk.jar');
const hasPreviewJar = fs.existsSync(previewJar);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  compression: 'maximum',
  appId: 'com.hades.launcher',
  productName: 'Hades Launcher',
  directories: { output: 'dist-electron' },
  files: [
    'dist/**/*', 
    { from: 'build-temp', to: '.', filter: ['main.js'] }, 
    'public/icon.png'
  ],
  icon: 'public/icon.png',
  extraResources: [
    ...(hasPreview ? [{ from: 'resources/preview.exe', to: 'preview.exe' }] : []),
    ...(hasPreviewJar ? [{ from: 'assets/preview-sdk.jar', to: 'assets/preview-sdk.jar' }] : []),
    { from: 'dist-backend/backend.exe', to: 'backend/backend.exe' }
  ],
  win: {
    target: 'nsis',
    requestedExecutionLevel: 'requireAdministrator',
    icon: 'public/icon.png',
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
  },
  publish: [
    {
      provider: 'github',
      owner: 'xooooooooooooooooo',
      repo: 'launcher',
      releaseType: 'release'
    }
  ],
};
