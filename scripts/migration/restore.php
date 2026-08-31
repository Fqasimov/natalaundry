<?php

/**
 * Restore the dumps into the target project, then check what landed.
 *
 * Refuses to run against a target that already has application data — the
 * common way to lose a migration is restoring twice, or restoring over the
 * wrong project. Pass --force only when you know the target is disposable.
 *
 *   TARGET_ENV=~/nata-target.env php scripts/migration/restore.php
 *   TARGET_ENV=~/nata-target.env php scripts/migration/restore.php --force
 */

require __DIR__ . '/_shared.php';

$force = in_array('--force', $argv, true);
$target = targetConfig();
$dir = dumpDir();

foreach (array_keys(schemas()) as $schema) {
    if (!is_file("$dir/$schema.sql")) {
        fwrite(STDERR, "Missing $dir/$schema.sql — run dump.php first.\n");
        exit(1);
    }
}

echo "Restoring into {$target['host']}\n\n";

// ── Refuse to clobber a populated target ─────────────────────────────────
$pdo = pdoFor($target);

$existing = (int) $pdo->query(
    "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'"
)->fetchColumn();

if ($existing > 0) {
    $rows = 0;
    foreach (['profiles', 'orders'] as $table) {
        try {
            $rows += (int) $pdo->query("select count(*) from public.\"$table\"")->fetchColumn();
        } catch (Throwable) {
            // Table absent — fine, nothing to protect.
        }
    }

    if ($rows > 0 && !$force) {
        fwrite(STDERR, "Target already holds $rows rows across profiles/orders.\n");
        fwrite(STDERR, "Refusing to restore over it. Use --force only if this target is disposable.\n");
        exit(1);
    }

    echo "   note: target already has $existing table(s) in public; continuing\n\n";
}

// ── Restore ──────────────────────────────────────────────────────────────
// Not --single-transaction: Supabase pre-creates parts of the auth schema, so
// a handful of "already exists" errors are expected and must not roll the
// whole thing back. That is why the verification below is not optional.
foreach (schemas() as $schema => $why) {
    echo "── $schema — $why\n";
    $started = microtime(true);

    $result = runPg('psql', array_merge(connArgs($target), [
        '--quiet',
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=off',
        "--file=$dir/$schema.sql",
    ]), $target);

    // Surface errors, but only the ones that matter. "already exists" on
    // Supabase-managed objects is noise; anything naming a public table is not.
    $lines = preg_split('/\r?\n/', $result['err']);
    $serious = [];
    foreach ($lines as $line) {
        if (trim($line) === '') continue;
        if (stripos($line, 'already exists') !== false) continue;
        if (stripos($line, 'must be owner') !== false) continue;
        if (stripos($line, 'permission denied for schema auth') !== false) continue;
        $serious[] = trim($line);
    }

    $ignored = count(array_filter($lines, fn($l) => trim($l) !== '')) - count($serious);
    printf("   %d expected notice(s) ignored\n", $ignored);

    if ($serious) {
        echo "   errors worth reading:\n";
        foreach (array_slice($serious, 0, 25) as $line) {
            echo "     $line\n";
        }
        if (count($serious) > 25) {
            printf("     … and %d more\n", count($serious) - 25);
        }
    }

    printf("   done in %.1fs\n\n", microtime(true) - $started);
}

// ── Verify what actually landed ──────────────────────────────────────────
echo "── what is in the target now\n";

$source = pdoFor(sourceConfig());
$problems = 0;

foreach (['auth' => ['users', 'identities'],
          'public' => ['profiles', 'orders', 'order_items', 'payments',
                       'service_prices', 'rewards', 'promo_codes']] as $schema => $tables) {
    foreach ($tables as $table) {
        $want = (int) $source->query("select count(*) from \"$schema\".\"$table\"")->fetchColumn();
        try {
            $got = (int) $pdo->query("select count(*) from \"$schema\".\"$table\"")->fetchColumn();
        } catch (Throwable $e) {
            printf("   %-28s %6s -> %-6s  MISSING\n", "$schema.$table", $want, '-');
            $problems++;
            continue;
        }

        $flag = $got === $want ? '' : '  <-- MISMATCH';
        if ($flag !== '') $problems++;
        printf("   %-28s %6d -> %-6d%s\n", "$schema.$table", $want, $got, $flag);
    }
}

echo "\n── row level security\n";
$open = $pdo->query(
    "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     order by c.relname"
)->fetchAll(PDO::FETCH_COLUMN);

if ($open) {
    echo '   RLS DISABLED ON: ' . implode(', ', $open) . "\n";
    echo "   These are readable and writable by anyone holding the anon key.\n";
    $problems++;
} else {
    echo "   every table in public has RLS enabled\n";
}

echo "\n";

if ($problems > 0) {
    fwrite(STDERR, "$problems problem(s) — do not cut over yet.\n");
    exit(1);
}

echo "Restore verified.\n\n";
echo "Still to do by hand, in this order:\n";
echo "  1. hotfix_profiles_grant.sql\n";
echo "  2. hotfix_2_order_writes.sql\n";
echo "  3. hotfix_3_staff_accounts.sql\n";
echo "  4. storage_order_photos.sql\n";
echo "  5. perf_indexes.sql — one statement at a time, CONCURRENTLY cannot\n";
echo "     run inside the transaction the SQL editor wraps scripts in\n";
echo "  6. rls_audit.sql — query 5 must return zero rows\n";
echo "  7. Point Supabase Auth's SMTP at Resend\n";
