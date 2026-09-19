/**
 * Fails if the app icons are not actually pictures.
 *
 * This exists because they were not. icon.png and adaptive-icon.png were
 * plain near-black squares and splash.png a blank white canvas, and every
 * build ever made — 1.0.2 included — shipped with no logo on the home screen,
 * in the launcher, or on the App Store listing.
 *
 * Nothing could catch it. The assets are correct PNGs of the right size in the
 * right place, in-app branding renders from nata-logo.png and looks fine, and
 * a typecheck, 148 backend tests and a green EAS build all pass regardless of
 * what the picture contains. The only signal was looking at it.
 *
 * So this looks at it. Run before a push:
 *   node scripts/check-app-icons.js
 *
 * Deliberately no dependencies. sharp would do this in three lines, but it
 * ships prebuilt native binaries, and a check that cannot run without a native
 * install is a check that gets skipped. PNG decoding here is limited to what
 * these files use: 8-bit RGB or RGBA, non-interlaced.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const dir = path.join(__dirname, "..", "assets", "images");

function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    off += 12 + len;
  }

  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    // Not worth decoding by hand; report shape only and skip the pixel test.
    return { width, height, colorType, pixels: null };
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline filters (PNG spec 9.2). Without this every row after
  // the first is nonsense and the "is it one colour" test is meaningless.
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }

  return { width, height, colorType, channels, pixels: out, stride };
}

/** How many distinct RGB values appear across an evenly spaced sample. */
function distinctColours({ width, height, channels, pixels, stride }) {
  const seen = new Set();
  const step = Math.max(1, Math.floor(width / 64));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = y * stride + x * channels;
      seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    }
  }
  return seen.size;
}

// A real mark has hundreds of distinct values once antialiasing and any
// gradient are counted. A solid fill has one; a flat two-tone logo would still
// clear this comfortably.
const MIN_COLOURS = 24;

const checks = [
  { file: "icon.png", size: 1024, alpha: false, label: "iOS app icon" },
  { file: "adaptive-icon.png", size: 1024, alpha: true, label: "Android adaptive icon" },
  { file: "splash.png", size: null, alpha: true, label: "splash mark" },
];

let failed = 0;

for (const { file, size, alpha, label } of checks) {
  const full = path.join(dir, file);
  let img;
  try {
    img = decode(full);
  } catch (e) {
    console.log(`FAIL  ${file.padEnd(20)} ${e.message}`);
    failed++;
    continue;
  }

  const problems = [];

  if (size && (img.width !== size || img.height !== size)) {
    problems.push(`expected ${size}x${size}, found ${img.width}x${img.height}`);
  }

  // The App Store rejects an icon that HAS an alpha channel, even when every
  // pixel in it is opaque — colour type 6 is RGBA, 2 is RGB.
  const hasAlpha = img.colorType === 6;
  if (alpha === false && hasAlpha) {
    problems.push("has an alpha channel; App Store validation rejects this");
  }

  if (img.pixels) {
    const colours = distinctColours(img);
    if (colours < MIN_COLOURS) {
      problems.push(
        `only ${colours} distinct colour(s) — this looks like a blank fill, not a logo`
      );
    }
  }

  if (problems.length) {
    failed++;
    console.log(`FAIL  ${file.padEnd(20)} ${label}`);
    for (const p of problems) console.log(`      - ${p}`);
  } else {
    console.log(`ok    ${file.padEnd(20)} ${img.width}x${img.height}`);
  }
}

if (failed) {
  console.log(
    `\n${failed} icon check(s) failed. Regenerate from the logo:\n` +
      `  npm install sharp --no-save && node scripts/make-app-icons.js`
  );
  process.exitCode = 1;
}
