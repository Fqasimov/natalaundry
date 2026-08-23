<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nata Laundry — Admin</title>
{{--
  The admin console.

  Deliberately one server-rendered page with vanilla JS and no build step: it
  is an internal dispatch board used by a handful of staff, and a framework +
  bundler would add a toolchain to maintain for no benefit anyone here would
  feel. It talks to the same /api endpoints the apps use.

  Auth reuses Supabase directly — staff sign in with the same credentials as
  everywhere else and the page holds only the resulting access token, so there
  is no second user store and no new password to manage. The token lives in
  sessionStorage, not localStorage: it should die with the tab.
--}}
<style>
  :root {
    --blue:#1E77E5; --blue-dark:#1560C4; --ink:#14181F; --muted:#7A828E;
    --bg:#FDFCEF; --surface:#fff; --border:#EAE8DA; --amber:#F2B71E;
    --green:#17A957; --red:#E5342B; --radius:14px;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.5 "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  header {
    background:linear-gradient(120deg,#3184EC,#1A6AD4); color:#fff;
    padding:18px 24px; display:flex; align-items:center; justify-content:space-between;
  }
  header h1 { margin:0; font-size:19px; letter-spacing:-.3px; }
  main { max-width:1100px; margin:0 auto; padding:24px; }
  .card {
    background:var(--surface); border:1px solid var(--border);
    border-radius:var(--radius); padding:18px; margin-bottom:14px;
  }
  .row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .grow { flex:1; min-width:0; }
  .muted { color:var(--muted); font-size:13px; }
  .state {
    display:inline-block; background:#E8F1FD; color:var(--blue);
    border-radius:999px; padding:4px 11px; font-size:12px; font-weight:700;
  }
  button {
    font:inherit; font-weight:600; border:0; border-radius:999px;
    padding:10px 16px; cursor:pointer; background:var(--blue); color:#fff;
  }
  button.ghost { background:transparent; color:var(--blue); border:1px solid var(--blue); }
  button:disabled { opacity:.45; cursor:not-allowed; }
  input, select {
    font:inherit; padding:11px 13px; border:1px solid var(--border);
    border-radius:10px; background:#fff; width:100%;
  }
  label { display:block; font-size:13px; color:var(--muted); margin-bottom:5px; }
  .field { margin-bottom:12px; }
  .login { max-width:380px; margin:60px auto; }
  .notice { border-radius:10px; padding:11px 13px; font-size:13px; margin-bottom:12px; }
  .notice.err { background:#FDECEA; color:var(--red); }
  .notice.ok  { background:#E4F6EC; color:var(--green); }
  dialog {
    border:0; border-radius:var(--radius); padding:20px; max-width:420px; width:92%;
  }
  dialog::backdrop { background:rgba(15,20,28,.55); }
  .courier-list { max-height:260px; overflow:auto; margin:10px 0; }
  .courier-list label {
    display:flex; align-items:center; gap:9px; padding:9px 4px;
    color:var(--ink); font-size:14px; margin:0; border-bottom:1px solid var(--border);
  }
  .courier-list input { width:auto; }
  .hidden { display:none; }
</style>
</head>
<body>

<div id="login" class="login card">
  <h2 style="margin:0 0 4px">Nata Laundry</h2>
  <p class="muted" style="margin:0 0 18px">Admin paneli</p>
  <div id="login-error" class="notice err hidden"></div>
  <div class="field">
    <label for="email">E-poçt</label>
    <input id="email" type="email" autocomplete="username">
  </div>
  <div class="field">
    <label for="password">Şifrə</label>
    <input id="password" type="password" autocomplete="current-password">
  </div>
  <button id="login-btn" style="width:100%">Daxil ol</button>
</div>

<div id="app" class="hidden">
  <header>
    <h1>Sifariş idarəetməsi</h1>
    <div class="row">
      <span id="feed-status" class="muted" style="color:rgba(255,255,255,.85)"></span>
      <button class="ghost" id="signout" style="color:#fff;border-color:rgba(255,255,255,.6)">Çıxış</button>
    </div>
  </header>
  <main>
    <div id="app-notice" class="notice hidden"></div>
    <div id="orders"></div>
  </main>
</div>

<dialog id="assign">
  <h3 style="margin:0 0 6px">Kuryerə göndər</h3>
  <p class="muted" id="assign-order" style="margin:0"></p>
  <div class="courier-list" id="courier-list"></div>
  <div class="row" style="justify-content:flex-end">
    <button class="ghost" id="assign-cancel">İmtina</button>
    <button id="assign-all">Hamısına göndər</button>
    <button id="assign-selected">Seçilmişlərə göndər</button>
  </div>
</dialog>

<script>
const API = @json(rtrim(config('app.url'), '/').'/api');
const SUPABASE_URL = @json(config('services.supabase.url'));
const SUPABASE_ANON = @json(config('services.supabase.anon_key'));

// Token lives in sessionStorage so it dies with the tab; an admin session
// should not outlive the browser window on a shared desk machine.
const store = {
  get token() { return sessionStorage.getItem('nata.admin.token'); },
  set token(v) { v ? sessionStorage.setItem('nata.admin.token', v)
                   : sessionStorage.removeItem('nata.admin.token'); },
};

const $ = (id) => document.getElementById(id);
const STATE_LABEL = {
  order_placed: 'Sifariş qəbul edildi',
  assigning_couriers: 'Kuryer axtarılır',
  courier_assigned: 'Kuryer təyin edildi',
  courier_en_route_pickup: 'Kuryer götürməyə gedir',
  picked_up: 'Götürüldü',
  at_laundry: 'Yuyucu mərkəzdə',
  processing_finished: 'Təmizlənib, hazırdır',
  courier_en_route_delivery: 'Çatdırılmağa gedir',
  delivered: 'Çatdırıldı',
  cancelled: 'Ləğv edildi',
};

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + store.token,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { signOut(); throw new Error('Sessiya bitdi'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || ('HTTP ' + res.status));
  return body;
}

function notice(message, kind = 'err') {
  const el = $('app-notice');
  el.textContent = message;
  el.className = 'notice ' + kind;
  if (!message) el.classList.add('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

// ── Auth ────────────────────────────────────────────────────────────────────
$('login-btn').addEventListener('click', async () => {
  const err = $('login-error');
  err.classList.add('hidden');
  try {
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
      body: JSON.stringify({ email: $('email').value, password: $('password').value }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error_description || body.msg || 'Giriş alınmadı');
    store.token = body.access_token;
    // The role check lives on the server: a non-admin gets 403 from the feed
    // and is signed out, so nothing here has to trust the client.
    await start();
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
  }
});

$('signout').addEventListener('click', () => signOut());

function signOut() {
  store.token = null;
  clearInterval(pollTimer);
  $('app').classList.add('hidden');
  $('login').classList.remove('hidden');
}

// ── Order feed ──────────────────────────────────────────────────────────────
let pollTimer = null;
let couriers = [];

function orderCard(order) {
  // Built with textContent, never innerHTML. Customer and courier names and
  // the address are attacker-controlled — a customer picks their own profile
  // name — so interpolating them into markup is stored XSS straight into the
  // admin's session, and the admin token is reachable from JS on this origin.
  const el = document.createElement('div');
  el.className = 'card';

  const top = div('row');
  const info = div('grow');

  const titleRow = div('row');
  titleRow.append(el2('strong', `Sifariş #${order.order_no ?? '—'}`));
  titleRow.append(el2('span', STATE_LABEL[order.lifecycle_state] ?? order.lifecycle_state, 'state'));
  info.append(titleRow);

  const customer = [order.customer?.name ?? '—', order.customer?.phone ?? ''].filter(Boolean).join(' · ');
  info.append(el2('div', customer, 'muted'));
  info.append(el2('div', order.address ?? '—', 'muted'));
  info.append(el2('div', [order.collection_time ?? '', order.created_at ? new Date(order.created_at).toLocaleString() : ''].filter(Boolean).join(' · '), 'muted'));
  if (order.courier) info.append(el2('div', `Kuryer: ${order.courier.name ?? ''}`, 'muted'));

  const money = div();
  money.style.textAlign = 'right';
  const total = el2('div', '₼' + Number(order.total).toFixed(2));
  total.style.cssText = 'font-weight:700;font-size:17px';
  money.append(total);

  top.append(info, money);
  el.append(top);

  const actions = div('row');
  actions.style.marginTop = '12px';
  // Only actions the state machine would accept are rendered, so a click can
  // never come back as a 422.
  if (order.can.broadcast) actions.append(button('Kuryerlərə göndər', () => openAssign(order)));
  if (order.can.at_laundry) actions.append(button('Yuyucu mərkəzə çatdı', () => transition(order, 'at_laundry')));
  if (order.can.processing_finished) actions.append(button('Təmizləndi, hazırdır', () => transition(order, 'processing_finished')));
  el.append(actions);

  return el;
}

function div(className) {
  const d = document.createElement('div');
  if (className) d.className = className;
  return d;
}

function el2(tag, text, className) {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}

function button(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await onClick(); } finally { b.disabled = false; }
  });
  return b;
}

async function transition(order, to) {
  try {
    await api(`/orders/${order.id}/lifecycle/transition`, {
      method: 'POST',
      body: JSON.stringify({ to }),
    });
    notice('Yeniləndi', 'ok');
    await loadOrders();
  } catch (e) { notice(e.message); }
}

async function openAssign(order) {
  $('assign-order').textContent = `Sifariş #${order.order_no ?? '—'}`;
  const list = $('courier-list');
  list.replaceChildren();
  couriers.forEach((c) => {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = c.id;
    const phone = el2('span', c.phone ?? '', 'muted');
    phone.style.marginLeft = 'auto';
    row.append(box, el2('span', c.name ?? ''), phone);
    list.append(row);
  });
  const dialog = $('assign');
  dialog.dataset.orderId = order.id;
  dialog.showModal();
}

$('assign-cancel').addEventListener('click', () => $('assign').close());

$('assign-all').addEventListener('click', () => broadcast(null));
$('assign-selected').addEventListener('click', () => {
  const ids = [...document.querySelectorAll('#courier-list input:checked')].map((i) => i.value);
  if (ids.length === 0) { notice('Ən azı bir kuryer seçin'); return; }
  broadcast(ids);
});

async function broadcast(courierIds) {
  const dialog = $('assign');
  const orderId = dialog.dataset.orderId;
  try {
    await api(`/orders/${orderId}/broadcast`, {
      method: 'POST',
      // Omitting courier_ids broadcasts to everyone; the server treats null
      // and "all couriers" as the same thing.
      body: JSON.stringify(courierIds ? { courier_ids: courierIds } : {}),
    });
    dialog.close();
    notice('Kuryerlərə göndərildi', 'ok');
    await loadOrders();
  } catch (e) { notice(e.message); }
}

async function loadOrders() {
  const { data } = await api('/admin/orders');
  const wrap = $('orders');
  wrap.replaceChildren();
  if (data.length === 0) {
    wrap.append(el2('div', 'Aktiv sifariş yoxdur', 'card muted'));
  } else {
    data.forEach((order) => wrap.append(orderCard(order)));
  }
  $('feed-status').textContent = 'Yeniləndi ' + new Date().toLocaleTimeString();
}

async function start() {
  try {
    // The feed is the role check: a non-admin token gets 403 here and never
    // reaches the board.
    const [{ data: courierData }] = await Promise.all([api('/admin/couriers')]);
    couriers = courierData;
    await loadOrders();
  } catch (e) {
    signOut();
    $('login-error').textContent = e.message;
    $('login-error').classList.remove('hidden');
    return;
  }

  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');

  clearInterval(pollTimer);
  // Polled rather than pushed: a dispatch board with a handful of staff does
  // not justify a websocket server, and ten seconds is well inside the time
  // it takes anyone to act on a new order.
  pollTimer = setInterval(() => loadOrders().catch(() => {}), 10000);
}

if (store.token) start();
</script>
</body>
</html>
