<?php
/**
 * Apply supabase/direct-writes.sql to the live database.
 *
 * The file wraps itself in begin/commit, so it either lands whole or not at
 * all. Everything in it is idempotent — `drop policy if exists` before each
 * create, `create or replace` for the function — so re-running is a no-op.
 *
 * Verified beforehand by scripts/migration/test-direct-writes.php, which
 * applies the same file and runs 15 assertions against it inside a transaction
 * that is rolled back.
 *
 *   php scripts/migration/apply-direct-writes.php          # show, change nothing
 *   php scripts/migration/apply-direct-writes.php --apply
 */

$apply = in_array('--apply', $argv, true);

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

$state = static function (PDO $pdo): array {
    return [
        'orders_insert' => (int) $pdo->query("select count(*) from pg_policies
            where schemaname='public' and tablename='orders' and cmd='INSERT'")->fetchColumn(),
        'items_insert' => (int) $pdo->query("select count(*) from pg_policies
            where schemaname='public' and tablename='order_items' and cmd='INSERT'")->fetchColumn(),
        'loc_insert' => (int) $pdo->query("select count(*) from pg_policies
            where schemaname='public' and tablename='courier_locations' and cmd='INSERT'")->fetchColumn(),
        'transition' => (int) $pdo->query("select count(*) from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='transition_order'")->fetchColumn(),
        'claim_order_boolean' => (int) $pdo->query("select count(*) from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='claim_order'
              and pg_get_function_result(p.oid)='boolean'")->fetchColumn(),
    ];
};

$before = $state($pdo);

$show = static function (string $label, array $s): void {
    printf("  %-26s %s\n", 'orders INSERT policy',      $s['orders_insert'] ? 'yes' : 'no');
    printf("  %-26s %s\n", 'order_items INSERT policy', $s['items_insert'] ? 'yes' : 'no');
    printf("  %-26s %s\n", 'courier_locations INSERT',  $s['loc_insert'] ? 'yes' : 'no');
    printf("  %-26s %s\n", 'transition_order exists',   $s['transition'] ? 'yes' : 'no');
    printf("  %-26s %s\n", 'original claim_order kept', $s['claim_order_boolean'] ? 'yes' : 'NO — PROBLEM');
};

echo "Before\n", str_repeat('-', 48), "\n";
$show('before', $before);

if (!$apply) {
    echo "\nDry run — nothing changed. Re-run with --apply.\n";
    exit(0);
}

$sql = file_get_contents($root . '/supabase/direct-writes.sql');
if ($sql === false || trim($sql) === '') {
    fwrite(STDERR, "supabase/direct-writes.sql is missing or empty\n");
    exit(1);
}

$pdo->exec($sql);

$after = $state($pdo);
echo "\nAfter\n", str_repeat('-', 48), "\n";
$show('after', $after);

$ok = $after['orders_insert'] && $after['items_insert'] && $after['loc_insert']
    && $after['transition'] && $after['claim_order_boolean'];

echo "\n", str_repeat('-', 48), "\n";
echo $ok
    ? "Applied. The app can write orders directly again.\n"
    : "Applied, but the state is not what was expected — inspect before relying on it.\n";

exit($ok ? 0 : 1);
