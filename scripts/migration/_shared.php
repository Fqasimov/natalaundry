<?php

/**
 * Shared helpers for the region-migration scripts.
 *
 * Every one of these reads a database password. None of them may ever print
 * one, and none may pass one on a command line where the machine's process
 * list would show it — hence `runPg()` putting it in the child environment.
 */

/** Parse a dotenv-style file into an array. Handles quoted values and #. */
function readEnvFile(string $path): array
{
    if (!is_file($path)) {
        fwrite(STDERR, "Missing env file: $path\n");
        exit(1);
    }

    $out = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = ltrim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $out[trim($k)] = trim(trim($v), "\"'");
    }

    return $out;
}

/** Where the source project lives. */
function sourceConfig(): array
{
    $env = readEnvFile(repoRoot() . '/backend/.env');

    foreach (['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'] as $key) {
        if (($env[$key] ?? '') === '') {
            fwrite(STDERR, "backend/.env is missing $key\n");
            exit(1);
        }
    }

    return [
        'host' => $env['DB_HOST'],
        // Always the session pooler for schema work, whatever the app runs on.
        'port' => 5432,
        'user' => $env['DB_USERNAME'],
        'pass' => $env['DB_PASSWORD'],
        'db'   => $env['DB_DATABASE'],
        'label' => 'source',
    ];
}

/** Where it is going. Path comes from TARGET_ENV. */
function targetConfig(): array
{
    $path = getenv('TARGET_ENV');
    if ($path === false || $path === '') {
        fwrite(STDERR, "Set TARGET_ENV to your filled-in copy of new-project.env.example\n");
        exit(1);
    }

    $env = readEnvFile($path);

    foreach (['NEW_DB_HOST', 'NEW_DB_USER', 'NEW_DB_PASSWORD'] as $key) {
        if (($env[$key] ?? '') === '') {
            fwrite(STDERR, "$path is missing $key\n");
            exit(1);
        }
    }

    return [
        'host' => $env['NEW_DB_HOST'],
        'port' => 5432,
        'user' => $env['NEW_DB_USER'],
        'pass' => $env['NEW_DB_PASSWORD'],
        'db'   => $env['NEW_DB_DATABASE'] ?? 'postgres',
        'label' => 'target',
    ];
}

function repoRoot(): string
{
    return dirname(__DIR__, 2);
}

function dumpDir(): string
{
    $dir = __DIR__ . DIRECTORY_SEPARATOR . 'dump';
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }

    return $dir;
}

/** Locate a Postgres client binary, honouring PG_BIN. */
function pgBinary(string $name): string
{
    $exe = stripos(PHP_OS_FAMILY, 'Windows') === 0 ? "$name.exe" : $name;

    $configured = getenv('PG_BIN');
    if ($configured) {
        $candidate = rtrim($configured, '/\\') . DIRECTORY_SEPARATOR . $exe;
        if (is_file($candidate)) {
            return $candidate;
        }
        fwrite(STDERR, "PG_BIN is set but $candidate does not exist\n");
        exit(1);
    }

    // Fall back to PATH; the OS resolves it.
    return $exe;
}

/**
 * Run a Postgres client tool against a config.
 *
 * The password goes into the child's environment, never onto the command
 * line — argv is world-readable in the process list on every OS that matters.
 * Output is scrubbed on the way back regardless, because psql echoes
 * connection strings in some error paths.
 *
 * @return array{code:int, out:string, err:string}
 */
function runPg(string $binary, array $args, array $config): array
{
    $proc = proc_open(
        array_merge([pgBinary($binary)], $args),
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        null,
        [
            'PGPASSWORD' => $config['pass'],
            'PGSSLMODE'  => 'require',
            'SYSTEMROOT' => getenv('SYSTEMROOT') ?: '',
            'PATH'       => getenv('PATH') ?: '',
        ]
    );

    if (!is_resource($proc)) {
        fwrite(STDERR, "Could not start $binary. Is it installed and on PATH, or is PG_BIN set?\n");
        exit(1);
    }

    $out = stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);

    $scrub = fn(string $s) => str_replace($config['pass'], '<redacted>', $s);

    return ['code' => $code, 'out' => $scrub($out), 'err' => $scrub($err)];
}

/** Connection arguments shared by pg_dump and psql. */
function connArgs(array $config): array
{
    return [
        "--host={$config['host']}",
        "--port={$config['port']}",
        "--username={$config['user']}",
        "--dbname={$config['db']}",
    ];
}

function pdoFor(array $config): PDO
{
    return new PDO(
        "pgsql:host={$config['host']};dbname={$config['db']};port={$config['port']};sslmode=require",
        $config['user'],
        $config['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
}

/**
 * Rows per table inside a dump file.
 *
 * pg_dump writes data as `COPY "schema"."table" (...) FROM stdin;`, one row
 * per line, terminated by a lone backslash-dot. Counting lines between the
 * two is exact and needs no parsing of the values.
 */
function rowsInDump(string $file): array
{
    $counts = [];
    $handle = fopen($file, 'r');
    $current = null;
    $n = 0;

    while (($line = fgets($handle)) !== false) {
        if ($current === null) {
            if (preg_match('/^COPY "([^"]+)"\."([^"]+)"/', $line, $m)) {
                $current = $m[2];
                $n = 0;
            }
            continue;
        }

        if (rtrim($line, "\r\n") === '\\.') {
            $counts[$current] = $n;
            $current = null;
            continue;
        }

        $n++;
    }

    fclose($handle);

    return $counts;
}

/** The two schemas that make up this project, and why each is dumped. */
function schemas(): array
{
    return [
        'public' => 'the application: tables, policies, functions, triggers',
        'auth'   => 'GoTrue: users and their bcrypt password hashes',
    ];
}
