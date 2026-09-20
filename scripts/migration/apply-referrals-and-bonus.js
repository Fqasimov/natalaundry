/**
 * Applies supabase/referrals.sql and supabase/wallet-topup-bonus.sql, then
 * checks what actually landed.
 *
 * Both write to wallet_transactions, so both were read before running and the
 * columns they name were verified against the live schema first — this project
 * has already been bitten once by a migration referencing a column
 * (`wallet_transactions.description`) that does not exist.
 *
 * Each file runs in its own transaction: if one fails the other is unaffected,
 * and neither leaves half a trigger behind.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.join(__dirname, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, "backend", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({
  host: env.DB_HOST,
  port: 5432,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const FILES = ["supabase/referrals.sql", "supabase/wallet-topup-bonus.sql"];

(async () => {
  await client.connect();

  for (const rel of FILES) {
    const sql = fs.readFileSync(path.join(root, rel), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(`  ok   ${rel}`);
    } catch (e) {
      await client.query("rollback");
      console.log(` FAIL  ${rel}\n       ${e.message.split("\n")[0]}`);
      process.exitCode = 1;
    }
  }

  console.log("\n--- verification ---");

  const { rows: tbl } = await client.query(
    `select relname, relrowsecurity
       from pg_class
      where relname = 'referrals' and relnamespace = 'public'::regnamespace`
  );
  console.log(
    tbl.length
      ? `  table referrals exists, RLS=${tbl[0].relrowsecurity}`
      : "  table referrals MISSING"
  );

  const { rows: fns } = await client.query(
    `select proname from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname in ('referral_code_for','redeem_referral_for',
                        'complete_referral_on_paid_order',
                        'claim_referral_on_new_profile','credit_topup_bonus')
      order by proname`
  );
  console.log(`  functions: ${fns.map((f) => f.proname).join(", ") || "(none)"}`);

  const { rows: trg } = await client.query(
    `select tgname, tgrelid::regclass as tbl
       from pg_trigger
      where not tgisinternal
        and tgname in ('trg_complete_referral','trg_claim_referral','trg_credit_topup_bonus')
      order by tgname`
  );
  console.log(`  triggers:  ${trg.map((t) => `${t.tgname} on ${t.tbl}`).join("; ") || "(none)"}`);

  // Nothing should have been credited by simply installing these.
  const { rows: money } = await client.query(
    `select kind, count(*) as n, coalesce(sum(amount),0)::float8 as total
       from public.wallet_transactions
      where kind in ('referral','bonus')
      group by kind`
  );
  console.log(
    `  existing referral/bonus ledger rows: ${
      money.length ? money.map((m) => `${m.kind}=${m.n} (₼${m.total})`).join(", ") : "none"
    }`
  );
})()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
