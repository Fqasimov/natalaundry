#!/usr/bin/env node
/*
 * Kapital Bank e-commerce — test-environment driver.
 *
 * Runs each operation the bank's API supports against the TEST gateway and
 * logs every request and response, so the acceptance report the bank asks for
 * before issuing production credentials is built from real calls rather than
 * written from memory.
 *
 *   node scripts/kapital/kapital-test.js create <amount> [label]
 *   node scripts/kapital/kapital-test.js status <orderId>
 *   node scripts/kapital/kapital-test.js refund <orderId> [amount]
 *   node scripts/kapital/kapital-test.js reverse <orderId> [amount]   (no amount = full)
 *   node scripts/kapital/kapital-test.js report                        (writes REPORT.md)
 *
 * The card itself is typed on Kapital's hosted page, in a real browser. That
 * step cannot run from a server: the page sits behind Cloudflare bot
 * protection, which blocks headless browsers, and it should — it is the page
 * that takes card numbers.
 *
 * Credentials. The defaults are the PUBLIC sandbox merchant printed in
 * Kapital's own documentation, and they are used only when the base URL is
 * the test host. This script refuses to run against production with them, and
 * production credentials never belong in this repository — they go in the
 * Edge Function secrets (KAPITAL_USERNAME / KAPITAL_PASSWORD).
 *
 * Spec: https://brawny-airport-7ca.notion.site/Kapital-bank-E-commerce-API-Documentation-6dd6a228c40644e3bef034bca7845e3c
 */

const fs = require("node:fs");
const path = require("node:path");

const TEST_BASE = "https://txpgtst.kapitalbank.az/api";
const BASE = (process.env.KAPITAL_BASE_URL || TEST_BASE).replace(/\/$/, "");
const IS_TEST = BASE === TEST_BASE;

const USER = process.env.KAPITAL_USERNAME || (IS_TEST ? "TerminalSys/kapital" : "");
const PASS = process.env.KAPITAL_PASSWORD || (IS_TEST ? "kapital123" : "");
if (!USER || !PASS) {
  console.error("KAPITAL_USERNAME / KAPITAL_PASSWORD are required outside the test gateway.");
  process.exit(2);
}

const LOG = path.join(__dirname, "test-runs.jsonl");
const REDIRECT = process.env.KAPITAL_CALLBACK_URL || "https://example.com/payments-callback";

const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

function record(entry) {
  fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), base: BASE, ...entry }) + "\n");
}

async function call(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
  return { http: res.status, json };
}

const money = (n) => Number(n).toFixed(2);

async function create(amount, label = "purchase") {
  const body = {
    order: {
      typeRid: "Order_SMS",
      amount: money(amount),
      currency: "AZN",
      language: "az",
      title: `NATA-TEST-${label}`,
      description: `Nata Laundry test — ${label}`,
      initiationEnvKind: "Browser",
      hppRedirectUrl: REDIRECT,
    },
  };
  const r = await call("POST", "/order", body);
  const o = r.json.order;
  // Exactly the URL supabase/functions/payments builds: hppUrl already ends
  // in /flex, so the id and password go straight on as a query string.
  const hpp = o ? `${o.hppUrl}?id=${o.id}&password=${o.password}` : null;
  record({ op: "create", label, amount: money(amount), request: body, http: r.http, response: r.json, hpp });
  console.log(JSON.stringify(r.json, null, 2));
  if (hpp) console.log(`\nPay it here, in a normal browser:\n${hpp}`);
}

async function status(id) {
  const r = await call("GET", `/order/${encodeURIComponent(id)}?tranDetailLevel=2&orderDetailLevel=2`);
  const o = r.json.order || {};
  const trans = (o.trans || []).map((t) => ({
    type: t.type, phase: t.phase, amount: t.amount, approvalCode: t.approvalCode,
    rrn: t.ridByPmo, result: t.pmoResultCode, reversal: t.isReversal,
  }));
  const summary = { id: o.id, status: o.status, prevStatus: o.prevStatus, amount: o.amount, currency: o.currency, card: o.srcToken?.displayName, trans };
  record({ op: "status", orderId: String(id), http: r.http, summary, error: r.json.errorCode ? r.json : undefined });
  console.log(JSON.stringify(r.json.errorCode ? r.json : summary, null, 2));
}

async function exec(id, tran, op) {
  const r = await call("POST", `/order/${encodeURIComponent(id)}/exec-tran`, { tran });
  record({ op, orderId: String(id), request: { tran }, http: r.http, response: r.json });
  console.log(JSON.stringify(r.json, null, 2));
}

const refund = (id, amount) =>
  exec(id, { phase: "Single", type: "Refund", ...(amount ? { amount: money(amount) } : {}) }, "refund");

const reverse = (id, amount) =>
  exec(id, amount
    ? { phase: "Single", amount: money(amount), voidKind: "Partial" }
    : { phase: "Single", voidKind: "Full" }, amount ? "reverse-partial" : "reverse-full");

function report() {
  const rows = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  const ok = (r) => r.http >= 200 && r.http < 300 && !(r.response && r.response.errorCode);
  const lines = [
    "# Kapital Bank e-commerce — test report",
    "",
    `Merchant: Nata Laundry · Gateway: \`${BASE}\` · Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    "Every row below is a real call to the test gateway, logged by `scripts/kapital/kapital-test.js`.",
    "",
    "| Time (UTC) | Operation | Order | Amount | HTTP | Result |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const id = r.orderId || r.response?.order?.id || "";
    let result;
    if (r.op === "status") result = r.summary ? `${r.summary.status}${r.summary.card ? ` · ${r.summary.card}` : ""}` : r.error?.errorCode;
    else if (r.op === "create") result = r.response?.order?.status || r.response?.errorCode;
    else result = ok(r) ? `approved ${r.response?.tran?.approvalCode ?? ""} (code ${r.response?.tran?.pmoResultCode ?? "?"})` : `${r.response?.errorCode}: ${r.response?.errorDescription ?? ""}`;
    lines.push(`| ${r.at.slice(0, 19).replace("T", " ")} | ${r.op} | ${id} | ${r.amount ?? r.request?.tran?.amount ?? ""} | ${r.http} | ${result ?? ""} |`);
  }
  const out = path.join(__dirname, "REPORT.md");
  fs.writeFileSync(out, lines.join("\n") + "\n");
  console.log(`${rows.length} calls → ${out}`);
}

const [cmd, a, b] = process.argv.slice(2);
const run = { create: () => create(a, b), status: () => status(a), refund: () => refund(a, b), reverse: () => reverse(a, b), report }[cmd];
if (!run || (cmd !== "report" && !a)) {
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 18).join("\n"));
  process.exit(1);
}
Promise.resolve(run()).catch((e) => { console.error(e); process.exit(1); });
