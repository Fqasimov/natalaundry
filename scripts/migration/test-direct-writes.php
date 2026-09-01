<?php
/**
 * Does supabase/direct-writes.sql work, and does it refuse what it should?
 *
 * Applies the whole file, runs the scenarios that matter, and rolls everything
 * back — policies, functions and rows alike. Production is untouched, so this
 * is safe to run at any time, including before the file has ever been applied
 * for real.
 *
 *   php scripts/migration/test-direct-writes.php
 */

$root = dirname(__DIR__, 2);
$env = [];
foreach (file($root . '/backend/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
        continue;
    }
    [$k, $v] = explode('=', $line, 2);
    $env[trim($k)] = trim(trim($v), "\"'");
}

$pdo = new PDO(
    sprintf('pgsql:host=%s;port=5432;dbname=%s;sslmode=require;connect_timeout=10',
        $env['DB_HOST'], $env['DB_DATABASE']),
    $env['DB_USERNAME'], $env['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$sql = file_get_contents($root . '/supabase/direct-writes.sql');
// The file manages its own transaction; this harness needs to own it instead.
$sql = preg_replace('/^\s*(begin|commit)\s*;\s*$/mi', '', $sql);
if ($sql === null) {
    fwrite(STDERR, "could not prepare the SQL\n");
    exit(1);
}

$customer = $pdo->query("select id from public.profiles where role = 'user' limit 1")->fetchColumn();
$courier  = $pdo->query("select id from public.profiles where role = 'courier' limit 1")->fetchColumn();
$admin    = $pdo->query("select id from public.profiles where role = 'admin' limit 1")->fetchColumn();
$other    = $pdo->query("select id from public.profiles where role = 'user' offset 1 limit 1")->fetchColumn();
$item     = $pdo->query('select item_id, service_id, name, price from public.service_prices
                         where active = true order by price desc limit 1')->fetch();

foreach (['customer' => $customer, 'courier' => $courier, 'admin' => $admin] as $k => $v) {
    if (!$v) {
        fwrite(STDERR, "no $k profile to act as\n");
        exit(1);
    }
}

$pass = 0;
$fail = 0;

/** Run something as a given Supabase user, the way PostgREST would. */
$as = static function (PDO $pdo, string $uid, callable $fn) {
    $pdo->exec("select set_config('request.jwt.claims', " .
        $pdo->quote(json_encode(['sub' => $uid, 'role' => 'authenticated'])) . ", true)");
    $pdo->exec('set local role authenticated');
    try {
        return $fn();
    } finally {
        $pdo->exec('reset role');
    }
};

$check = static function (string $what, bool $ok, string $detail = '') use (&$pass, &$fail) {
    printf("  %-52s %s%s\n", $what, $ok ? 'pass' : 'FAIL', $detail ? "  ($detail)" : '');
    $ok ? $pass++ : $fail++;
};

/**
 * Run something that SHOULD be refused, without poisoning the transaction.
 *
 * Any error in Postgres aborts the whole transaction — every later statement
 * comes back "current transaction is aborted" — so a suite that deliberately
 * provokes errors has to fence each one behind a savepoint.
 */
$refuses = static function (PDO $pdo, callable $fn): bool {
    $sp = 'sp_' . bin2hex(random_bytes(4));
    $pdo->exec("savepoint $sp");
    try {
        $fn();
        $pdo->exec("release savepoint $sp");
        return false;              // it succeeded — which is the failure here
    } catch (Throwable) {
        $pdo->exec("rollback to savepoint $sp");
        return true;
    }
};

$rpc = static fn (PDO $pdo, string $call) => $pdo->query("select * from $call")->fetch();

$pdo->beginTransaction();

try {
    $pdo->exec($sql);
    echo "Applied supabase/direct-writes.sql\n\n";

    // -- A customer creates an order, naming absurd values ------------------
    echo "Order creation, straight from the app\n";
    echo str_repeat('-', 68), "\n";

    $orderId = $as($pdo, $customer, function () use ($pdo, $customer, $item) {
        $s = $pdo->prepare(
            'insert into public.orders
                (user_id, subtotal, total, collection_time, delivery_time, status)
             values (?, 0.01, 0.01, ?, ?, ?) returning id'
        );
        $s->execute([$customer, '09:00', '18:00', 'completed']);
        $id = $s->fetchColumn();

        $s = $pdo->prepare(
            'insert into public.order_items
                (order_id, service_id, item_id, item_name, quantity, price)
             values (?, ?, ?, ?, 1, 0)'
        );
        $s->execute([$id, $item['service_id'], $item['item_id'], $item['name']]);

        return $id;
    });

    $row = $pdo->query("select total, status from public.orders where id = '$orderId'")->fetch();
    $check('customer can insert an order', $orderId !== null);
    $check('total recomputed from the catalogue',
        (float) $row['total'] === (float) $item['price'], "stored {$row['total']}");
    $check("status forced to 'pending'", $row['status'] === 'pending', "stored {$row['status']}");

    if ($other) {
        $check('a different customer cannot add items to it',
            $refuses($pdo, fn () => $as($pdo, $other, function () use ($pdo, $orderId, $item) {
                $s = $pdo->prepare('insert into public.order_items
                    (order_id, service_id, item_id, item_name, quantity, price)
                    values (?, ?, ?, ?, 1, 0)');
                $s->execute([$orderId, $item['service_id'], $item['item_id'], $item['name']]);
            })));
    }

    // -- Claiming, through the lifecycle axis -------------------------------
    echo "\nClaiming\n";
    echo str_repeat('-', 68), "\n";

    $pdo->exec("update public.orders set lifecycle_state='assigning_couriers' where id='$orderId'");

    $check('a courier with no offer cannot claim',
        $refuses($pdo, fn () => $as($pdo, $courier,
            fn () => $rpc($pdo, "transition_order('$orderId','courier_assigned')"))));

    $o = $pdo->prepare('insert into public.order_offers (order_id, courier_id) values (?, ?)');
    $o->execute([$orderId, $courier]);

    $claimed = $as($pdo, $courier,
        fn () => $rpc($pdo, "transition_order('$orderId','courier_assigned')"));
    $check('an offered courier can claim',
        ($claimed['lifecycle_state'] ?? null) === 'courier_assigned',
        'state ' . ($claimed['lifecycle_state'] ?? 'null'));
    $check('courier_id was filled by the claim', ($claimed['courier_id'] ?? null) === $courier);

    $check('a customer cannot claim an order',
        $refuses($pdo, fn () => $as($pdo, $customer,
            fn () => $rpc($pdo, "transition_order('$orderId','courier_assigned')"))));

    $check('the original claim_order is left untouched',
        (bool) $pdo->query("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='claim_order'
                            and pg_get_function_result(p.oid)='boolean'")->fetchColumn());

    // -- The state machine -------------------------------------------------
    echo "\nThe state machine\n";
    echo str_repeat('-', 68), "\n";

    $check('cannot skip straight to delivered',
        $refuses($pdo, fn () => $as($pdo, $courier,
            fn () => $rpc($pdo, "transition_order('$orderId','delivered')"))));

    $check('a customer cannot drive a courier-only step',
        $refuses($pdo, fn () => $as($pdo, $customer,
            fn () => $rpc($pdo, "transition_order('$orderId','courier_en_route_pickup')"))));

    $ok = true;
    foreach (['courier_en_route_pickup' => $courier,
              'picked_up'               => $courier,
              'at_laundry'              => $admin] as $to => $actor) {
        try {
            $as($pdo, $actor, fn () => $rpc($pdo, "transition_order('$orderId','$to')"));
        } catch (Throwable $e) {
            $ok = false;
            $check("  step to $to", false, $e->getMessage());
        }
    }

    $final = $pdo->query("select lifecycle_state, status, collected_at
                          from public.orders where id='$orderId'")->fetch();
    $check('the legal sequence runs through',
        $ok && $final['lifecycle_state'] === 'at_laundry', "state {$final['lifecycle_state']}");
    $check("legacy status kept in step ('cleaning')",
        $final['status'] === 'cleaning', "stored {$final['status']}");
    $check('collected_at stamped by the existing trigger', $final['collected_at'] !== null);

    // -- Grants ------------------------------------------------------------
    echo "\nGrants\n";
    echo str_repeat('-', 68), "\n";
    $anon = $pdo->query("select has_function_privilege('anon', 'public.transition_order(uuid, text)', 'EXECUTE')")->fetchColumn();
    $auth = $pdo->query("select has_function_privilege('authenticated', 'public.transition_order(uuid, text)', 'EXECUTE')")->fetchColumn();
    $check('transition_order — anon no, authenticated yes', !$anon && $auth);
} catch (Throwable $e) {
    echo "\n  ABORTED: " . str_replace($env['DB_PASSWORD'], '***', $e->getMessage()) . "\n";
    $fail++;
} finally {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}

echo "\n", str_repeat('-', 68), "\n";
printf("%d passed, %d failed. Rolled back — orders still %d rows.\n",
    $pass, $fail, (int) $pdo->query('select count(*) from public.orders')->fetchColumn());

exit($fail === 0 ? 0 : 1);
