const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');

let intervalMs = 5 * 60 * 1000; // default fallback 5 min
let retrieveUrl = 'http://localhost:3001/retrieve-xml';
let userDataDir = null;
let dataDir = null;
let resourcesBase = null;

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function copyIfMissing(src, dst) {
  try {
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      if (fs.statSync(src).isDirectory()) {
        ensureDir(dst);
        for (const entry of fs.readdirSync(src)) {
          const s = path.join(src, entry);
          const d = path.join(dst, entry);
          if (fs.statSync(s).isDirectory()) copyIfMissing(s, d); else fs.copyFileSync(s, d);
        }
      } else {
        ensureDir(path.dirname(dst));
        fs.copyFileSync(src, dst);
      }
    }
  } catch (e) {
    console.error('Error during copyIfMissing', src, '->', dst, e);
  }
}

function loadEnvAndConfig() {
  const legacyEnvPath = path.resolve(resourcesBase, '.env');
  const targetEnvPath = path.join(userDataDir, '.env');
  // Migrate .env and data dir from app folder to userData if needed
  copyIfMissing(legacyEnvPath, targetEnvPath);
  const legacyDataDir = path.join(resourcesBase, 'data');
  copyIfMissing(legacyDataDir, dataDir);

  dotenv.config({ path: targetEnvPath });
  const intervalMin = parseInt(process.env.RETRIEVE_INTERVAL_MINUTES, 10);
  if (!isNaN(intervalMin) && intervalMin > 0) {
    intervalMs = intervalMin * 60 * 1000;
  }
  retrieveUrl = process.env.RETRIEVE_URL || retrieveUrl;
}

let schedulerInterval = null;
let isRunning = false;

function retrieve() {
  sendLog(`[${new Date().toISOString()}] Triggering retrieve XML at ${retrieveUrl}`);
  http.get(retrieveUrl, (res) => {
    const { statusCode } = res;
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      const timestamp = new Date().toISOString();
      if (statusCode === 200) {
        sendLog(`[${timestamp}] retrieve XML success: ${data}`);
      } else {
        sendLog(`[${timestamp}] retrieve XML failed: ${statusCode} - ${data}`);
      }
    });
  }).on('error', (err) => {
    sendLog(`[${new Date().toISOString()}] HTTP request error: ${err.message}`);
  });
}

function startScheduler() {
  if (isRunning) return;
  retrieve();
  schedulerInterval = setInterval(retrieve, intervalMs);
  isRunning = true;
  sendStatus();
  sendLog('[Scheduler] started');
}

function stopScheduler() {
  if (!isRunning) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
  isRunning = false;
  sendStatus();
  sendLog('[Scheduler] stopped');
}

let mainWindow;
function sendStatus() {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status-changed', isRunning);
  }
}

// Send logs to both console and renderer UI
function sendLog(message) {
  console.log(message);
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('log', message);
  }
}

/**
 * Launch docker-compose then the background runner, piping their logs to the UI
 */
let runnerProcess;
function startRunner() {
  // Start docker-compose services in detached mode
  sendLog('[DOCKER] running docker-compose up -d');
  const composeProc = spawn('docker-compose', ['up', '-d'], {
    cwd: resourcesBase,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  composeProc.stdout.on('data', data => {
    data.toString().split(/\r?\n/).filter(line => line).forEach(line => {
      sendLog(`[DOCKER] ${line}`);
    });
  });
  composeProc.stderr.on('data', data => {
    data.toString().split(/\r?\n/).filter(line => line).forEach(line => {
      sendLog(`[DOCKER ERR] ${line}`);
    });
  });
  composeProc.on('error', err => {
    sendLog(`[DOCKER ERR] failed to launch docker-compose: ${err.message}`);
  });
  composeProc.on('exit', (code, signal) => {
    sendLog(`[DOCKER] exited with code ${code}${signal ? `, signal ${signal}` : ''}`);
    if (code === 0) {
      // Now start the Node runner
      const runnerExe = path.join(resourcesBase, 'node32', 'node.exe');
      const runnerScript = path.join(resourcesBase, 'laminaticus-runner', 'index.js');
      runnerProcess = spawn(runnerExe, [runnerScript], {
        cwd: path.dirname(runnerScript),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, USER_DATA_DIR: userDataDir }
      });
      sendLog(`[RUNNER] started (pid ${runnerProcess.pid})`);
      runnerProcess.stdout.on('data', data => {
        data.toString().split(/\r?\n/).filter(line => line).forEach(line => sendLog(`[RUNNER] ${line}`));
      });
      runnerProcess.stderr.on('data', data => {
        data.toString().split(/\r?\n/).filter(line => line).forEach(line => sendLog(`[RUNNER ERR] ${line}`));
      });
      runnerProcess.on('error', err => {
        sendLog(`[RUNNER ERR] failed to launch runner: ${err.message}`);
      });
      runnerProcess.on('exit', (rc, signalR) => {
        sendLog(`[RUNNER] exited with code ${rc}${signalR ? `, signal ${signalR}` : ''}`);
      });
    } else {
      sendLog('[RUNNER] aborted: docker-compose failed');
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

   Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    sendStatus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let logStream;
let origSendLog;

app.whenReady().then(() => {
  resourcesBase = app.isPackaged ? process.resourcesPath : __dirname;
  userDataDir = app.getPath('userData');
  dataDir = path.join(userDataDir, 'data');
  ensureDir(dataDir);

  // Persistent log setup
  const logFilePath = path.join(dataDir, 'app.log');
  try { logStream = fs.createWriteStream(logFilePath, { flags: 'a' }); } catch {}
  origSendLog = sendLog;
  sendLog = (message) => {
    const timestamp = new Date().toISOString();
    const out = `[${timestamp}] ${message}`;
    // Console and UI
    try { origSendLog(out); } catch {}
    // File
    try { if (logStream && !logStream.destroyed) logStream.write(out + '\n'); } catch {}
  };

  loadEnvAndConfig();

  // Auto update hooks
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-available', (info) => {
    sendLog(`[UPDATE] Available ${info.version}`);
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-available', info);
  });
  autoUpdater.on('update-not-available', () => {
    sendLog('[UPDATE] Not available');
  });
  autoUpdater.on('download-progress', (p) => {
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-progress', p);
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendLog('[UPDATE] Downloaded, will install on restart');
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-downloaded', info);
  });
  try { autoUpdater.checkForUpdates(); } catch (e) { sendLog(`[UPDATE] check failed: ${e.message}`); }

  // Expose paths to renderer
  ipcMain.handle('get-paths', async () => ({ dataDir }));
  // Trigger update from UI
  ipcMain.on('start-update', async () => {
    try {
      autoUpdater.quitAndInstall();
    } catch (e) {
      sendLog(`[UPDATE] install failed: ${e.message}`);
    }
  });
  // Open parent folder of data directory
  ipcMain.on('open-data-parent', async () => {
    try {
      await shell.openPath(userDataDir);
    } catch (e) {
      sendLog(`[OPEN] failed to open data parent: ${e.message}`);
    }
  });

  createWindow();
  startRunner();
});
ipcMain.on('start-scheduler', startScheduler);
ipcMain.on('stop-scheduler', stopScheduler);
// Handle upload of prices.pdf into data folder
ipcMain.handle('upload-prices-pdf', async (event) => {
  try {
    const { dialog } = require('electron');
    const options = {
      title: 'Виберіть PDF для завантаження прайсів',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, options);
    if (!canceled && filePaths && filePaths.length > 0) {
      const selectedPath = filePaths[0];
      const destPath = path.join(dataDir, 'prices.pdf');
      fs.copyFileSync(selectedPath, destPath);
      return { success: true };
    } else {
      return { success: false };
    }
  } catch (err) {
    console.error('Error in upload-prices-pdf handler:', err);
    return { success: false, error: err.message };
  }
});
app.on('window-all-closed', () => {
  if (isRunning) stopScheduler();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
