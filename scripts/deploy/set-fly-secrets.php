<?php
/**
 * Push the API's secrets into Fly, without any of them touching a command line
 * or a file on disk.
 *
 * `fly secrets set K=V` puts the value in the process list, where anything on
 * the machine can read it. `fly secrets import` reads `KEY=VALUE` lines from
 * stdin instead, so this pipes straight from backend/.env into flyctl through a
 * pipe that never becomes a file and never gets printed.
 *
 * Only the seven secret keys are sent. Everything else the API needs — host,
 * port, username, URLs, pricing constants — is non-secret and already declared
 * in backend/fly.toml, so sending it here would just create two places to keep
 * one value correct.
 *
 * Run from the repo root, after `fly auth login` and `fly apps create`:
 *
 *   php scripts/deploy/set-fly-secrets.php            # show what would be sent
 *   php scripts/deploy/set-fly-secrets.php --apply    # actually send it
 */

$apply = in_array('--apply', $argv, true);

$root = dirname(__DIR__, 2);
$envFile = $root . '/backend/.env';

if (!is_file($envFile)) {
    fwrite(STDERR, "backend/.env not found\n");
    exit(1);
}

/** The only keys that are genuinely secret. Anything else belongs in fly.toml. */
const SECRET_KEYS = [
    'APP_KEY',
    'DB_PASSWORD',
    'SUPABASE_JWT_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'GOOGLE_MAPS_API_KEY',
    'KAPITAL_PASSWORD',
];

$env = [];
foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
        continue;
    }
    [$k, $v] = explode('=', $line, 2);
    $env[trim($k)] = trim(trim($v), "\"'");
}

$send = [];
$missing = [];
foreach (SECRET_KEYS as $k) {
    if (empty($env[$k])) {
        $missing[] = $k;
        continue;
    }
    $send[$k] = $env[$k];
}

echo "Secrets to send to Fly\n";
echo str_repeat('-', 56), "\n";
foreach (SECRET_KEYS as $k) {
    printf("  %-28s %s\n", $k,
        isset($send[$k]) ? sprintf('present (%d chars)', strlen($send[$k])) : 'MISSING');
}

if ($missing) {
    echo "\n", implode(', ', $missing), " not set in backend/.env.\n";
    echo "Fill them in before deploying — a missing SUPABASE_JWT_SECRET makes the\n";
    echo "API reject every request, including yours.\n";
    exit(1);
}

// The callback has to be the public URL, not the localhost value in .env: the
// bank calls it directly, from outside.
$callback = 'https://api.natalaundry.az/api/payments/callback';
$send['KAPITAL_CALLBACK_URL'] = $callback;
printf("  %-28s %s\n", 'KAPITAL_CALLBACK_URL', $callback);

if (!$apply) {
    echo "\n", str_repeat('-', 56), "\n";
    echo "Dry run — nothing sent. Re-run with --apply.\n";
    echo "Requires `fly auth login` and `fly apps create natalaundry-api` first.\n";
    exit(0);
}

$fly = trim((string) shell_exec('where flyctl 2>NUL')) ?: trim((string) shell_exec('which flyctl 2>/dev/null'));
if ($fly === '') {
    fwrite(STDERR, "\nflyctl is not on PATH. Install it, then run `fly auth login`.\n");
    exit(1);
}

$payload = '';
foreach ($send as $k => $v) {
    // One KEY=VALUE per line is the format `fly secrets import` expects.
    $payload .= $k . '=' . $v . "\n";
}

$proc = proc_open(
    'flyctl secrets import --app natalaundry-api',
    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
    $pipes,
    $root
);

if (!is_resource($proc)) {
    fwrite(STDERR, "could not start flyctl\n");
    exit(1);
}

fwrite($pipes[0], $payload);
fclose($pipes[0]);

$out = stream_get_contents($pipes[1]);
$err = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$code = proc_close($proc);

// Scrub, in case flyctl ever echoes a value back in an error.
foreach ($send as $v) {
    $out = str_replace($v, '***', $out);
    $err = str_replace($v, '***', $err);
}

echo "\n", trim($out), "\n";
if (trim($err) !== '') {
    fwrite(STDERR, trim($err) . "\n");
}

echo str_repeat('-', 56), "\n";
echo $code === 0
    ? "Sent. Check with `fly secrets list` — it shows names and digests, never values.\n"
    : "flyctl exited $code — nothing may have been set.\n";

exit($code);
