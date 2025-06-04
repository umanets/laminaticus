const { connect1C, openReportForm, disconnect1C } = require('./onec');

// Аргументы: savePath, formPath, dbPath, userName, password
const [savePath, formPath, db, user, pass] = process.argv.slice(2);

(async () => {
  try {
    const srv = await connect1C(user, pass, db);
    if (srv.pids && srv.pids.length > 0) {
      console.log(`🔍 Detected 1C process PIDs: ${srv.pids.join(', ')}`);
    }
    // srv.connected: "true" | "false" | "error"
    if (srv.connected === 'false') {
      console.error('❌ 1C connection failed.');
      return process.exit(1);
    }
    if (srv.connected === 'error') {
      console.error('❌ 1C connection timed out.');
      return process.exit(1);
    }
    await openReportForm(srv.v7, savePath, formPath);
    console.log('✅ 1C XML generation complete.', savePath, formPath);
    disconnect1C(srv.v7, srv.connected);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error in 1C execution:', err);
    process.exit(1);
  }
})();
