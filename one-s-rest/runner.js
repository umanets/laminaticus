const { connect1C, openReportForm, disconnect1C } = require('./onec');

const savePath = process.argv[2]; // путь передаётся в args
const formPath = process.argv[3]; // путь до .ert
const db       = process.argv[4]; // путь до 1c db configuration
const user     = process.argv[5];
const pass     = process.argv[6];

try {
    const srv = connect1C(user, pass, db);
    if (srv.connected){
        openReportForm(srv.v7, savePath, formPath);
        console.log('✅ 1C XML generation complete.');
    }
    disconnect1C(srv.v7);
    process.exit(0);
} catch (err) {
    console.error('❌ Error in 1C execution:', err.message);
    process.exit(1);
}
