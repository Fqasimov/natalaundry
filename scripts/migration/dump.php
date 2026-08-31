<?php

/**
 * Dump the source project's `public` and `auth` schemas.
 *
 * Two schemas, two files, deliberately. `public` is the application; `auth`
 * belongs to GoTrue and carries the users and their bcrypt hashes. Leave auth
 * out and everyone loses their account, because every profile and order row
 * references auth.users(id).
 *
 * Separate files also mean a failure restoring one does not leave the other
 * half-applied.
 *
 *   php scripts/migration/dump.php
 */

require __DIR__ . '/_shared.php';

$source = sourceConfig();
$dir = dumpDir();

echo "Dumping from {$source['host']}\n\n";

foreach (schemas() as $schema => $why) {
    $file = "$dir/$schema.sql";
    echo "── $schema — $why\n";

    $started = microtime(true);

    $result = runPg('pg_dump', array_merge(connArgs($source), [
        "--schema=$schema",
        '--no-owner',          // roles differ between projects
        '--no-privileges',     // grants are replayed from the policy files
        '--no-comments',
        '--quote-all-identifiers',
        "--file=$file",
    ]), $source);

    if (trim($result['out']) !== '') echo '   ' . trim($result['out']) . "\n";
    if (trim($result['err']) !== '') echo '   ' . trim($result['err']) . "\n";

    if ($result['code'] !== 0 || !is_file($file)) {
        fwrite(STDERR, "   FAILED (exit {$result['code']})\n");
        exit(1);
    }

    printf("   ok — %.1f KB in %.1fs\n\n", filesize($file) / 1024, microtime(true) - $started);
}

echo "── contents\n";
foreach (array_keys(schemas()) as $schema) {
    $sql = file_get_contents("$dir/$schema.sql");
    echo "\n   $schema.sql\n";
    foreach ([
        'CREATE TABLE' => '/^CREATE TABLE /mi',
        'CREATE POLICY' => '/^CREATE POLICY /mi',
        'CREATE FUNCTION' => '/^CREATE FUNCTION /mi',
        'CREATE TRIGGER' => '/^CREATE TRIGGER /mi',
        'CREATE INDEX' => '/^CREATE (UNIQUE )?INDEX /mi',
        'COPY (data)' => '/^COPY /mi',
    ] as $label => $pattern) {
        printf("     %-18s %d\n", $label, preg_match_all($pattern, $sql));
    }
}

echo "\nWritten to $dir\n";
echo "This directory is gitignored and must stay that way — auth.sql holds\n";
echo "password hashes and live refresh tokens.\n\n";
echo "Next: php scripts/migration/verify-dump.php\n";
