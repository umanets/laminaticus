const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

window.addEventListener('DOMContentLoaded', async () => {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const statusDisplay = document.getElementById('statusDisplay');
    const updateButton = document.getElementById('updateButton');
    const updateStatus = document.getElementById('updateStatus');
    const openDataParentButton = document.getElementById('openDataParentButton');

    let paths = { dataDir: path.join(__dirname, 'data') };
    try {
        paths = await ipcRenderer.invoke('get-paths');
    } catch {}

    startButton.addEventListener('click', () => {
        ipcRenderer.send('start-scheduler');
    });

    stopButton.addEventListener('click', () => {
        ipcRenderer.send('stop-scheduler');
    });

    ipcRenderer.on('status-changed', (event, status) => {
        statusDisplay.textContent = status ? 'Running' : 'Stopped';
    });

    // Show and dynamically update warning if data/error.log exists
    const warningDiv = document.getElementById('warningDiv');
    try {
        const errorLogPath = path.join(paths.dataDir, 'error.log');
        // Function to update warning visibility
        const updateWarning = () => {
            try {
                if (fs.existsSync(errorLogPath)) {
                    warningDiv.classList.remove('hidden');
                } else {
                    warningDiv.classList.add('hidden');
                }
            } catch (err) {
                console.error('Error checking error.log:', err);
            }
        };
        // Initial check
        updateWarning();
        // Watch data directory for runtime changes
        fs.watch(paths.dataDir, (eventType, filename) => {
            if (filename === 'error.log') {
                updateWarning();
            }
        });
    } catch (e) {
        console.error('Error watching data directory:', e);
    }

    // Upload multiple price files functionality with status label
    try {
        const uploadButton = document.getElementById('uploadButton');
        if (uploadButton) {
            const container = uploadButton.parentElement;
            // Create status label
            const statusLabel = document.createElement('p');
            statusLabel.id = 'pricesStatusLabel';
            statusLabel.style.fontSize = '0.9em';
            statusLabel.style.marginTop = '0.5rem';
            container.appendChild(statusLabel);
            const pricesDir = path.join(paths.dataDir, 'prices');
            try { fs.mkdirSync(pricesDir, { recursive: true }); } catch {}
            const allowed = new Set(['.pdf', '.doc', '.docx', '.csv', '.xml', '.xls', '.xlsx']);
            const updateStatusLabel = () => {
                try {
                    if (!fs.existsSync(pricesDir)) {
                        statusLabel.textContent = 'Прайси не завантажено';
                        return;
                    }
                    const files = fs.readdirSync(pricesDir).filter(f => allowed.has(path.extname(f).toLowerCase()));
                    statusLabel.textContent = files.length > 0 ? `Прайси завантажено (${files.length} файл(и))` : 'Прайси не завантажено';
                } catch { statusLabel.textContent = 'Прайси не завантажено'; }
            };
            // Initial status
            updateStatusLabel();
            // Watch for updates
            try {
                fs.watch(pricesDir, () => { updateStatusLabel(); });
            } catch {}
            // Upload button click
            uploadButton.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('upload-prices-files');
                    if (!result.success) {
                        console.error('Upload cancelled or failed');
                    }
                } catch (err) {
                    console.error('Error uploading prices:', err);
                }
            });
        }
    } catch (err) {
        console.error('Error setting up upload button and status label:', err);
    }

    const MAX_LOGS = 30;
    const logContainer = document.getElementById('logContainer');

    ipcRenderer.on('log', (event, message) => {
        const line = document.createElement('div');
        line.textContent = message;
        
        logContainer.prepend(line);

        while (logContainer.childElementCount > MAX_LOGS) {
            logContainer.removeChild(logContainer.lastElementChild);
        }

        logContainer.scrollTop = 0;
    });

    // Open data parent folder
    if (openDataParentButton) {
        openDataParentButton.addEventListener('click', () => {
            ipcRenderer.send('open-data-parent');
        });
    }

    // Auto-update UI
    if (updateButton && updateStatus) {
        updateButton.classList.add('hidden');
        ipcRenderer.on('update-available', (event, info) => {
            updateStatus.textContent = `Доступне оновлення ${info.version}`;
            updateButton.classList.remove('hidden');
        });
        ipcRenderer.on('update-progress', (event, p) => {
            const pct = Math.floor(p.percent || 0);
            updateStatus.textContent = `Завантаження оновлення: ${pct}%`;
        });
        ipcRenderer.on('update-downloaded', () => {
            updateStatus.textContent = 'Оновлення завантажено. Додаток перезапуститься.';
        });
        updateButton.addEventListener('click', () => {
            updateStatus.textContent = 'Встановлення оновлення...';
            ipcRenderer.send('start-update');
        });
    }
});
