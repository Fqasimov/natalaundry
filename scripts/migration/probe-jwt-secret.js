/**
 * Is backend/.env's SUPABASE_JWT_SECRET the right one for this project?
 *
 * The anon key is itself a JWT signed with the project's JWT secret, so it can
 * be used as a test vector without a login: if the secret verifies the anon
 * key's signature, it belongs to this project. If not, it is another project's
 * secret — which after a region move is exactly the mistake to expect, and it
 * makes Laravel reject every user token with 401. The admin console reads a
 * 401 as "Sessiya bitdi".
 *
 * Entirely offline. No secret or key is printed.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const readEnv = (file) => {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
};

const root = path.join(__dirname, "..", "..");
const backend = readEnv(path.join(root, "backend", ".env"));
const app = readEnv(path.join(root, ".env"));

const secret = backend.SUPABASE_JWT_SECRET;
const anon = app.EXPO_PUBLIC_SUPABASE_ANON_KEY || backend.SUPABASE_ANON_KEY;

if (!secret) throw new Error("SUPABASE_JWT_SECRET is not set in backend/.env");
if (!anon) throw new Error("no anon key found");

console.log(`jwt secret : ${secret.length} chars`);
console.log(`anon key   : ${anon.length} chars`);

const parts = anon.split(".");
if (parts.length !== 3) {
  console.log("\nthe anon key is not a JWT — this project uses the new");
  console.log("publishable/secret key format, and the shared JWT secret no");
  console.log("longer signs user tokens. Laravel must verify via JWKS instead.");
  process.exitCode = 1;
} else {
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  console.log(`\nanon key header  : ${JSON.stringify(header)}`);
  console.log(`anon key ref     : ${payload.ref ?? "(none)"}`);
  console.log(`anon key role    : ${payload.role ?? "(none)"}`);

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");

  const matches = expected === parts[2];
  console.log(`\nsignature check  : ${matches ? "MATCHES" : "DOES NOT MATCH"}`);

  if (matches) {
    console.log("the JWT secret belongs to this project — token rejection is");
    console.log("something else (algorithm, issuer, audience or expiry).");
  } else {
    console.log("the JWT secret is NOT this project's. Laravel cannot verify");
    console.log("any token it issues, so every admin sign-in returns 401.");
  }

  const url = app.EXPO_PUBLIC_SUPABASE_URL ?? backend.SUPABASE_URL ?? "";
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  console.log(`\nproject in URL   : ${ref ?? "(unparsed)"}`);
  console.log(`project in key   : ${payload.ref ?? "(none)"}`);
  if (ref && payload.ref && ref !== payload.ref) {
    console.log("MISMATCH — the anon key belongs to a different project than the URL");
  }

  process.exitCode = matches ? 0 : 1;
}
