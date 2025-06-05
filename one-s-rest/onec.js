const { fork, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
// Path to data directory and error log
const dataDir = path.resolve(__dirname, '../data');
const errorLogPath = path.join(dataDir, 'error.log');

// Utility: list all 1cv7.exe PIDs
function get1CV7PIDs() {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq 1cv7.exe" /FO CSV /NH', { encoding: 'utf8' });
    return output
      .split(/\r?\n/)
      .filter(line => line.trim())
      .map(line => {
        const cols = line.split(',');
        const pidStr = cols[1].replace(/"/g, '').trim();
        return parseInt(pidStr, 10);
      })
      .filter(pid => !isNaN(pid));
  } catch {
    return [];
  }
}

// Kill a single 1cv7.exe process by PID
function kill1CProcess(pid) {
  if (pid) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`✅ Процесс 1С (PID: ${pid}) был завершён`);
    } catch (err) {
      console.error(`❌ Ошибка при завершении процесса 1С (PID: ${pid})`, err);
    }
  }
}

/**
 * Connect to 1C via child process with a 60s timeout.
 * Returns: { v7:Object|null, connected: 'true'|'false'|'error', pid:number, pids:number[], error?:any }
 */
async function connect1C(userName, password, db_path) {
  return new Promise(resolve => {
    // snapshot existing 1C PIDs before start
    const beforePIDs = get1CV7PIDs();
    const child = fork(
      path.resolve(__dirname, 'connect1c_child.js'),
      [userName, password, db_path],
      { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] }
    );
    const pid = child.pid;
    // Kill child if no response in 60s
    const timer = setTimeout(() => {
      // timeout: kill child and any new 1C processes
      child.kill('SIGKILL');
      const afterPIDs = get1CV7PIDs();
      const timeoutPIDs = afterPIDs.filter(pid => !beforePIDs.includes(pid));
      for (const tpid of timeoutPIDs) kill1CProcess(tpid);
      // log timeout to error.log
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
      try { fs.writeFileSync(errorLogPath, `1C initialize timed out at ${new Date().toISOString()}`); } catch {}
      resolve({ v7: null, connected: 'error', pid, pids: timeoutPIDs });
    }, 10000);
    const pending = new Map();
    let nextId = 1;
    let initialized = false;
    child.on('message', msg => {
      if (msg.type === 'init') {
        clearTimeout(timer);
        initialized = true;
        const procPids = Array.isArray(msg.pids) ? msg.pids : [];
        if (!msg.connected) {
          // failed init: kill spawned 1C processes
          child.kill();
          for (const tpid of procPids) kill1CProcess(tpid);
          try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
          try { fs.writeFileSync(errorLogPath, `1C initialize timed out at ${new Date().toISOString()}`); } catch {}
          resolve({ v7: null, connected: 'false', pid, pids: procPids });
        } else {
          const v7 = {};
          ['ExecuteBatch', 'ЗавершитьРаботуСистемы'].forEach(method => {
            v7[method] = (...args) => new Promise((res, rej) => {
              const id = nextId++;
              pending.set(id, { res, rej });
              child.send({ type: 'call', id, method, args });
            });
          });
          // store child process and target 1C PIDs for later cleanup
          v7._child = child;
          v7._pids = procPids;
          // On successful connection, remove existing error.log if present
          try {
            if (fs.existsSync(errorLogPath)) fs.unlinkSync(errorLogPath);
          } catch {}
          resolve({ v7, connected: 'true', pid, pids: procPids });
        }
      } else if (msg.type === 'result' || msg.type === 'error') {
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        if (msg.type === 'result') entry.res(msg.result);
        else entry.rej(new Error(msg.error));
      }
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ v7: null, connected: 'false', pid, pids: [], error: err });
    });
    child.on('exit', code => {
      clearTimeout(timer);
      if (!initialized) resolve({ v7: null, connected: 'false', pid, pids: [] });
    });
  });
}

/**
 * Shutdown COM worker gracefully.
 */
/**
 * Shutdown COM child process gracefully.
 */
/**
 * Shutdown COM child process and kill any spawned 1C processes.
 */
/**
 * Shutdown COM child process and, on error, kill spawned 1C processes.
 * @param {Object} v7 - COM proxy with _child and _pids
 * @param {'true'|'false'|'error'} connectedFlag
 */

// async function disconnect1C(v7, connectedFlag) {
//   if (!v7 || !v7._child) return;
//   // Instruct child to clean up COM internally
//   try { v7._child.send({ type: 'shutdown' }); } catch {}
//   // Kill the child process
//   try { v7._child.kill(); } catch {}
//   // If timeout/error, kill any leftover 1CV7.exe processes
//   if (connectedFlag === 'error' && Array.isArray(v7._pids)) {
//     for (const pid of v7._pids) {
//       kill1CProcess(pid);
//     }
//   }
// }

function disconnect1C(v7, connectedFlag) {
  if (v7) {
    try {
      v7.ЗавершитьРаботуСистемы(1);
    } catch {
      console.log("v7 instance not completed in memory for inner clean up")
    }

    try { v7._child.send({ type: 'shutdown' }); } catch {}

    if (connectedFlag === 'error' && Array.isArray(v7._pids)) {
      for (const pid of v7._pids) {
        kill1CProcess(pid);
      }
    }

    try {
      // winax.release(v7);
      v7 = undefined;
      global.gc && global.gc();
      console.log('🧹 Подключение к 1С закрыто.');
    } catch (error) {
      console.error('⚠️ Ошибка при отключении от 1С:', error);
    }
  }
}


/**
 * Execute the report form via COM.
 */
async function openReportForm(v7, savePath, formPath) {
  if (!v7) {
    console.error('❌ Нет подключения к 1С.');
    return;
  }
  if (!savePath || !formPath) {
    console.error('❌ Неверные параметры savePath/formPath.');
    return;
  }
  try {
    const cmd = `ОткрытьФорму("Отчет", "${savePath}", "${formPath}")`;
    console.log('📤 Выполняем ExecuteBatch');
    const ok = await v7.ExecuteBatch(cmd);
    console.log(ok ? '✅ Форма успешно открыта.' : '❌ Ошибка ExecuteBatch');
  } catch (error) {
    console.error('❌ ExecuteBatch упал:', error);
  }
}

module.exports = { connect1C, disconnect1C, openReportForm };