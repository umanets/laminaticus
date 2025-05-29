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

console.log(`Starting XML retrieve scheduler: every ${intervalMin} minute(s)`);
retrieve();
setInterval(retrieve, intervalMs);