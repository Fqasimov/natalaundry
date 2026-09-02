<?php
/**
 * Does settle_bank_order move money correctly, and only once?
 *
 * This is the function the payment callback calls after asking Kapital what
 * really happened. It is where money is decided, and the failure that matters
 * is not "it did nothing" but "it did it twice": a browser reload, a retried
 * redirect and the bank calling again all hit the same URL with the same
 * reference, and a customer topping up ₼20 must not end up with ₼40.
 *
 * Three references to recognise, because the app has three ways to pay:
 *   payments        paying for an order
 *   wallet_topups   topping up Nata Balance
 *   payment_intents the 1.0.2 path, still live for anyone who has not updated
 *
 * No bank is involved: the reference is looked up in our own tables, so this
 * exercises the whole decision without a network call.
 *
 * Everything runs in one transaction that is always rolled back.
 */

$root = dirname(__DIR__, 2);
$env = [];
foreach (file($root . '/backend/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $env[trim($k)] = trim(trim($v), "\"'");
}

$pdo = new PDO(
    sprintf('pgsql:host=%s;port=5432;dbname=%s;sslmode=require;connect_timeout=10',
        $env['DB_HOST'], $env['DB_DATABASE']),
    $env['DB_USERNAME'], $env['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$pass = 0; $fail = 0;
$check = static function (string $what, bool $ok, string $d = '') use (&$pass, &$fail) {
    printf("  %-52s %s%s\n", $what, $ok ? 'pass' : 'FAIL', $d ? "  ($d)" : '');
    $ok ? $pass++ : $fail++;
};

$settle = static function (PDO $pdo, string $ref, bool $paid): array {
    $s = $pdo->prepare('select public.settle_bank_order(?, ?) as r');
    $s->execute([$ref, $paid ? 'true' : 'false']);
    return json_decode((string) $s->fetchColumn(), true) ?: [];
};

$balance = static fn (PDO $pdo, string $uid): float => (float) $pdo->query(
    "select coalesce(sum(amount), 0) from public.wallet_transactions where user_id = '$uid'"
)->fetchColumn();

$customer = $pdo->query("select id from public.profiles where role='user' limit 1")->fetchColumn();
$item = $pdo->query("select item_id, service_id, name, price from public.service_prices
                     where active = true and price between 5 and 20 limit 1")->fetch();

$pdo->beginTransaction();

try {
    // ---- unknown reference ----------------------------------------------
    echo "An unknown reference\n", str_repeat('-', 68), "\n";
    $r = $settle($pdo, 'NOT-A-REAL-REFERENCE-' . bin2hex(random_bytes(4)), true);
    $check('changes nothing and says so', ($r['applied'] ?? true) === false,
        $r['reason'] ?? '');

    // ---- paying for an order --------------------------------------------
    echo "\nPaying for an order\n", str_repeat('-', 68), "\n";

    $s = $pdo->prepare('insert into public.orders
        (user_id, subtotal, total, collection_time, delivery_time)
        values (?, 0, 0, ?, ?) returning id');
    $s->execute([$customer, '09:00', '18:00']);
    $orderId = $s->fetchColumn();
    $s = $pdo->prepare('insert into public.order_items
        (order_id, service_id, item_id, item_name, quantity, price) values (?, ?, ?, ?, 1, 0)');
    $s->execute([$orderId, $item['service_id'], $item['item_id'], $item['name']]);

    $orderRef = 'BANK-ORDER-' . bin2hex(random_bytes(4));
    $total = (float) $pdo->query("select total from public.orders where id='$orderId'")->fetchColumn();
    $s = $pdo->prepare('insert into public.payments
        (order_id, amount, status, payment_method, transaction_ref)
        values (?, ?, ?, ?, ?)');
    $s->execute([$orderId, $total, 'pending', 'card', $orderRef]);

    $r = $settle($pdo, $orderRef, true);
    $check('recognised as an order payment', ($r['kind'] ?? '') === 'order');

    $after = $pdo->query("select payment_status, payment_method from public.orders where id='$orderId'")->fetch();
    $check('order marked paid', $after['payment_status'] === 'paid', $after['payment_status']);
    $check("payment_method recorded as card", $after['payment_method'] === 'card');
    $check('the payment row is paid too',
        $pdo->query("select status from public.payments where transaction_ref='$orderRef'")->fetchColumn() === 'paid');

    $r = $settle($pdo, $orderRef, true);
    $check('a repeated callback does nothing', ($r['applied'] ?? true) === false,
        $r['reason'] ?? '');

    // ---- a declined card -------------------------------------------------
    echo "\nA declined card\n", str_repeat('-', 68), "\n";

    $s = $pdo->prepare('insert into public.orders
        (user_id, subtotal, total, collection_time, delivery_time)
        values (?, 0, 0, ?, ?) returning id');
    $s->execute([$customer, '09:00', '18:00']);
    $failId = $s->fetchColumn();
    $failRef = 'BANK-FAIL-' . bin2hex(random_bytes(4));
    $s = $pdo->prepare('insert into public.payments
        (order_id, amount, status, payment_method, transaction_ref) values (?, 10, ?, ?, ?)');
    $s->execute([$failId, 'pending', 'card', $failRef]);

    $settle($pdo, $failRef, false);
    $check('order is NOT marked paid',
        $pdo->query("select payment_status from public.orders where id='$failId'")->fetchColumn() !== 'paid');
    $check('the payment row records the failure',
        $pdo->query("select status from public.payments where transaction_ref='$failRef'")->fetchColumn() === 'failed');

    // ---- topping up ------------------------------------------------------
    echo "\nTopping up Nata Balance\n", str_repeat('-', 68), "\n";

    $before = $balance($pdo, $customer);
    $topRef = 'BANK-TOPUP-' . bin2hex(random_bytes(4));
    $s = $pdo->prepare('insert into public.wallet_topups
        (id, user_id, amount, status, payment_method, transaction_ref)
        values (gen_random_uuid(), ?, 20, ?, ?, ?)');
    $s->execute([$customer, 'pending', 'card', $topRef]);

    $r = $settle($pdo, $topRef, true);
    $check('recognised as a top-up', ($r['kind'] ?? '') === 'topup');
    $check('balance rose by exactly the amount',
        abs(($balance($pdo, $customer) - $before) - 20.0) < 0.001,
        'delta ' . ($balance($pdo, $customer) - $before));

    $afterOnce = $balance($pdo, $customer);
    $r = $settle($pdo, $topRef, true);
    $check('a repeated callback does not credit twice',
        abs($balance($pdo, $customer) - $afterOnce) < 0.001 && ($r['applied'] ?? true) === false,
        'balance ' . $balance($pdo, $customer));

    $check('settled_at is stamped',
        $pdo->query("select settled_at from public.wallet_topups where transaction_ref='$topRef'")->fetchColumn() !== null);

    // ---- a failed top-up -------------------------------------------------
    $before2 = $balance($pdo, $customer);
    $failTop = 'BANK-TOPUP-FAIL-' . bin2hex(random_bytes(4));
    $s = $pdo->prepare('insert into public.wallet_topups
        (id, user_id, amount, status, payment_method, transaction_ref)
        values (gen_random_uuid(), ?, 50, ?, ?, ?)');
    $s->execute([$customer, 'pending', 'card', $failTop]);

    $settle($pdo, $failTop, false);
    $check('a failed top-up credits nothing',
        abs($balance($pdo, $customer) - $before2) < 0.001);

    // ---- the 1.0.2 path --------------------------------------------------
    echo "\nThe shipped 1.0.2 path (payment_intents)\n", str_repeat('-', 68), "\n";

    $before3 = $balance($pdo, $customer);
    $intentRef = 'INTENT-' . bin2hex(random_bytes(4));
    $s = $pdo->prepare('insert into public.payment_intents
        (id, user_id, purpose, amount, status, transaction_ref, created_at)
        values (gen_random_uuid(), ?, ?, 15, ?, ?, now())');
    $s->execute([$customer, 'topup', 'pending', $intentRef]);

    $r = $settle($pdo, $intentRef, true);
    $check('delegated to settle_payment_intent', ($r['applied'] ?? false) === true,
        'result ' . ($r['result'] ?? '?'));
    $check('old-build top-up still credits',
        abs(($balance($pdo, $customer) - $before3) - 15.0) < 0.001);

    $r = $settle($pdo, $intentRef, true);
    $check('and is idempotent too', ($r['applied'] ?? true) === false);

    // ---- who may call it -------------------------------------------------
    echo "\nWho may call it\n", str_repeat('-', 68), "\n";
    foreach (['anon', 'authenticated'] as $role) {
        $can = $pdo->query("select has_function_privilege('$role',
            'public.settle_bank_order(text, boolean)', 'EXECUTE')")->fetchColumn();
        $check("$role cannot call it", !$can);
    }
    $svc = $pdo->query("select has_function_privilege('service_role',
        'public.settle_bank_order(text, boolean)', 'EXECUTE')")->fetchColumn();
    $check('service_role can', (bool) $svc);
} catch (Throwable $e) {
    echo "\n  ABORTED: " . str_replace($env['DB_PASSWORD'], '***', $e->getMessage()) . "\n";
    $fail++;
} finally {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}

echo "\n", str_repeat('-', 68), "\n";
printf("%d passed, %d failed. Rolled back — orders still %d rows, balance untouched.\n",
    $pass, $fail, (int) $pdo->query('select count(*) from public.orders')->fetchColumn());
exit($fail === 0 ? 0 : 1);
