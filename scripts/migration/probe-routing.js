/**
 * Checks the OpenRouteService key actually works, and that the response shape
 * matches what lib/routing.ts reads out of it.
 *
 * The key is read from .env by this script and is never printed.
 *
 * usage: node scripts/migration/probe-routing.js
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", "..", ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const key = env.EXPO_PUBLIC_ORS_API_KEY;
if (!key) {
  console.error("EXPO_PUBLIC_ORS_API_KEY is not set in .env");
  process.exit(2);
}
console.log(`key present: ${key.length} characters`);

// Two real Baku points: the address on order #64, and the city centre.
const DESTINATION = { lat: 40.41493172615459, lng: 49.85827075168891 }; // проспект Зии Буниятова
const ORIGIN = { lat: 40.3777, lng: 49.8516 }; // Fountains Square, central Baku

(async () => {
  const response = await fetch(
    "https://api.openrouteservice.org/v2/directions/driving-car",
    {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      // [lng, lat] — the opposite order to the rest of this codebase.
      body: JSON.stringify({
        coordinates: [
          [ORIGIN.lng, ORIGIN.lat],
          [DESTINATION.lng, DESTINATION.lat],
        ],
      }),
    },
  );

  console.log(`HTTP ${response.status}`);
  const body = await response.json();

  if (!response.ok) {
    // Never echo the whole body: an error can quote the request back.
    console.error(`FAILED: ${body?.error?.message ?? body?.error ?? "unknown error"}`);
    process.exit(1);
  }

  const summary = body?.routes?.[0]?.summary;
  console.log("summary as returned:", JSON.stringify(summary));

  if (typeof summary?.distance !== "number" || typeof summary?.duration !== "number") {
    console.error("FAILED: response shape is not what lib/routing.ts expects");
    process.exit(1);
  }

  // Exactly the formatting the job card applies.
  const km = (summary.distance / 1000).toFixed(1);
  const minutes = Math.max(1, Math.round(summary.duration / 60));
  console.log(`\nthe card would read: ${km} km · about ${minutes} min away`);

  // A sanity check on the coordinate order: these two points are ~5km apart.
  // Reversed lat/lng would route somewhere in the Indian Ocean and come back
  // with a wildly different number, or no route at all.
  const plausible = summary.distance > 1000 && summary.distance < 30000;
  console.log(plausible
    ? "distance is plausible for two points inside Baku"
    : "SUSPICIOUS distance — check the coordinate order");

  // exitCode rather than process.exit(): fetch keeps a libuv handle open for a
  // moment after the response, and exiting on top of it makes Node print an
  // assertion failure that reads like the probe crashed.
  process.exitCode = plausible ? 0 : 1;
})().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exitCode = 1;
});
