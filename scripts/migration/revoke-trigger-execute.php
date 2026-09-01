<?php
/**
 * Revoke EXECUTE on the public trigger functions.
 *
 * Supabase's linter flags every trigger function that keeps EXECUTE for `anon`
 * and `authenticated`. During the Frankfurt migration these were left as the
 * source had them, on the reasoning that Postgres *might* check EXECUTE when a
 * trigger fires and breaking signup to satisfy a lint was a bad trade.
 *
 * `trigger-grants-check.php` settled that with evidence: a SECURITY DEFINER
 * trigger with EXECUTE revoked from PUBLIC, anon and authenticated still fired
 * on an insert performed *as* `authenticated`. Postgres checks EXECUTE when the
 * trigger is created, not when it runs. Nothing in the app or the API calls any
 * of these functions directly — verified by grep — so nothing else depends on
 * the grant.
 *
 * Scope is deliberately narrow: functions in `public` owned by the connecting
 * role. The four in `storage` and `realtime` belong to Supabase's own admin
 * roles, where a REVOKE from us is a silent no-op, and they are not ours to
 * change.
 *
 * Idempotent. Re-running it changes nothing.
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

$password = $env['DB_PASSWORD'] ?? '';
if ($password === '') {
    fwrite(STDERR, "DB_PASSWORD is not set in backend/.env\n");
    exit(1);
}

$pdo = new PDO(
    sprintf('pgsql:host=%s;port=5432;dbname=%s;sslmode=require;connect_timeout=10',
        $env['DB_HOST'], $env['DB_DATABASE']),
    $env['DB_USERNAME'],
    $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$targets = $pdo->query(<<<'SQL'
    select distinct p.oid::regprocedure::text as signature, p.proname as name
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where not t.tgisinternal
      and n.nspname = 'public'
      and r.rolname = current_user
    order by 2
SQL)->fetchAll();

printf("Revoking EXECUTE on %d trigger functions in public\n", count($targets));
echo str_repeat('-', 70), "\n";

$pdo->beginTransaction();
foreach ($targets as $t) {
    // PUBLIC first: anon and authenticated inherit from it, so revoking them
    // alone reports success and changes nothing.
    $pdo->exec("revoke all on function {$t['signature']} from public");
    $pdo->exec("revoke all on function {$t['signature']} from anon, authenticated");
}
$pdo->commit();

// Verify by asking the catalogue, not by trusting the commands.
$failed = 0;
foreach ($targets as $t) {
    $q = $pdo->prepare(
        "select has_function_privilege('anon', ?::regprocedure, 'EXECUTE') a,
                has_function_privilege('authenticated', ?::regprocedure, 'EXECUTE') b,
                has_function_privilege('public', ?::regprocedure, 'EXECUTE') c"
    );
    $q->execute([$t['signature'], $t['signature'], $t['signature']]);
    $r = $q->fetch();
    $open = $r['a'] || $r['b'] || $r['c'];
    if ($open) {
        $failed++;
    }
    printf("  %-34s %s\n", $t['name'], $open ? 'STILL EXECUTABLE' : 'revoked');
}

echo str_repeat('-', 70), "\n";
echo $failed === 0
    ? "All revoked. service_role and the table owner are unaffected.\n"
    : "$failed function(s) still executable — investigate before trusting this.\n";
exit($failed === 0 ? 0 : 1);
