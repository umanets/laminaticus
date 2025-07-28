const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

window.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const statusDisplay = document.getElementById('statusDisplay');

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
        const dataDir = path.join(__dirname, 'data');
        const errorLogPath = path.join(dataDir, 'error.log');
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
        fs.watch(dataDir, (eventType, filename) => {
            if (filename === 'error.log') {
                updateWarning();
            }
        });
    } catch (e) {
        console.error('Error watching data directory:', e);
    }

    // Upload prices.pdf functionality with status label
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
            const dataDirPrices = path.join(__dirname, 'data');
            const pricesPath = path.join(dataDirPrices, 'prices.pdf');
            const updateStatusLabel = () => {
                if (fs.existsSync(pricesPath)) {
                    statusLabel.textContent = 'Прайси завантажено';
                } else {
                    statusLabel.textContent = 'Прайси не завантажено';
                }
            };
            // Initial status
            updateStatusLabel();
            // Watch for updates
            fs.watch(dataDirPrices, (eventType, filename) => {
                if (filename === 'prices.pdf') {
                    updateStatusLabel();
                }
            });
            // Upload button click
            uploadButton.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('upload-prices-pdf');
                    if (!result.success) {
                        console.error('Upload cancelled or failed');
                    }
                } catch (err) {
                    console.error('Error uploading prices.pdf:', err);
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
});