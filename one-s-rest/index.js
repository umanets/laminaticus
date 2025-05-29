const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = 3001;

function retriveXml() {
  return new Promise((resolve, reject) => {
    const nodePath = path.resolve(__dirname, '../node32/node');
    const runnerPath = path.resolve(__dirname, 'runner.js');
    const savePath = process.env.REPORT_SAVE_PATH;
    const formPath = process.env.REPORT_MODULE_PATH;
    
    const db = process.env.REPORT_DB_CONFIGURATION;
    const user = process.env.REPORT_USER;
    const pass = process.env.REPORT_PASSWORD;

    const child = spawn(nodePath, ['--expose-gc', runnerPath, savePath, formPath, db, user, pass], {
      stdio: 'inherit',
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start child process: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`Child process exited with code ${code}`));
      }
    });
  });
}

retriveXml()
  .then(() => {
    console.log('✅ XML сгенерирован');
  })
  .catch((err) => {
    console.error('❌ Ошибка при генерации XML:', err.message);
  });

/**
 * GET /retrive-xml
 * Connects to 1C, opens the report form to generate XML,
 * then disconnects. The save path is read from REPORT_SAVE_PATH in .env.
 */
app.get('/retrieve-xml', async (req, res) => {
  try {
    await retriveXml(); // дожидаемся завершения spawn процесса
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Ошибка в retriveXml:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});

