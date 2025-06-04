const { Object: COMObject } = require('winax');
const winax = require('winax');

let v7;
// Utility: list all 1cv7.exe process IDs
const { execSync } = require('child_process');
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

// Initialize COM connection and detect new 1C process
(async () => {
  const [,, userName, password, db_path] = process.argv;
  // Snapshot before
  const before = get1CV7PIDs();
  try {
    v7 = new COMObject('V77.Application');
  } catch (e) {
    if (process.send) process.send({ type: 'init', connected: false, pids: [] });
    return;
  }
  let initParams = `/d ${db_path}`;
  if (userName) initParams += ` /n "${userName}"`;
  if (password) initParams += ` /p "${password}"`;
  let ok = false;
  try {
    ok = v7.Initialize(v7.RMTrade, initParams, 'NO_SPLASH_SHOW');
  } catch (err) {
    ok = false;
  }
  // Snapshot after
  const after = get1CV7PIDs();
  const newPids = after.filter(pid => !before.includes(pid));
  if (process.send) process.send({ type: 'init', connected: Boolean(ok), pids: newPids });
})();

// Handle RPC calls for COM methods
process.on('message', msg => {
  if (!v7) return;
  if (msg.type === 'call') {
    const { id, method, args } = msg;
    try {
      const result = v7[method](...args);
      if (process.send) process.send({ type: 'result', id, result });
    } catch (err) {
      if (process.send) process.send({ type: 'error', id, error: err.message });
    }
  } else if (msg.type === 'shutdown') {
    try {
      if (v7) {
        v7.ЗавершитьРаботуСистемы(1);
      }
    } catch (_) {}
    try { 
      winax.release(v7); 
      v7 = undefined;
      global.gc && global.gc();
    } catch (_) {}
    process.exit(0);
  }
});