<?php

/**
 * Turn the pg_dump output into chunks that can be executed over a plain SQL
 * connection — the Supabase MCP, the SQL editor, anything that takes a query
 * string rather than a psql session.
 *
 * Why this exists: pg_dump writes for psql, not for SQL. It emits `\restrict`
 * meta-commands and streams table data as `COPY ... FROM stdin`, and neither
 * survives outside psql. Re-dumping with --inserts fixes the data half; this
 * script handles the rest and splits the result into pieces small enough to
 * send one at a time.
 *
 * Statement splitting respects dollar-quoting, because nineteen of the
 * functions in this schema are $$-delimited and contain semicolons. Splitting
 * naively on ";" cuts them in half and the restore fails somewhere deep in a
 * trigger body.
 *
 *   php scripts/migration/prepare-for-mcp.php
 */

require __DIR__ . '/_shared.php';

$source = sourceConfig();
$dir = dumpDir();
$outDir = $dir . '/mcp';

if (!is_dir($outDir)) {
    mkdir($outDir, 0700, true);
}
foreach (glob("$outDir/*.sql") as $stale) {
    unlink($stale);
}

// ── 1. Re-dump with INSERTs instead of COPY ──────────────────────────────
echo "── re-dumping with --inserts\n";

$publicFile = "$dir/public-inserts.sql";
$result = runPg('pg_dump', array_merge(connArgs($source), [
    '--schema=public',
    '--no-owner',
    '--no-privileges',
    '--no-comments',
    '--quote-all-identifiers',
    // INSERT per row rather than COPY FROM stdin, which only psql can feed.
    '--inserts',
    // Name the columns, so a column-order difference on the target cannot
    // silently shift values into the wrong columns.
    '--column-inserts',
    "--file=$publicFile",
]), $source);

if ($result['code'] !== 0) {
    fwrite(STDERR, "   pg_dump failed: {$result['err']}\n");
    exit(1);
}
printf("   public: %.1f KB\n", filesize($publicFile) / 1024);

// Only the two auth tables that carry accounts. Supabase creates and versions
// the auth schema itself, so its DDL must not be replayed — sessions and
// refresh tokens are deliberately left behind too, since they are signed with
// the old project's JWT secret and would be invalid on arrival.
$authFile = "$dir/auth-users.sql";
$result = runPg('pg_dump', array_merge(connArgs($source), [
    '--data-only',
    '--table=auth.users',
    '--table=auth.identities',
    '--no-owner',
    '--no-privileges',
    '--no-comments',
    '--quote-all-identifiers',
    '--inserts',
    '--column-inserts',
    "--file=$authFile",
]), $source);

if ($result['code'] !== 0) {
    fwrite(STDERR, "   pg_dump failed: {$result['err']}\n");
    exit(1);
}
printf("   auth:   %.1f KB\n\n", filesize($authFile) / 1024);

// ── 2. Split into statements, dollar-quoting aware ───────────────────────

/**
 * @return string[] complete SQL statements, in dump order
 */
function splitStatements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $dollarTag = null;

    foreach (preg_split('/\r?\n/', $sql) as $line) {
        $trimmed = ltrim($line);

        if ($dollarTag === null) {
            // psql meta-commands: \restrict, \unrestrict, \connect. Not SQL.
            if ($trimmed !== '' && $trimmed[0] === '\\') {
                continue;
            }
            // Comments and session settings that mean nothing over a pooled
            // connection where each statement may land on its own session.
            if (str_starts_with($trimmed, '--') || $trimmed === '') {
                continue;
            }
            if (preg_match('/^(SET|SELECT pg_catalog\.set_config)\b/i', $trimmed)) {
                continue;
            }
            // public already exists on the target.
            if (preg_match('/^CREATE SCHEMA "?public"?\s*;/i', $trimmed)) {
                continue;
            }
        }

        $buffer .= $line . "\n";

        // Track $tag$ ... $tag$ so a function body's semicolons are ignored.
        $offset = 0;
        while (preg_match('/\$([A-Za-z_][A-Za-z0-9_]*)?\$/', $line, $m, PREG_OFFSET_CAPTURE, $offset)) {
            $tag = $m[0][0];
            $offset = $m[0][1] + strlen($tag);

            if ($dollarTag === null) {
                $dollarTag = $tag;
            } elseif ($dollarTag === $tag) {
                $dollarTag = null;
            }
        }

        if ($dollarTag === null && preg_match('/;\s*$/', rtrim($line))) {
            $statement = trim($buffer);
            if ($statement !== '') {
                $statements[] = $statement;
            }
            $buffer = '';
        }
    }

    if (trim($buffer) !== '') {
        $statements[] = trim($buffer);
    }

    return $statements;
}

// ── 3. Chunk, preserving dump order ──────────────────────────────────────
// pg_dump emits in dependency order — functions, tables, data, constraints,
// indexes, triggers, policies — so order must survive chunking. Data is kept
// apart from DDL so a failure in one does not obscure the other.

$MAX = 45000; // bytes per chunk; comfortably under any single-query limit

function writeChunks(array $statements, string $outDir, string $prefix, int $max): int
{
    $chunks = [];
    $current = '';

    foreach ($statements as $statement) {
        if ($current !== '' && strlen($current) + strlen($statement) > $max) {
            $chunks[] = $current;
            $current = '';
        }
        $current .= $statement . "\n\n";
    }
    if (trim($current) !== '') {
        $chunks[] = $current;
    }

    foreach ($chunks as $i => $chunk) {
        $name = sprintf('%s/%s-%02d.sql', $outDir, $prefix, $i + 1);
        file_put_contents($name, $chunk);
    }

    return count($chunks);
}

$publicStatements = splitStatements(file_get_contents($publicFile));

$ddl = [];
$data = [];
foreach ($publicStatements as $statement) {
    if (preg_match('/^INSERT INTO /i', $statement)) {
        $data[] = $statement;
    } else {
        $ddl[] = $statement;
    }
}

$authStatements = splitStatements(file_get_contents($authFile));

echo "── statements\n";
printf("   public DDL   %4d\n", count($ddl));
printf("   public data  %4d rows\n", count($data));
printf("   auth data    %4d rows\n\n", count($authStatements));

echo "── chunks written to $outDir\n";
printf("   1-ddl        %d file(s)\n", writeChunks($ddl, $outDir, '1-ddl', $MAX));
printf("   2-data       %d file(s)\n", writeChunks($data, $outDir, '2-data', $MAX));
printf("   3-auth       %d file(s)\n", writeChunks($authStatements, $outDir, '3-auth', $MAX));

echo "\nApply in filename order: 1-ddl, then 3-auth, then 2-data.\n";
echo "auth before public data because profiles.id references auth.users(id).\n";
