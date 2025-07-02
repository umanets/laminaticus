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