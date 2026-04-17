const fs = require('node:fs');
const path = require('node:path');

const distPath = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('Removed', distPath);
} else {
  console.log('No dist directory to remove.');
}
