/**
 * What App Store Connect actually holds: builds and version states.
 *
 * Worth having in the repo rather than a scratch file — `eas submit` reporting
 * "finished" is not proof a build reached Apple. Build 6 was reported as
 * submitted on 2026-09-08 and never appeared here.
 *
 * Reads the API key from ~/.app-store/; nothing is written.
 */
const fs = require("fs");
const crypto = require("crypto");

const KEY_PATH = "C:/Users/User/.app-store/AuthKey_658G7R82ZW.p8";
const KEY_ID = "658G7R82ZW";
const ISSUER_ID = "aa65687e-29cd-45ed-8e53-13ab4489eb12";
const APP_ID = "6793012757";

const b64url = (b) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const now = Math.floor(Date.now() / 1000);
const head = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
const body = b64url(
  JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })
);
const input = `${head}.${body}`;
const sig = crypto.sign("sha256", Buffer.from(input), {
  key: fs.readFileSync(KEY_PATH, "utf8"),
  dsaEncoding: "ieee-p1363",
});
const token = `${input}.${b64url(sig)}`;

const api = async (p) => {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${p}\n${(await r.text()).slice(0, 400)}`);
  return r.json();
};

(async () => {
  const builds = await api(`/v1/builds?filter[app]=${APP_ID}&limit=8&sort=-uploadedDate`);
  console.log("=== builds at Apple ===");
  for (const b of builds.data) {
    console.log(
      `  build ${String(b.attributes.version).padEnd(3)} ${b.attributes.processingState.padEnd(12)} uploaded=${b.attributes.uploadedDate}`
    );
  }

  const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=4&include=build`);
  console.log("\n=== versions ===");
  for (const v of versions.data) {
    const rel = v.relationships?.build?.data;
    const attached = rel ? (versions.included || []).find((i) => i.id === rel.id) : null;
    console.log(
      `  ${v.attributes.versionString.padEnd(8)} ${v.attributes.appStoreState.padEnd(20)} build=${attached ? attached.attributes.version : "none"}`
    );
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});
