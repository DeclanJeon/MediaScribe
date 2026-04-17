const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function collectTests(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      files.push(fullPath);
    }
  }

  return files;
}

const testsDir = path.resolve(__dirname, '..', 'tests');
const tests = collectTests(testsDir).sort();

if (tests.length === 0) {
  console.error(`No test files found under ${testsDir}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...tests], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
