const { ipcRenderer } = require('electron');

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