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
});