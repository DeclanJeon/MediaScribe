const zlib = require('node:zlib');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function paintPixel(row, x, rgba) {
  const idx = 1 + x * 4;
  row[idx] = rgba[0];
  row[idx + 1] = rgba[1];
  row[idx + 2] = rgba[2];
  row[idx + 3] = rgba[3];
}

function createPng(size) {
  const rows = [];
  const center = (size - 1) / 2;
  const radius = size * 0.41;

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;

    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const distanceRatio = Math.min(1, distance / radius);

      let base = [0, 0, 0, 0];
      if (distance <= radius) {
        const angular = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
        const topBlend = Math.max(0, 1 - (y / size));
        const leftBlend = Math.max(0, 1 - (x / size));
        const t = Math.min(1, 0.55 * topBlend + 0.25 * leftBlend + 0.2 * angular);
        const r = mix(15, 68, t);
        const g = mix(92, 150, t);
        const b = mix(225, 255, t);
        const alpha = distanceRatio > 0.96 ? Math.round(255 * (1 - (distanceRatio - 0.96) / 0.04)) : 255;
        base = [r, g, b, Math.max(0, alpha)];
      }

      const innerRadius = radius * 0.78;
      if (distance <= innerRadius) {
        const glow = Math.max(0, 1 - distance / innerRadius);
        base = [
          mix(base[0], 230, glow * 0.28),
          mix(base[1], 242, glow * 0.28),
          mix(base[2], 255, glow * 0.22),
          base[3],
        ];
      }

      const outerRing = Math.abs(distance - radius * 0.72) <= size * 0.018;
      const innerRing = Math.abs(distance - radius * 0.52) <= size * 0.014;
      const play = x > size * 0.39 && x < size * 0.67 && y > size * 0.29 && y < size * 0.73 && (x - size * 0.39) > Math.abs(y - size * 0.51) * 0.70;
      const noteStem = x > size * 0.61 && x < size * 0.66 && y > size * 0.31 && y < size * 0.56;
      const noteDot = ((x - size * 0.60) ** 2 + (y - size * 0.61) ** 2) < (size * 0.045) ** 2;

      if (outerRing) {
        base = [240, 248, 255, 255];
      }
      if (innerRing) {
        base = [158, 211, 255, 255];
      }
      if (play) {
        base = [255, 255, 255, 255];
      }
      if (noteStem || noteDot) {
        base = [213, 238, 255, 255];
      }

      paintPixel(row, x, base);
    }

    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    pngHeader,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

module.exports = {
  createPng,
  createIco,
};
