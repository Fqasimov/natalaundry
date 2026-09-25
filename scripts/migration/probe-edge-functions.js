/**
 * Are the payment Edge Functions actually deployed, and which Kapital host do
 * they point at?
 *
 * A reviewer who reaches checkout on a sandbox gateway is a rejection, and
 * "the function exists in the repo" is not evidence that it is deployed — this
 * project has already been caught once by a SQL file that was present, correct
 * and never applied.
 *
 * Reads keys from .env; prints status codes and never a key.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const env = {};
for (const file of [".env", path.join("backend", ".env")]) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const URL_ = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

if (!URL_ || !KEY) {
  console.error("FAILED: no Supabase URL/anon key in .env");
  process.exit(1);
}
console.log(`project: ${URL_.replace(/https:\/\/([^.]+).*/, "$1")}`);

/**
 * An undeployed function returns 404. A deployed one rejects the empty body
 * with its own 4xx — which is the signal we want: it ran.
 */
async function probe(name) {
  try {
    const r = await fetch(`${URL_}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        apikey: KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const text = (await r.text()).slice(0, 160);
    const verdict =
      r.status === 404 ? "NOT DEPLOYED" : "deployed (responded)";
    console.log(`  ${name.padEnd(20)} HTTP ${r.status}  ${verdict}`);
    if (text) console.log(`      body: ${text.replace(/\s+/g, " ")}`);
  } catch (e) {
    console.log(`  ${name.padEnd(20)} ERROR ${e.message}`);
  }
}

(async () => {
  console.log("\n=== edge functions ===");
  for (const fn of ["payments", "payments-callback"]) await probe(fn);

  // Which Kapital host is reachable at all — tells us whether production
  // credentials would even have somewhere to go.
  console.log("\n=== kapital hosts ===");
  for (const host of ["txpgtst.kapitalbank.az", "tpg.kapitalbank.az"]) {
    try {
      const r = await fetch(`https://${host}/api`, { method: "GET" });
      console.log(`  ${host.padEnd(26)} HTTP ${r.status}`);
    } catch (e) {
      console.log(`  ${host.padEnd(26)} ${e.message}`);
    }
  }
})();
