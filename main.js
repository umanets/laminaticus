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
 * Launch the background runner and pipe its logs to the UI
 */
let runnerProcess;
function startRunner() {
  const runnerExe = path.join(__dirname, 'node32', 'node.exe');
  const runnerScript = path.join(__dirname, 'laminaticus-runner', 'index.js');
  runnerProcess = spawn(runnerExe, [runnerScript], {
    cwd: path.dirname(runnerScript),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  sendLog(`[RUNNER] started (pid ${runnerProcess.pid})`);
  runnerProcess.stdout.on('data', (data) => {
    data.toString().split(/\r?\n/).filter(line => line).forEach(line => {
      sendLog(`[RUNNER] ${line}`);
    });
  });
  runnerProcess.stderr.on('data', (data) => {
    data.toString().split(/\r?\n/).filter(line => line).forEach(line => {
      sendLog(`[RUNNER ERR] ${line}`);
    });
  });
  runnerProcess.on('exit', (code, signal) => {
    sendLog(`[RUNNER] exited with code ${code}${signal ? `, signal ${signal}` : ''}`);
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