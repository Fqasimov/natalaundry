<?php
/**
 * What has Seoul got that Frankfurt has not?
 *
 * The live App Store app writes to Seoul: the Frankfurt project was created on
 * 2026-08-31 and the shipped binary predates it, with the Supabase URL and key
 * compiled in by Expo at build time. So the region move made a copy, not a
 * cutover — production moves only as users install the new build.
 *
 * Until that has happened, Seoul keeps receiving real orders. This reports the
 * gap so it can be closed before it turns into a customer whose order vanished.
 *
 * Strictly read-only. It opens both databases, counts, and prints. It writes
 * nothing to either, so it is safe to run against production at any time.
 *
 *   php scripts/migration/seoul-delta.php
 *
 * Needs scripts/migration/seoul.env (gitignored) — see ACTIONS.md phase 0.2.
 */

$root = dirname(__DIR__, 2);

function readEnv(string $file): array
{
    if (!is_file($file)) {
        return [];
    }
    $out = [];
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$k, $v] = explode('=', $line, 2);
        $out[trim($k)] = trim(trim($v), "\"'");
    }
    return $out;
}

function connect(array $env, string $label): PDO
{
    foreach (['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'] as $k) {
        if (empty($env[$k])) {
            fwrite(STDERR, "$label: $k missing\n");
            exit(1);
        }
    }
    try {
        // Session pooler: this holds a connection while it walks every table.
        return new PDO(
            sprintf('pgsql:host=%s;port=5432;dbname=%s;sslmode=require;connect_timeout=10',
                $env['DB_HOST'], $env['DB_DATABASE']),
            $env['DB_USERNAME'],
            $env['DB_PASSWORD'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    } catch (PDOException $e) {
        $msg = str_replace($env['DB_PASSWORD'], '***', $e->getMessage());
        fwrite(STDERR, "$label: $msg\n");
        if (str_contains($msg, 'ENOTFOUND')) {
            fwrite(STDERR, "\nThat is the pooler fleet, not the password.\n");
            fwrite(STDERR, "Seoul is aws-1-ap-northeast-2; Frankfurt is aws-0-eu-central-1.\n");
        }
        exit(1);
    }
}

$seoulEnv = readEnv(__DIR__ . '/seoul.env');
if (!$seoulEnv) {
    fwrite(STDERR, "scripts/migration/seoul.env not found.\n");
    fwrite(STDERR, "Create it with the Seoul credentials — see ACTIONS.md phase 0.2.\n");
    exit(1);
}

$seoul = connect($seoulEnv, 'Seoul');
$frank = connect(readEnv($root . '/backend/.env'), 'Frankfurt');

/** Tables worth comparing, and the column that says when a row appeared. */
$tables = [
    'orders'              => 'created_at',
    'order_items'         => null,
    'profiles'            => 'created_at',
    'payments'            => null,
    'payment_intents'     => null,
    'notifications'       => 'created_at',
    'gift_box_openings'   => null,
    'user_rewards'        => null,
    'wallet_transactions' => null,
    'courier_locations'   => 'recorded_at',
    'order_status_logs'   => null,
    'customer_details'    => null,
];

$count = static function (PDO $p, string $t): ?int {
    try {
        return (int) $p->query('select count(*) from public."' . $t . '"')->fetchColumn();
    } catch (Throwable) {
        return null; // table absent on that side
    }
};

printf("%-22s %10s %10s %10s\n", 'table', 'Seoul', 'Frankfurt', 'gap');
echo str_repeat('-', 56), "\n";

$totalGap = 0;
$gaps = [];

foreach ($tables as $t => $stamp) {
    $s = $count($seoul, $t);
    $f = $count($frank, $t);

    if ($s === null && $f === null) {
        continue;
    }

    $gap = ($s ?? 0) - ($f ?? 0);
    if ($gap > 0) {
        $totalGap += $gap;
        $gaps[] = $t;
    }

    printf("%-22s %10s %10s %10s%s\n",
        $t,
        $s ?? '-',
        $f ?? '-',
        $gap > 0 ? '+' . $gap : ($gap < 0 ? (string) $gap : '0'),
        $gap > 0 ? '  <- Seoul is ahead' : '');
}

// auth.users is the one that matters most: a customer who signed up on the old
// build and then updates would otherwise find their account simply gone.
$su = (int) $seoul->query('select count(*) from auth.users')->fetchColumn();
$fu = (int) $frank->query('select count(*) from auth.users')->fetchColumn();
printf("%-22s %10d %10d %10s%s\n", 'auth.users', $su, $fu,
    $su - $fu > 0 ? '+' . ($su - $fu) : '0',
    $su - $fu > 0 ? '  <- Seoul is ahead' : '');
if ($su - $fu > 0) {
    $totalGap += $su - $fu;
    $gaps[] = 'auth.users';
}

echo "\n";

// When did each side last see anything at all?
foreach ([['Seoul', $seoul], ['Frankfurt', $frank]] as [$label, $pdo]) {
    $last = $pdo->query('select max(created_at)::date from auth.users')->fetchColumn();
    $lastOrder = $pdo->query('select max(created_at)::date from public.orders')->fetchColumn();
    printf("  %-10s newest signup %s, newest order %s\n",
        $label, $last ?: '-', $lastOrder ?: '-');
}

echo "\n", str_repeat('-', 56), "\n";

if ($totalGap === 0) {
    echo "No gap. Seoul has written nothing that Frankfurt lacks.\n";
    echo "Safe to proceed with the release as planned.\n";
    exit(0);
}

printf("Seoul is ahead by %d row(s), in: %s\n", $totalGap, implode(', ', $gaps));
echo "\nThose rows exist only on the database your live app writes to. Sync them\n";
echo "into Frankfurt before the update reaches users, or they will appear to\n";
echo "have vanished. Re-run this as late as possible before submitting.\n";
exit(1);
