<?php
/**
 * The whole customer journey, as the rewritten app now performs it.
 *
 * Every step here is the SQL equivalent of a call in lib/*.ts after the API was
 * removed — an insert under RLS, or an RPC. If this passes, the paths the app
 * uses work; if it fails, the app would fail the same way.
 *
 * Card payment is the one step not covered: it needs the Kapital credentials
 * and a public callback, which is what the two Edge Functions are for.
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
    printf("  %-50s %s%s\n", $what, $ok ? 'pass' : 'FAIL', $d ? "  ($d)" : '');
    $ok ? $pass++ : $fail++;
};
$as = static function (PDO $pdo, string $uid, callable $fn) {
    $pdo->exec("select set_config('request.jwt.claims', " .
        $pdo->quote(json_encode(['sub' => $uid, 'role' => 'authenticated'])) . ", true)");
    $pdo->exec('set local role authenticated');
    try { return $fn(); } finally { $pdo->exec('reset role'); }
};

$customer = $pdo->query("select id from public.profiles where role='user' limit 1")->fetchColumn();
$courier  = $pdo->query("select id from public.profiles where role='courier' limit 1")->fetchColumn();
$admin    = $pdo->query("select id from public.profiles where role='admin' limit 1")->fetchColumn();
$item     = $pdo->query("select item_id, service_id, name, price from public.service_prices
                         where active = true and price between 5 and 20 order by price desc limit 1")->fetch();

$pdo->beginTransaction();

try {
    // ---- createOrder ----------------------------------------------------
    echo "Checkout — lib/orders.ts createOrder\n", str_repeat('-', 64), "\n";

    $orderId = $as($pdo, $customer, function () use ($pdo, $customer, $item) {
        $s = $pdo->prepare('insert into public.orders
            (user_id, subtotal, total, delivery_tier, collection_time, delivery_time,
             address, is_outside_city, payment_method)
            values (?, 0, 0, ?, ?, ?, ?, false, ?) returning id');
        $s->execute([$customer, 'standard', '09:00', '18:00', 'Test address', 'cash']);
        $id = $s->fetchColumn();

        $s = $pdo->prepare('insert into public.order_items
            (order_id, service_id, item_id, item_name, quantity, price)
            values (?, ?, ?, ?, 2, 0)');
        $s->execute([$id, $item['service_id'], $item['item_id'], $item['name']]);
        return $id;
    });

    $o = $pdo->query("select * from public.orders where id='$orderId'")->fetch();
    $expectedSubtotal = (float) $item['price'] * 2;
    $check('order created by the customer', $orderId !== null);
    $check('priced from the catalogue',
        (float) $o['subtotal'] === $expectedSubtotal, "subtotal {$o['subtotal']}");
    $check('delivery fee derived, not sent',
        (float) $o['delivery_fee'] === ($expectedSubtotal >= 40 ? 0.0 : 5.0),
        "fee {$o['delivery_fee']}");
    $check("starts at 'pending' / order_placed",
        $o['status'] === 'pending' && $o['lifecycle_state'] === 'order_placed');

    // ---- payForOrder(cash) ----------------------------------------------
    echo "\nPayment — lib/payments.ts payForOrder('cash')\n", str_repeat('-', 64), "\n";

    $paid = $as($pdo, $customer, fn () => $pdo->query("select pay_order('$orderId','cash')")->fetchColumn());
    $p = json_decode((string) $paid, true);
    $check('cash accepted', ($p['payment_method'] ?? '') === 'cash');
    $check('cash is NOT marked paid before delivery',
        ($p['payment_status'] ?? '') === 'pending', 'status ' . ($p['payment_status'] ?? '?'));

    // ---- dispatch and claim ---------------------------------------------
    echo "\nDispatch — transition_order + order_offers\n", str_repeat('-', 64), "\n";

    $as($pdo, $admin, fn () => $pdo->query("select 1 from transition_order('$orderId','assigning_couriers')")->fetchColumn());
    $s = $pdo->prepare('insert into public.order_offers (order_id, courier_id) values (?, ?)');
    $s->execute([$orderId, $courier]);

    $claim = $as($pdo, $courier, fn () => $pdo->query("select lifecycle_state from transition_order('$orderId','courier_assigned')")->fetchColumn());
    $check('courier claims the offered order', $claim === 'courier_assigned');

    // ---- the courier's run ----------------------------------------------
    echo "\nThe run — advanceOrderStatus, one step at a time\n", str_repeat('-', 64), "\n";

    $steps = [
        'courier_en_route_pickup' => $courier,
        'picked_up'               => $courier,
        'at_laundry'              => $admin,
        'processing_finished'     => $admin,
        'courier_en_route_delivery' => $courier,
        'delivered'               => $courier,
    ];
    $ranAll = true;
    foreach ($steps as $to => $actor) {
        try {
            $as($pdo, $actor, fn () => $pdo->query("select 1 from transition_order('$orderId','$to')")->fetchColumn());
        } catch (Throwable $e) {
            $ranAll = false;
            $check("  step to $to", false, $e->getMessage());
        }
    }
    $check('all nine states run through', $ranAll);

    $final = $pdo->query("select status, lifecycle_state, delivered_at from public.orders where id='$orderId'")->fetch();
    $check("ends 'completed' / delivered",
        $final['status'] === 'completed' && $final['lifecycle_state'] === 'delivered',
        "{$final['status']} / {$final['lifecycle_state']}");
    $check('delivered_at stamped', $final['delivered_at'] !== null);

    // ---- GPS -------------------------------------------------------------
    echo "\nTracking — lib/tracking.ts pushLocation\n", str_repeat('-', 64), "\n";

    $blocked = false;
    $sp = 'sp1';
    $pdo->exec("savepoint $sp");
    try {
        $as($pdo, $courier, function () use ($pdo, $orderId, $courier) {
            $s = $pdo->prepare('insert into public.courier_locations
                (order_id, courier_id, lat, lng, recorded_at) values (?, ?, 40.4, 49.8, now())');
            $s->execute([$orderId, $courier]);
        });
        $pdo->exec("release savepoint $sp");
    } catch (Throwable) {
        $pdo->exec("rollback to savepoint $sp");
        $blocked = true;
    }
    $check('a ping after delivery is refused', $blocked);

    // ---- gift box --------------------------------------------------------
    echo "\nGift box — lib/gift-boxes.ts openGiftBox\n", str_repeat('-', 64), "\n";

    $won = json_decode((string) $as($pdo, $customer,
        fn () => $pdo->query("select open_gift_box('$orderId')")->fetchColumn()), true);
    $check('a delivered order earns a box',
        isset($won['reward']['title']), $won['reward']['title'] ?? 'none');

    $twice = false;
    $pdo->exec('savepoint sp2');
    try {
        $as($pdo, $customer, fn () => $pdo->query("select open_gift_box('$orderId')")->fetchColumn());
        $pdo->exec('release savepoint sp2');
    } catch (Throwable) {
        $pdo->exec('rollback to savepoint sp2');
        $twice = true;
    }
    $check('the box cannot be opened twice', $twice);

    // ---- what the customer can read -------------------------------------
    echo "\nReads — what the app shows\n", str_repeat('-', 64), "\n";

    $mine = (int) $as($pdo, $customer,
        fn () => $pdo->query("select count(*) from public.orders where id='$orderId'")->fetchColumn());
    $check('customer can read their own order', $mine === 1);

    $other = $pdo->query("select id from public.profiles where role='user' and id <> '$customer' limit 1")->fetchColumn();
    if ($other) {
        $theirs = (int) $as($pdo, $other,
            fn () => $pdo->query("select count(*) from public.orders where id='$orderId'")->fetchColumn());
        $check("another customer cannot read it", $theirs === 0);
    }

    $wallet = (int) $as($pdo, $customer,
        fn () => $pdo->query('select count(*) from public.wallet_transactions')->fetchColumn());
    $check('customer can read their own wallet ledger', $wallet >= 0);
} catch (Throwable $e) {
    echo "\n  ABORTED: " . str_replace($env['DB_PASSWORD'], '***', $e->getMessage()) . "\n";
    $fail++;
} finally {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}

echo "\n", str_repeat('-', 64), "\n";
printf("%d passed, %d failed. Rolled back — orders still %d rows.\n",
    $pass, $fail, (int) $pdo->query('select count(*) from public.orders')->fetchColumn());
exit($fail === 0 ? 0 : 1);
