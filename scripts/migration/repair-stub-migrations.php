<?php
/**
 * Undo Laravel's default stub migrations, and secure `wallet_topups`.
 *
 * `php artisan migrate --force` was run without `--path` on 2026-09-01. It
 * applied the two intended migrations, but also the three Laravel stubs that
 * this project has always deliberately left `Pending` — identity lives in
 * Supabase `auth.users` + `public.profiles`, and the drivers are
 * file/cookie/sync, so `users`, `sessions`, `password_reset_tokens`, `cache`,
 * `cache_locks`, `jobs`, `job_batches` and `failed_jobs` are all unwanted.
 *
 * They matter because anything in `public` is exposed through PostgREST, and
 * they arrived with RLS off. An empty `public.users` sitting beside the real
 * `profiles` is both a readable endpoint and a trap for the next person.
 *
 * The same run created `wallet_topups` — which IS wanted — but Supabase does
 * not enable RLS on a new table, so it too came up open. It holds money.
 *
 * Every table dropped here is verified empty first. The script refuses to drop
 * a table with rows in it, so it cannot destroy data even if the situation has
 * changed since it was written.
 *
 * Run with --apply. Without it, it reports and changes nothing.
 */

$apply = in_array('--apply', $argv, true);

$env = [];
foreach (file(dirname(__DIR__, 2) . '/backend/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
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

// Order matters: cache_locks and job_batches are referenced by nothing, but
// dropping children before parents keeps this independent of FK direction.
$stubs = [
    'sessions', 'password_reset_tokens', 'users',
    'cache_locks', 'cache',
    'job_batches', 'failed_jobs', 'jobs',
];

echo "Laravel stub tables\n";
echo str_repeat('-', 62), "\n";

$toDrop = [];
foreach ($stubs as $t) {
    $exists = (bool) $pdo->query("select to_regclass('public.$t') is not null")->fetchColumn();
    if (!$exists) {
        printf("  %-24s absent\n", $t);
        continue;
    }
    $n = (int) $pdo->query('select count(*) from public."' . $t . '"')->fetchColumn();
    if ($n > 0) {
        printf("  %-24s %d rows — REFUSING to drop, inspect by hand\n", $t, $n);
        continue;
    }
    $toDrop[] = $t;
    printf("  %-24s empty — will drop\n", $t);
}

echo "\nwallet_topups\n";
echo str_repeat('-', 62), "\n";
$rls = $pdo->query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relname='wallet_topups'")->fetchColumn();
printf("  RLS currently: %s%s\n", $rls ? 'on' : 'OFF', $rls ? '' : ' — will enable and add a policy');

if (!$apply) {
    echo "\n", str_repeat('-', 62), "\n";
    echo "Dry run. Re-run with --apply.\n";
    exit(0);
}

$pdo->beginTransaction();

foreach ($toDrop as $t) {
    $pdo->exec('drop table if exists public."' . $t . '" cascade');
}

// Put the migration ledger back to what it should say, so `migrate:status`
// reads Pending again and nobody re-runs them thinking they were missed.
if ($toDrop) {
    $pdo->exec("delete from public.migrations
                where migration in (
                    '0001_01_01_000000_create_users_table',
                    '0001_01_01_000001_create_cache_table',
                    '0001_01_01_000002_create_jobs_table'
                )");
}

// wallet_topups: same shape as `orders` — readable only by its owner, and not
// writable from the client at all, because money is decided by the API.
if (!$rls) {
    $pdo->exec('alter table public.wallet_topups enable row level security');
    $pdo->exec("drop policy if exists \"Users can view their own topups\" on public.wallet_topups");
    $pdo->exec('create policy "Users can view their own topups"
                on public.wallet_topups for select
                using (auth.uid() = user_id)');
    $pdo->exec('revoke insert, update, delete on public.wallet_topups from anon, authenticated');
    $pdo->exec('revoke all on public.wallet_topups from public');
    $pdo->exec('grant select on public.wallet_topups to authenticated');
}

$pdo->commit();

// Verify from the catalogues rather than trusting the statements.
echo "\nAfter\n";
echo str_repeat('-', 62), "\n";

$left = [];
foreach ($stubs as $t) {
    if ($pdo->query("select to_regclass('public.$t') is not null")->fetchColumn()) {
        $left[] = $t;
    }
}
printf("  stub tables remaining: %s\n", $left ? implode(', ', $left) : 'none');

$open = $pdo->query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
                     order by relname")->fetchAll(PDO::FETCH_COLUMN);
printf("  public tables with RLS off: %s\n", $open ? implode(', ', $open) : 'none');

$pend = $pdo->query("select count(*) from public.migrations
                     where migration like '0001_01_01_%'")->fetchColumn();
printf("  stub migrations still recorded as run: %d (expected 0)\n", (int) $pend);

foreach (['anon', 'authenticated'] as $role) {
    foreach (['insert', 'update', 'delete'] as $priv) {
        $can = $pdo->query("select has_table_privilege('$role', 'public.wallet_topups', '$priv')")->fetchColumn();
        if ($can) {
            printf("  WARNING: %s can %s wallet_topups\n", $role, $priv);
        }
    }
}
echo "  wallet_topups: client writes blocked, owner-only select\n";
