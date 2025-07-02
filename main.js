const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
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
  console.log(`[${new Date().toISOString()}] Triggering retrieve XML at ${retrieveUrl}`);
  http.get(retrieveUrl, (res) => {
    const { statusCode } = res;
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (statusCode === 200) {
        console.log(`[${new Date().toISOString()}] retrieve XML success: ${data}`);
      } else {
        console.error(`[${new Date().toISOString()}] retrieve XML failed: ${statusCode} - ${data}`);
      }
    });
  }).on('error', (err) => {
    console.error(`[${new Date().toISOString()}] HTTP request error: ${err.message}`);
  });
}

function startScheduler() {
  if (isRunning) return;
  retrieve();
  schedulerInterval = setInterval(retrieve, intervalMs);
  isRunning = true;
  sendStatus();
}

function stopScheduler() {
  if (!isRunning) return;
  clearInterval(schedulerInterval);
  schedulerInterval = null;
  isRunning = false;
  sendStatus();
}

let mainWindow;
function sendStatus() {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('status-changed', isRunning);
  }
}

/**
 * Launch the background runner as a detached, hidden process
 */
function startRunner() {
  const runnerExe = path.join(__dirname, 'node32', 'node.exe');
  const runnerScript = path.join(__dirname, 'laminaticus-runner', 'index.js');
  const child = spawn(runnerExe, [runnerScript], {
    cwd: path.dirname(runnerScript),
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  });
  child.unref();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 700,
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