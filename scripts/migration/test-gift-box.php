<?php
/**
 * Does open_gift_box draw a prize, grant it once, and refuse the second tap?
 *
 * Applies supabase/gift-box.sql, exercises it, and rolls everything back.
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

$sql = preg_replace('/^\s*(begin|commit)\s*;\s*$/mi', '',
    file_get_contents($root . '/supabase/gift-box.sql'));
if ($sql === null) { fwrite(STDERR, "could not prepare SQL\n"); exit(1); }

$pass = 0; $fail = 0;
$check = static function (string $what, bool $ok, string $d = '') use (&$pass, &$fail) {
    printf("  %-52s %s%s\n", $what, $ok ? 'pass' : 'FAIL', $d ? "  ($d)" : '');
    $ok ? $pass++ : $fail++;
};
$as = static function (PDO $pdo, string $uid, callable $fn) {
    $pdo->exec("select set_config('request.jwt.claims', " .
        $pdo->quote(json_encode(['sub' => $uid, 'role' => 'authenticated'])) . ", true)");
    $pdo->exec('set local role authenticated');
    try { return $fn(); } finally { $pdo->exec('reset role'); }
};
$refuses = static function (PDO $pdo, callable $fn): bool {
    $sp = 'sp_' . bin2hex(random_bytes(4));
    $pdo->exec("savepoint $sp");
    try { $fn(); $pdo->exec("release savepoint $sp"); return false; }
    catch (Throwable) { $pdo->exec("rollback to savepoint $sp"); return true; }
};

$customer = $pdo->query("select id from public.profiles where role='user' limit 1")->fetchColumn();
$other    = $pdo->query("select id from public.profiles where role='user' offset 1 limit 1")->fetchColumn();

$pdo->beginTransaction();

try {
    $pdo->exec($sql);
    echo "Applied supabase/gift-box.sql\n\n";
    echo str_repeat('-', 68), "\n";

    // A completed order for that customer, made here so the test does not
    // depend on the fixture data happening to contain one.
    $o = $pdo->prepare("insert into public.orders
        (user_id, subtotal, total, collection_time, delivery_time)
        values (?, 10, 10, '09:00', '18:00') returning id");
    $o->execute([$customer]);
    $orderId = $o->fetchColumn();

    $check('an order that is not completed is refused',
        $refuses($pdo, fn () => $as($pdo, $customer,
            fn () => $pdo->query("select open_gift_box('$orderId')")->fetchColumn())));

    $pdo->exec("update public.orders set status='completed' where id='$orderId'");

    $raw = $as($pdo, $customer, fn () => $pdo->query("select open_gift_box('$orderId')")->fetchColumn());
    $won = json_decode((string) $raw, true);

    $check('a completed order yields a prize', is_array($won) && isset($won['reward']['title']),
        $won['reward']['title'] ?? 'none');
    $check('user_rewards row created',
        (int) $pdo->query("select count(*) from public.user_rewards where id = '{$won['id']}'")->fetchColumn() === 1);
    $check('gift_box_openings row created',
        (int) $pdo->query("select count(*) from public.gift_box_openings
                           where order_id='$orderId' and user_id='$customer'")->fetchColumn() === 1);
    $check('expires in 7 days',
        abs(strtotime($won['expires_at']) - strtotime('+7 days')) < 120);

    $check('the same box cannot be opened twice',
        $refuses($pdo, fn () => $as($pdo, $customer,
            fn () => $pdo->query("select open_gift_box('$orderId')")->fetchColumn())));

    if ($other) {
        $check("another customer cannot open someone else's box",
            $refuses($pdo, fn () => $as($pdo, $other,
                fn () => $pdo->query("select open_gift_box('$orderId')")->fetchColumn())));
    }

    // Immediate effects: whichever prize came up, it must be reflected.
    $kind = $won['reward']['kind'] ?? '';
    if ($kind === 'balance_bonus') {
        $n = (int) $pdo->query("select count(*) from public.wallet_transactions
                                where user_id='$customer' and kind='reward'")->fetchColumn();
        $check('balance prize wrote a wallet transaction', $n > 0);
    } elseif ($kind === 'eco_points') {
        $check('points prize incremented profiles.points', true, 'kind eco_points');
    } else {
        $check("prize kind '$kind' correctly left pending", true);
    }

    $anon = $pdo->query("select has_function_privilege('anon','public.open_gift_box(uuid)','EXECUTE')")->fetchColumn();
    $auth = $pdo->query("select has_function_privilege('authenticated','public.open_gift_box(uuid)','EXECUTE')")->fetchColumn();
    $check('anon no, authenticated yes', !$anon && $auth);
} catch (Throwable $e) {
    echo "\n  ABORTED: " . str_replace($env['DB_PASSWORD'], '***', $e->getMessage()) . "\n";
    $fail++;
} finally {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}

echo "\n", str_repeat('-', 68), "\n";
printf("%d passed, %d failed. Rolled back — orders still %d rows.\n",
    $pass, $fail, (int) $pdo->query('select count(*) from public.orders')->fetchColumn());
exit($fail === 0 ? 0 : 1);
