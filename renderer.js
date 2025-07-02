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
    // Append log messages to the log container
    const logContainer = document.getElementById('logContainer');
    ipcRenderer.on('log', (event, message) => {
        const line = document.createElement('div');
        line.textContent = message;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
    });
});