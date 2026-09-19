/**
 * Rebuilds assets/images/nata-logo.png so it survives being scaled.
 *
 * The supplied artwork stores WHITE in its fully transparent pixels —
 * rgba(254,254,254,0) in every corner. Alpha hides that at full size, but the
 * moment the image is resampled (84px in AppLogo, or any icon size) bilinear
 * interpolation mixes those white RGB values into the disc's edge and leaves a
 * pale fringe. That is the "white parts" showing up around the mark, in the
 * app and in the launcher icon alike.
 *
 * Two fixes, both on the pixels rather than on every place that draws them:
 *
 *  1. Bleed the disc's colour outward into the transparent region, so there is
 *     no white left to interpolate against. Alpha is untouched — this only
 *     changes RGB in pixels nobody can see, which is exactly the point.
 *  2. Re-cut the alpha as a clean anti-aliased circle. The disc is inscribed
 *     in the canvas and touches the edges at the midpoints, so the mask is
 *     simply radius = width / 2.
 *
 * usage: NODE_PATH=./node_modules node scripts/clean-logo.js
 *        (sharp is not a dependency — npm install sharp --no-save first)
 */
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(__dirname, "..", "assets", "images", "nata-logo.png");
const SIZE = 1024;
const BLEED = 24; // px of colour pushed outward; plenty for any downscale

(async () => {
  const { data, info } = await sharp(SRC)
    .resize(SIZE, SIZE, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const px = Buffer.from(data);

  const alphaAt = (x, y) => px[(y * W + x) * 4 + 3];

  // Iterative dilation: each pass paints one ring of transparent pixels with
  // the average colour of their already-coloured neighbours.
  let known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) known[i] = px[i * 4 + 3] > 8 ? 1 : 0;

  for (let pass = 0; pass < BLEED; pass++) {
    const next = Uint8Array.from(known);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (known[idx]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nidx = ny * W + nx;
            if (!known[nidx]) continue;
            r += px[nidx * 4]; g += px[nidx * 4 + 1]; b += px[nidx * 4 + 2]; n++;
          }
        }
        if (!n) continue;
        px[idx * 4] = Math.round(r / n);
        px[idx * 4 + 1] = Math.round(g / n);
        px[idx * 4 + 2] = Math.round(b / n);
        next[idx] = 1;
      }
    }
    known = next;
  }

  /*
   * Clean circular alpha, anti-aliased over one pixel — cut slightly INSIDE
   * the artwork's own edge.
   *
   * The supplied disc carries a pale halo in its outermost pixels, left over
   * from being exported against a white page: rgba(228,237,253) at the very
   * edge, and true blue only from about 6px in at 1024. Masking at the full
   * radius keeps that halo, which then reads as a white rim against the blue
   * hero in-app, and gets propagated outward by the icon generator's radial
   * fill — showing up as white marks at the middle of each edge.
   *
   * Trimming 8px removes the halo and costs nothing visible: the disc is
   * simply 8px smaller in a 1024px canvas.
   */
  const HALO = 8;
  const cx = (W - 1) / 2, cy = (H - 1) / 2, radius = W / 2 - HALO;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.max(0, Math.min(1, radius - d));
      px[(y * W + x) * 4 + 3] = Math.round(a * 255);
    }
  }

  await sharp(px, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(SRC);

  // Confirm the corners no longer carry white.
  const { data: after } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return `rgba(${after[i]},${after[i + 1]},${after[i + 2]},${after[i + 3]})`;
  };
  console.log("corner TL", at(0, 0));
  console.log("corner BR", at(W - 1, H - 1));
  console.log("edge mid ", at(0, Math.floor(H / 2)));
  console.log(`written  ${SRC} at ${W}x${H}`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});
