/**
 * Builds the launcher icons, the splash mark and the Play store-listing icon
 * from assets/images/nata-logo.png.
 *
 * Run after changing the logo:
 *   npm install sharp --no-save
 *   NODE_PATH=./node_modules node scripts/make-app-icons.js
 *
 * sharp is deliberately not a dependency. It ships prebuilt native binaries,
 * and putting it in package.json would add a native install step to every EAS
 * Build — which is what eas-cli's node-gyp did to the builds on 2026-09-05.
 *
 * HISTORY, because both mistakes are easy to repeat:
 *
 *  * These assets were once plain black and white squares. Every build up to
 *    1.1.0 build 4 shipped with no logo anywhere the OS shows one, and nothing
 *    in a typecheck, a test or a build can notice that.
 *  * The supplied artwork stored WHITE in its fully transparent pixels, so any
 *    resample bled white into the disc's edge. scripts/clean-logo.js fixed the
 *    source; if the logo is ever replaced, run that first or the fringe comes
 *    back.
 */
const path = require("path");
const sharp = require("sharp");

const dir = path.join(__dirname, "..", "assets", "images");
const SRC = path.join(dir, "nata-logo.png");
const SIZE = 1024;

(async () => {
  /*
   * iOS / launcher icon. Square, filled edge to edge: the disc is scaled to
   * cover, so its curvature is cropped at the corners and the blue reaches
   * every edge. iOS applies its own rounded-rect mask on top.
   *
   * No alpha channel. App Store validation rejects an icon that HAS one, even
   * when every pixel is opaque, and flatten() alone leaves the channel behind
   * — removeAlpha is what drops it.
   */
  /*
   * Two wrong ways to fill the square, both tried:
   *
   *   fit: "cover" is a no-op when source and target are both square. It left
   *   the disc inscribed with transparent corners, which removeAlpha flattened
   *   to BLACK.
   *
   *   Scaling past the square and cropping the centre does fill it, but a
   *   circle needs sqrt(2) to cover its bounding square and the droplet is
   *   large within the disc — so the droplet ran off the bottom edge.
   *
   * Instead, keep the mark at its natural size and extend the disc's edge
   * colour radially outward into the corners. Nothing is cropped, nothing is
   * white, and the disc's boundary is invisible because the colour simply
   * continues through it.
   */
  {
    const { data, info } = await sharp(SRC)
      .resize(SIZE, SIZE)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const W = info.width;
    const H = info.height;
    const out = Buffer.alloc(W * H * 3);
    const cx = (W - 1) / 2;
    const cy = (H - 1) / 2;
    // Sample well inside the rim. clean-logo.js already trims the artwork's
    // pale halo, but the mask's own anti-aliased edge is still a blend toward
    // transparent — sampling it would smear that outward at the middle of
    // each edge, which is exactly the white marks this replaced.
    const radius = W / 2 - 16;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        // Inside the disc, take the pixel. Outside, clamp back to the nearest
        // point on the rim and take that colour instead.
        let sx = x;
        let sy = y;
        if (d > radius) {
          const k = radius / d;
          sx = Math.round(cx + dx * k);
          sy = Math.round(cy + dy * k);
        }
        const si = (sy * W + sx) * 4;
        const oi = (y * W + x) * 3;
        out[oi] = data[si];
        out[oi + 1] = data[si + 1];
        out[oi + 2] = data[si + 2];
      }
    }

    await sharp(out, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(path.join(dir, "icon.png"));
  }

  /*
   * Android adaptive icon. The launcher crops this to whatever shape the
   * device uses and only the middle ~66% is guaranteed visible, so the mark
   * sits inside that safe zone on transparency. The blue behind it comes from
   * adaptiveIcon.backgroundColor in app.config.ts.
   */
  const safe = Math.round(SIZE * 0.66);
  const pad = Math.round((SIZE - safe) / 2);
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: await sharp(SRC).resize(safe, safe).toBuffer(), top: pad, left: pad }])
    .png()
    .toFile(path.join(dir, "adaptive-icon.png"));

  /*
   * Splash. expo-splash-screen centres this at imageWidth on its own
   * background colour, so it wants the mark alone — not a full-screen canvas.
   */
  await sharp(SRC).resize(SIZE, SIZE).png().toFile(path.join(dir, "splash.png"));

  /*
   * Google Play store listing. A separate 512x512 upload in the Play Console,
   * not part of the app bundle — Play requires exactly this size, 32-bit PNG,
   * no transparency.
   */
  await sharp(path.join(dir, "icon.png"))
    .resize(512, 512)
    .removeAlpha()
    .png()
    .toFile(path.join(dir, "play-store-icon.png"));

  for (const f of ["icon.png", "adaptive-icon.png", "splash.png", "play-store-icon.png"]) {
    const m = await sharp(path.join(dir, f)).metadata();
    console.log(`${f.padEnd(22)} ${m.width}x${m.height}  alpha=${m.hasAlpha}`);
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});
