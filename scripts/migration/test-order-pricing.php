<?php
/**
 * Does the database price an order the way lib/pricing.ts says it should?
 *
 * Closing the discount hole moved the delivery fee and the ILK20 discount into
 * the database. That is only an improvement if the numbers it produces are the
 * ones the app shows the customer — a server that quietly charges something
 * else is worse than one that trusts the client, because nobody notices.
 *
 * The rules, from lib/pricing.ts and config/nata.php, both derived from the
 * video's own arithmetic (₼37 + ₼5 = ₼42):
 *
 *   free over ₼40, otherwise a ₼5 base fee
 *   express tier   +₼5      (standard and eco add nothing)
 *   outside city   +₼5      (additive, applies either way)
 *   ILK20          20% off, first order only
 *
 * Every order is created and rolled back.
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
    printf("  %-46s %s%s\n", $what, $ok ? 'pass' : 'FAIL', $d ? "  ($d)" : '');
    $ok ? $pass++ : $fail++;
};

// Two items whose prices straddle the ₼40 free-delivery threshold.
$cheap = $pdo->query("select item_id, service_id, name, price from public.service_prices
                      where active = true and price between 5 and 15
                      order by price limit 1")->fetch();
$dear  = $pdo->query("select item_id, service_id, name, price from public.service_prices
                      where active = true and price >= 45 order by price limit 1")->fetch();

if (!$cheap || !$dear) {
    fwrite(STDERR, "need one item under ~15 and one at 45+ to test the threshold\n");
    exit(1);
}

// A customer with no order history, so ILK20 is genuinely a first order.
$fresh = $pdo->query("select p.id from public.profiles p
                      where p.role = 'user'
                        and not exists (select 1 from public.orders o where o.user_id = p.id)
                      limit 1")->fetchColumn();
$used  = $pdo->query("select o.user_id from public.orders o
                      join public.profiles p on p.id = o.user_id
                      where p.role = 'user' limit 1")->fetchColumn();

$pdo->beginTransaction();

/** Create an order as the customer and return how the database priced it. */
$price = static function (PDO $pdo, string $uid, array $item, array $opts = []) {
    $pdo->exec("select set_config('request.jwt.claims', " .
        $pdo->quote(json_encode(['sub' => $uid, 'role' => 'authenticated'])) . ", true)");
    $pdo->exec('set local role authenticated');

    $s = $pdo->prepare('insert into public.orders
        (user_id, subtotal, total, collection_time, delivery_time,
         delivery_tier, is_outside_city, promo_code)
        values (?, 0, 0, ?, ?, ?, ?, ?) returning id');
    $s->execute([
        $uid, '09:00', '18:00',
        $opts['tier'] ?? 'standard',
        // PDO binds PHP false as an empty string, which Postgres rejects for a
        // boolean column; the literals are unambiguous.
        ($opts['outside'] ?? false) ? 'true' : 'false',
        $opts['promo'] ?? null,
    ]);
    $id = $s->fetchColumn();

    $s = $pdo->prepare('insert into public.order_items
        (order_id, service_id, item_id, item_name, quantity, price)
        values (?, ?, ?, ?, ?, 0)');
    $s->execute([$id, $item['service_id'], $item['item_id'], $item['name'], $opts['qty'] ?? 1]);

    $pdo->exec('reset role');

    return $pdo->query("select subtotal, discount, delivery_fee, total
                        from public.orders where id = '$id'")->fetch();
};

try {
    printf("Threshold items: %s at %s, %s at %s\n\n",
        $cheap['name'], $cheap['price'], $dear['name'], $dear['price']);

    echo "Delivery fee\n", str_repeat('-', 62), "\n";

    $r = $price($pdo, $used, $cheap);
    $check('under ₼40 pays the ₼5 base fee',
        (float) $r['delivery_fee'] === 5.0,
        "subtotal {$r['subtotal']}, fee {$r['delivery_fee']}");

    $r = $price($pdo, $used, $dear);
    $check('₼40 or over pays nothing',
        (float) $r['delivery_fee'] === 0.0,
        "subtotal {$r['subtotal']}, fee {$r['delivery_fee']}");

    $r = $price($pdo, $used, $cheap, ['tier' => 'express']);
    $check('express adds ₼5 on top of the base fee',
        (float) $r['delivery_fee'] === 10.0, "fee {$r['delivery_fee']}");

    $r = $price($pdo, $used, $dear, ['tier' => 'express']);
    $check('express still charged when delivery is free',
        (float) $r['delivery_fee'] === 5.0, "fee {$r['delivery_fee']}");

    $r = $price($pdo, $used, $cheap, ['tier' => 'eco']);
    $check('eco adds nothing', (float) $r['delivery_fee'] === 5.0, "fee {$r['delivery_fee']}");

    $r = $price($pdo, $used, $cheap, ['outside' => true]);
    $check('outside the city adds ₼5',
        (float) $r['delivery_fee'] === 10.0, "fee {$r['delivery_fee']}");

    $r = $price($pdo, $used, $cheap, ['tier' => 'express', 'outside' => true]);
    $check('express and outside city stack',
        (float) $r['delivery_fee'] === 15.0, "fee {$r['delivery_fee']}");

    echo "\nThe total\n", str_repeat('-', 62), "\n";
    $r = $price($pdo, $used, $cheap, ['qty' => 3]);
    $expected = (float) $cheap['price'] * 3;
    $check('subtotal is price × quantity',
        (float) $r['subtotal'] === $expected, "{$r['subtotal']} vs $expected");
    $check('total is subtotal + fee',
        (float) $r['total'] === $expected + (float) $r['delivery_fee'],
        "total {$r['total']}");

    echo "\nILK20\n", str_repeat('-', 62), "\n";

    if ($fresh) {
        $r = $price($pdo, $fresh, $dear, ['promo' => 'ILK20']);
        $want = round((float) $dear['price'] * 0.20, 2);
        $check('20% off a genuine first order',
            (float) $r['discount'] === $want, "discount {$r['discount']}, expected $want");
        $check('total reflects the discount',
            (float) $r['total'] === (float) $r['subtotal'] - $want + (float) $r['delivery_fee'],
            "total {$r['total']}");

        // That customer now has an order, so the second must not qualify.
        $r = $price($pdo, $fresh, $dear, ['promo' => 'ILK20']);
        $check('no discount on a second order',
            (float) $r['discount'] === 0.0, "discount {$r['discount']}");
    } else {
        $check('a customer with no orders exists to test ILK20 with', false,
            'every profile already has an order');
    }

    $r = $price($pdo, $used, $dear, ['promo' => 'ILK20']);
    $check('no discount for a customer with history',
        (float) $r['discount'] === 0.0, "discount {$r['discount']}");

    $r = $price($pdo, $used, $dear, ['promo' => 'NOT-A-CODE']);
    $check('an invented promo code is ignored',
        (float) $r['discount'] === 0.0, "discount {$r['discount']}");

    echo "\nThe attack\n", str_repeat('-', 62), "\n";
    $pdo->exec("select set_config('request.jwt.claims', " .
        $pdo->quote(json_encode(['sub' => $used, 'role' => 'authenticated'])) . ", true)");
    $pdo->exec('set local role authenticated');
    $s = $pdo->prepare('insert into public.orders
        (user_id, subtotal, total, discount, delivery_fee, collection_time, delivery_time)
        values (?, 0, 0, 9999, 0, ?, ?) returning id');
    $s->execute([$used, '09:00', '18:00']);
    $id = $s->fetchColumn();
    $s = $pdo->prepare('insert into public.order_items
        (order_id, service_id, item_id, item_name, quantity, price)
        values (?, ?, ?, ?, 1, 0)');
    $s->execute([$id, $dear['service_id'], $dear['item_id'], $dear['name']]);
    $pdo->exec('reset role');
    $r = $pdo->query("select discount, total from public.orders where id='$id'")->fetch();
    $check('a client-sent discount is discarded',
        (float) $r['discount'] === 0.0 && (float) $r['total'] > 0,
        "discount {$r['discount']}, total {$r['total']}");
} catch (Throwable $e) {
    echo "\n  ABORTED: " . str_replace($env['DB_PASSWORD'], '***', $e->getMessage()) . "\n";
    $fail++;
} finally {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}

echo "\n", str_repeat('-', 62), "\n";
printf("%d passed, %d failed. Rolled back — orders still %d rows.\n",
    $pass, $fail, (int) $pdo->query('select count(*) from public.orders')->fetchColumn());
exit($fail === 0 ? 0 : 1);
