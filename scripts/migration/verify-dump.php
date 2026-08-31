<?php

/**
 * Compare row counts inside the dump against the live source, table by table.
 *
 * pg_dump exiting 0 is not evidence the data is there. A dump can carry a
 * flawless schema and no rows at all, and you find that out on restore day
 * with the source already torn down. This is the cheap check that makes the
 * dump trustworthy.
 *
 *   php scripts/migration/verify-dump.php
 */

require __DIR__ . '/_shared.php';

$source = sourceConfig();
$pdo = pdoFor($source);
$dir = dumpDir();

$problems = 0;

foreach (array_keys(schemas()) as $schema) {
    $file = "$dir/$schema.sql";
    if (!is_file($file)) {
        fwrite(STDERR, "Missing $file — run dump.php first.\n");
        exit(1);
    }

    // Every table that actually exists in the source, so a table added later
    // cannot be silently skipped by a hardcoded list.
    $tables = $pdo->query(
        "select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = " . $pdo->quote($schema) . "
           and c.relkind = 'r'
         order by c.relname"
    )->fetchAll(PDO::FETCH_COLUMN);

    $inDump = rowsInDump($file);

    echo "── $schema.sql\n";
    printf("   %-28s %8s %9s\n", 'table', 'live', 'in dump');
    echo '   ' . str_repeat('-', 48) . "\n";

    foreach ($tables as $table) {
        $live = (int) $pdo->query("select count(*) from \"$schema\".\"$table\"")->fetchColumn();
        $dumped = $inDump[$table] ?? null;

        $flag = '';
        if ($dumped === null) {
            $flag = '  <-- NOT IN DUMP';
            $problems++;
        } elseif ($dumped !== $live) {
            $flag = '  <-- MISMATCH';
            $problems++;
        }

        // Empty tables are unremarkable; only print them when something is off.
        if ($live > 0 || $flag !== '') {
            printf("   %-28s %8d %9s%s\n", $table, $live, $dumped ?? '-', $flag);
        }
    }
    echo "\n";
}

// ── The checks worth calling out by name ─────────────────────────────────
echo "── accounts\n";

$users = (int) $pdo->query('select count(*) from auth.users')->fetchColumn();
$hashed = (int) $pdo->query(
    "select count(*) from auth.users where encrypted_password like '\$2%'"
)->fetchColumn();
$profiles = (int) $pdo->query('select count(*) from public.profiles')->fetchColumn();

printf("   %-36s %d\n", 'auth.users', $users);
printf("   %-36s %d\n", 'with a bcrypt hash', $hashed);
printf("   %-36s %d\n", 'public.profiles', $profiles);

if ($users !== $profiles) {
    echo "   NOTE: user and profile counts differ. Every user should have a\n";
    echo "         profile row; the trigger creates one on signup.\n";
}

// Cheapest possible proof the passwords are really in the file.
$authSql = file_get_contents("$dir/auth.sql");
$bcrypt = substr_count($authSql, '$2a$') + substr_count($authSql, '$2b$') + substr_count($authSql, '$2y$');
printf("   %-36s %d\n", 'bcrypt hashes present in auth.sql', $bcrypt);

if ($bcrypt < $hashed) {
    fwrite(STDERR, "\n   PASSWORD HASHES MISSING FROM THE DUMP — do not restore.\n");
    $problems++;
}

echo "\n";

if ($problems === 0) {
    echo "VERIFIED — the dump matches the live source. Safe to restore.\n";
    echo "Next: TARGET_ENV=... php scripts/migration/restore.php\n";
    exit(0);
}

fwrite(STDERR, "$problems problem(s). Do not restore until these are understood.\n");
exit(1);
