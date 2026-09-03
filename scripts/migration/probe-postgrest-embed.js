/**
 * Asks PostgREST for the exact embedded select the gift box uses.
 *
 * Anonymous, so RLS returns no rows — but a missing relationship fails before
 * RLS with PGRST200, which is the failure being fixed. An empty array is the
 * pass condition; the point is that it parses the embed at all.
 *
 * Reads the anon key from .env and never prints it.
 */
const fs = require("fs");
const path = require("path");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error("missing EXPO_PUBLIC_SUPABASE_URL / ANON_KEY in .env");

const SELECT = "id,won_at,expires_at,used_at,rewards(id,kind,title,description,value)";

(async () => {
  const target = `${url}/rest/v1/user_rewards?select=${encodeURIComponent(SELECT)}`;
  const res = await fetch(target, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const body = await res.text();

  console.log(`HTTP ${res.status}`);
  console.log(body.slice(0, 300));

  if (res.ok) {
    console.log("\nthe embed resolves — PostgREST found the user_rewards -> rewards relationship");
  } else if (body.includes("PGRST200")) {
    console.log("\nSTILL PGRST200 — the relationship is not visible to PostgREST yet.");
    console.log("Its schema cache may need a moment, or another reload.");
    process.exitCode = 1;
  } else {
    console.log("\nfailed for another reason — see the body above");
    process.exitCode = 1;
  }
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
