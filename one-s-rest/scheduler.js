#!/usr/bin/env node

const path = require('path');
// Load environment variables from project root .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const http = require('http');

// Interval in minutes, defined in .env
const intervalMin = parseInt(process.env.RETRIEVE_INTERVAL_MINUTES, 10);
if (isNaN(intervalMin) || intervalMin <= 0) {
  console.error('Error: RETRIEVE_INTERVAL_MINUTES not set or invalid in .env');
  process.exit(1);
}
const intervalMs = intervalMin * 60 * 1000;

const url = 'http://localhost:3001/retrieve-xml';

let schedulerInterval = null; // To hold the setInterval ID
let isRunning = false;        // To track if the scheduler is active

/**
 * Function to perform the XML retrieval HTTP request.
 */
async function retrieve() {
  console.log(`[${new Date().toISOString()}] Triggering retrieve XML at ${url}`);
  http.get(url, (res) => {
    const { statusCode } = res;
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (statusCode === 200) {
        console.log(`[${new Date().toISOString()}] retrieve XML success: ${data}`);
      } else {
        console.error(`[${new Date().toISOString()}] retrieve XML failed: ${statusCode} - ${data}`);
      }
    });
  }).on('error', (err) => {
    console.error(`[${new Date().toISOString()}] HTTP request error: ${err.message}`);
  });
}

/**
 * Starts the XML retrieval scheduler.
 */
function startScheduler() {
  if (isRunning) {
    console.log('Scheduler is already running.');
    return;
  }
  console.log(`Starting XML retrieve scheduler: every ${intervalMin} minute(s)`);
  // Perform an immediate retrieve when starting
  retrieve();
  // Set up the interval for subsequent retrieves
  schedulerInterval = setInterval(retrieve, intervalMs);
  isRunning = true;
  console.log('Scheduler started. Type "stop" to halt.');
}

/**
 * Stops the XML retrieval scheduler.
 */
function stopScheduler() {
  if (!isRunning) {
    console.log('Scheduler is not running.');
    return;
  }
  console.log('Stopping XML retrieve scheduler.');
  clearInterval(schedulerInterval);
  schedulerInterval = null;
  isRunning = false;
  console.log('Scheduler stopped. Type "start" to resume.');
}

// Set up stdin for console input
process.stdin.setEncoding('utf8');
console.log('Type "start" to begin XML retrieval, or "stop" to halt.');

process.stdin.on('data', (input) => {
  const command = input.trim().toLowerCase();
  if (command === 'start') {
    startScheduler();
  } else if (command === 'stop') {
    stopScheduler();
  } else {
    console.log(`Unknown command: "${command}". Type "start" or "stop".`);
  }
});

// Handle process exit to ensure a clean shutdown
process.on('exit', () => {
  if (isRunning) {
    console.log('Application exiting, stopping scheduler.');
    clearInterval(schedulerInterval);
  }
});

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down...');
  process.exit();
});
