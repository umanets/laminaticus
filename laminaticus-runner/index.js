#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Base directory: parent of this runner folder
const baseDir = path.resolve(__dirname, '..');

// Define the services to run
const services = [
  {
    name: 'BOT',
    cwd: path.join(baseDir, 'demo-telegram-bot'),
    command: 'npx ts-node bot.ts',
    args: [],
    shell: true
  },
  {
    name: 'API',
    cwd: path.join(baseDir, 'one-s-rest'),
    command: path.join(baseDir, 'node32', 'node.exe'),
    args: ['index.js'],
    shell: false
  },
  {
    name: 'REPORT',
    cwd: path.join(baseDir, 'report-watcher'),
    command: path.join(baseDir, 'node32', 'node.exe'),
    args: ['index.js'],
    shell: false
  },
  {
    name: 'SCHEDULER',
    cwd: path.join(baseDir, 'one-s-rest'),
    command: path.join(baseDir, 'node32', 'node.exe'),
    args: ['scheduler.js'],
    shell: false
  }
];

// Keep track of child processes
const children = [];

// Compute label formatting width
const errorSuffix = ' ERR';
const maxNameLen = Math.max(...services.map(s => s.name.length));
const labelWidth = maxNameLen + errorSuffix.length + 1;

// Start each service
services.forEach(({ name, cwd, command, args, shell }) => {
  const options = {
    cwd,
    shell,
    stdio: ['ignore', 'pipe', 'pipe']
  };
  const child = spawn(command, shell ? [] : args, options);
  const normalLabel = name.padEnd(labelWidth);
  console.log(`[${normalLabel}] started (pid ${child.pid})`);
  child.stdout.on('data', data => {
    const lines = data.toString().split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (idx === lines.length - 1 && line === '') return;
      const lbl = name.padEnd(labelWidth);
      console.log(`[${lbl}] ${line}`);
    });
  });
  child.stderr.on('data', data => {
    const lines = data.toString().split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (idx === lines.length - 1 && line === '') return;
      const lbl = (name + errorSuffix).padEnd(labelWidth);
      console.error(`[${lbl}] ${line}`);
    });
  });
  child.on('exit', (code, signal) => {
    const lbl = name.padEnd(labelWidth);
    console.log(`[${lbl}] exited with code ${code}${signal ? `, signal ${signal}` : ''}`);
  });
  children.push(child);
});

// Graceful shutdown on Ctrl+C
function shutdown() {
  console.log('Shutting down all services...');
  children.forEach(child => {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  });
  setTimeout(() => process.exit(), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);