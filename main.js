const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const http = require('http');

const intervalMin = parseInt(process.env.RETRIEVE_INTERVAL_MINUTES, 10);
if (isNaN(intervalMin) || intervalMin <= 0) {
  console.error('Error: RETRIEVE_INTERVAL_MINUTES not set or invalid in .env');
  app.quit();
}

const intervalMs = intervalMin * 60 * 1000;
const retrieveUrl = process.env.RETRIEVE_URL || 'http://localhost:3001/retrieve-xml';

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
    cwd: __dirname,
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
      const runnerExe = path.join(__dirname, 'node32', 'node.exe');
      const runnerScript = path.join(__dirname, 'laminaticus-runner', 'index.js');
      runnerProcess = spawn(runnerExe, [runnerScript], {
        cwd: path.dirname(runnerScript),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    sendStatus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Prepare a persistent log file for diagnostics
// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
  console.error('Failed to create data directory for logs:', e);
}
const logFilePath = path.join(dataDir, 'app.log');
let logStream;
try {
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
} catch (e) {
  console.error('Failed to open log file for writing:', e);
}

// Override sendLog to also write to persistent log
const origSendLog = sendLog;
sendLog = (message) => {
  const timestamp = new Date().toISOString();
  const out = `[${timestamp}] ${message}`;
  // Console and UI
  origSendLog(out);
  // File
  if (logStream && !logStream.destroyed) {
    logStream.write(out + '\n');
  }
};

app.whenReady().then(() => {
  createWindow();
  startRunner();
});
ipcMain.on('start-scheduler', startScheduler);
ipcMain.on('stop-scheduler', stopScheduler);
app.on('window-all-closed', () => {
  if (isRunning) stopScheduler();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});