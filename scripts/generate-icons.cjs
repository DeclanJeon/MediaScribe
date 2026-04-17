const fs = require('node:fs');
const path = require('node:path');
const { createPng, createIco } = require('./icon-utils.cjs');

const iconDir = path.resolve(__dirname, '..', 'assets');
fs.mkdirSync(iconDir, { recursive: true });

const png256 = createPng(256);
const png64 = createPng(64);
const ico = createIco(png256, 256);

fs.writeFileSync(path.join(iconDir, 'app-icon-256.png'), png256);
fs.writeFileSync(path.join(iconDir, 'app-icon-64.png'), png64);
fs.writeFileSync(path.join(iconDir, 'app-icon.ico'), ico);

console.log('Icons generated in', iconDir);
