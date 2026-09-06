/**
 * Builds the launcher icons and the splash mark from assets/images/nata-logo.png.
 *
 * They had never been generated. icon.png and adaptive-icon.png were plain
 * near-black squares and splash.png a blank white canvas — 4KB and 12KB, which
 * is what a solid fill costs — so the shipped app had no logo anywhere the
 * operating system shows one. In-app was fine, because components/AppLogo.tsx
 * renders nata-logo.png directly; only the OS-facing assets were empty, and
 * nothing in a build or a test can notice that.
 *
 * Run after changing the logo:
 *   npm install sharp --no-save && node scripts/make-app-icons.js
 *
 * sharp is deliberately not a dependency. It ships prebuilt native binaries,
 * and putting it in package.json would add a native install step to every EAS
 * Build — which is exactly what broke the builds on 2026-09-05 when eas-cli
 * dragged in node-gyp.
 */
const path = require("path");
const sharp = require("sharp");

const dir = path.join(__dirname, "..", "assets", "images");
const SRC = path.join(dir, "nata-logo.png");
const SIZE = 1024;

(async () => {
  /*
   * iOS. The App Store rejects an icon with an alpha channel, and iOS masks
   * the square to a rounded rect itself — so the canvas has to be filled edge
   * to edge and flattened.
   *
   * The fill is the logo itself, scaled to cover and blurred heavily. The mark
   * is a blue circle on a gradient, so a blurred copy reproduces that gradient
   * at the corners and the circle's edge disappears into it. A flat brand blue
   * left a visible seam where the gradient met it.
   */
  const background = await sharp(SRC)
    .resize(SIZE, SIZE, { fit: "cover" })
    .blur(60)
    .toBuffer();

  const mark = await sharp(SRC).resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();

  await sharp(background)
    .composite([{ input: mark }])
    .flatten({ background: "#3B6BF0" })
    // flatten composites away transparency but leaves the channel in place,
    // and App Store validation rejects an icon that HAS an alpha channel even
    // when every pixel in it is opaque. removeAlpha is what actually drops it.
    .removeAlpha()
    .png()
    .toFile(path.join(dir, "icon.png"));

  /*
   * Android adaptive icon. The launcher crops this to whatever shape the
   * device uses — circle, squircle, teardrop — and only the middle ~66% is
   * guaranteed visible. The mark is scaled into that safe zone on a
   * transparent canvas; the blue behind it comes from adaptiveIcon
   * .backgroundColor in app.config.ts, so the circle's own edge is never the
   * thing being cropped.
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
   * Splash. expo-splash-screen centres this image at imageWidth on its own
   * background colour, so it wants the mark alone — not a full-screen canvas.
   * The old 1242x2436 white rectangle was being scaled to 200px wide, which is
   * why the launch screen showed nothing at all.
   */
  await sharp(SRC).resize(SIZE, SIZE).png().toFile(path.join(dir, "splash.png"));

  for (const f of ["icon.png", "adaptive-icon.png", "splash.png"]) {
    const m = await sharp(path.join(dir, f)).metadata();
    console.log(`${f.padEnd(20)} ${m.width}x${m.height}  alpha=${m.hasAlpha}`);
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});
