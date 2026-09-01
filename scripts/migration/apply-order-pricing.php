<?php
/**
 * Apply supabase/enforce-order-pricing.sql, and prove the hole is shut.
 *
 * Without --apply it only demonstrates the current behaviour, inside a
 * transaction that is rolled back, so it is safe to run either way.
 *
 *   php scripts/migration/apply-order-pricing.php
 *   php scripts/migration/apply-order-pricing.php --apply
 *
 * If you would rather close the hole by taking the write access away again
 * instead of fixing the pricing, use --revert: that drops the INSERT policies
 * this project restored, putting the database back to how it was this morning.
 * The app cannot create orders directly after that, but neither can an attacker.
 */

$apply  = in_array('--apply', $argv, true);
$revert = in_array('--revert', $argv, true);

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

if ($revert) {
    $pdo->exec('drop policy if exists "Users can insert their own orders" on public.orders');
    $pdo->exec('drop policy if exists "Users can insert their own order items" on public.order_items');
    $pdo->exec('revoke insert on public.orders from authenticated');
    $pdo->exec('revoke insert on public.order_items from authenticated');
    $n = (int) $pdo->query("select count(*) from pg_policies
        where schemaname='public' and tablename in ('orders','order_items') and cmd='INSERT'")->fetchColumn();
    printf("Reverted. INSERT policies on orders/order_items: %d (expected 0)\n", $n);
    echo "The app cannot create orders directly again — and neither can an attacker.\n";
    exit($n === 0 ? 0 : 1);
}

if ($apply) {
    $sql = file_get_contents($root . '/supabase/enforce-order-pricing.sql');
    if ($sql === false || trim($sql) === '') {
        fwrite(STDERR, "supabase/enforce-order-pricing.sql is missing or empty\n");
        exit(1);
    }
    $pdo->exec($sql);
    echo "Applied supabase/enforce-order-pricing.sql\n\n";
}

// ---- Demonstrate, either way -------------------------------------------
$customer = $pdo->query("select id from public.profiles where role='user' limit 1")->fetchColumn();
$item = $pdo->query('select item_id, service_id, name, price from public.service_prices
                     where active = true order by price desc limit 1')->fetch();

echo "A customer inserting an order with discount = 9999\n";
echo str_repeat('-', 62), "\n";

$pdo->beginTransaction();
try {
    $pdo->exec("select set_config('request.jwt.claims', " .
        $pdo->quote(json_encode(['sub' => $customer, 'role' => 'authenticated'])) . ", true)");
    $pdo->exec('set local role authenticated');

    $s = $pdo->prepare('insert into public.orders
        (user_id, subtotal, total, discount, delivery_fee, collection_time, delivery_time)
        values (?, 0, 0, 9999, 0, ?, ?) returning id');
    $s->execute([$customer, '09:00', '18:00']);
    $id = $s->fetchColumn();

    $s = $pdo->prepare('insert into public.order_items
        (order_id, service_id, item_id, item_name, quantity, price)
        values (?, ?, ?, ?, 1, 0)');
    $s->execute([$id, $item['service_id'], $item['item_id'], $item['name']]);

    $pdo->exec('reset role');
    $r = $pdo->query("select subtotal, discount, delivery_fee, total from public.orders where id='$id'")->fetch();

    printf("  catalogue price   %s\n", $item['price']);
    printf("  stored subtotal   %s\n", $r['subtotal']);
    printf("  stored discount   %s\n", $r['discount']);
    printf("  stored fee        %s\n", $r['delivery_fee']);
    printf("  stored TOTAL      %s\n\n", $r['total']);

    $safe = (float) $r['discount'] === 0.0 && (float) $r['total'] > 0.0;
    echo $safe
        ? "  Safe: the discount was discarded and the order priced from the catalogue.\n"
        : "  EXPLOITABLE: the client's discount was honoured.\n";
} finally {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}

if (!$apply) {
    echo "\nDry run — nothing changed. Re-run with --apply to fix, or --revert to\n";
    echo "take direct write access away again.\n";
}
