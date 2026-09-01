<?php
/**
 * Could the app go back to writing orders directly, with no API?
 *
 * The original 1.0.2 app did exactly that, under policies named
 * "Users can insert their own orders". hotfix_2_order_writes.sql removed them
 * on 2026-08-25 because they checked only WHOSE order it was and said nothing
 * about the values in it: anyone with the anon key could POST an order with
 * total = 0.01.
 *
 * Since then the database gained BEFORE INSERT triggers — enforce_item_price
 * rewrites a line's price from the catalogue, recalc_order_total recomputes the
 * order total, force_order_pending forces the status. If those hold against a
 * hostile insert, the hole the hotfix closed is closed a second time, in the
 * database, where it cannot be bypassed by talking to PostgREST directly.
 *
 * That is the question this answers, and it decides whether the Laravel API is
 * load-bearing or merely convenient.
 *
 * Everything runs inside ONE transaction that is ALWAYS rolled back: the
 * policies it creates, the role it assumes, and the rows it inserts. Policies
 * are transactional in Postgres, so the live security posture is unchanged.
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
    $env['DB_USERNAME'],
    $env['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$user = $pdo->query("select id from public.profiles where role = 'user' limit 1")->fetchColumn();
if (!$user) {
    fwrite(STDERR, "no 'user' profile to act as\n");
    exit(1);
}

// A real catalogue price to compare against.
$item = $pdo->query(
    'select item_id, service_id, name, price from public.service_prices
     where active = true order by price desc limit 1'
)->fetch();

echo "Simulating the app writing its own order, as the 1.0.2 build did.\n";
printf("Catalogue says %s (%s) costs %s\n\n", $item['name'], $item['item_id'], $item['price']);

$pdo->beginTransaction();

try {
    // Put back exactly the kind of policy hotfix_2 removed.
    $pdo->exec('create policy "probe_insert_orders" on public.orders
                for insert to authenticated with check (auth.uid() = user_id)');
    $pdo->exec('create policy "probe_insert_items" on public.order_items
                for insert to authenticated with check (
                    exists (select 1 from public.orders o
                            where o.id = order_id and o.user_id = auth.uid()))');
    $pdo->exec('grant insert on public.orders, public.order_items to authenticated');

    $pdo->exec("select set_config('request.jwt.claims', " .
        $pdo->quote(json_encode(['sub' => $user, 'role' => 'authenticated'])) . ", true)");
    $pdo->exec('set local role authenticated');

    // The attack from the hotfix: name your own total, and your own status.
    $ins = $pdo->prepare(
        'insert into public.orders
            (user_id, subtotal, total, collection_time, delivery_time, status)
         values (?, 0.01, 0.01, ?, ?, ?) returning id, total, status'
    );
    $ins->execute([$user, '09:00', '18:00', 'completed']);
    $order = $ins->fetch();

    // And a line item priced at nothing.
    $li = $pdo->prepare(
        'insert into public.order_items
            (order_id, service_id, item_id, item_name, quantity, price)
         values (?, ?, ?, ?, 1, 0) returning price'
    );
    $li->execute([$order['id'], $item['service_id'], $item['item_id'], $item['name']]);
    $storedPrice = $li->fetchColumn();

    $pdo->exec('reset role');

    $after = $pdo->prepare('select total, status from public.orders where id = ?');
    $after->execute([$order['id']]);
    $final = $after->fetch();

    echo "  client asked for   total 0.01, status 'completed', line price 0\n";
    printf("  database stored    total %s, status '%s', line price %s\n\n",
        $final['total'], $final['status'], $storedPrice);

    $priceFixed  = (float) $storedPrice === (float) $item['price'];
    $totalFixed  = (float) $final['total'] !== 0.01;
    $statusFixed = $final['status'] === 'pending';

    printf("  line price rewritten from the catalogue: %s\n", $priceFixed ? 'YES' : 'NO');
    printf("  order total recomputed:                  %s\n", $totalFixed ? 'YES' : 'NO');
    printf("  status forced to pending:                %s\n", $statusFixed ? 'YES' : 'NO');

    echo "\n";
    if ($priceFixed && $totalFixed && $statusFixed) {
        echo "  VERDICT: the database defends itself. A client writing directly\n";
        echo "  cannot choose its own prices — the triggers overwrite them. Going\n";
        echo "  back to direct writes would NOT reopen the 2026-08-25 hole.\n";
    } else {
        echo "  VERDICT: the database does NOT fully defend itself. Direct writes\n";
        echo "  would reopen the hole hotfix_2 closed. Keep the API.\n";
    }
} catch (Throwable $e) {
    echo '  FAILED: ' . str_replace($env['DB_PASSWORD'], '***', $e->getMessage()) . "\n";
} finally {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}

// Prove nothing survived.
$n = (int) $pdo->query('select count(*) from public.orders')->fetchColumn();
$p = (int) $pdo->query("select count(*) from pg_policies
                        where schemaname='public' and policyname like 'probe_%'")->fetchColumn();
printf("\nRolled back. orders: %d rows (expected 15), probe policies left: %d (expected 0)\n", $n, $p);
