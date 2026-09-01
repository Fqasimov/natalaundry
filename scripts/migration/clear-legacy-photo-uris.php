<?php
/**
 * Clear the dead `file://` photo references on legacy orders.
 *
 * Five orders carry `item_photos` entries like
 *
 *   file:///Users/farid/Library/Developer/CoreSimulator/Devices/…/photo.jpg
 *
 * — paths inside an iOS Simulator container. They resolve to nothing on any
 * other device, so a courier or admin opening those orders gets a broken image
 * rather than the evidence the photo existed to provide.
 *
 * This is not the live bug it looks like. `lib/uploads.ts` already uploads to
 * the private `order-photos` bucket and stores the returned *path*, and
 * `app/checkout/summary.tsx` calls it. These rows predate that fix.
 *
 * Only rows where EVERY entry is a file:// or content:// URI are touched, so a
 * mixed row — one legacy URI beside a real uploaded path — is left alone and
 * reported instead of being quietly half-emptied.
 *
 * Prints what it would do and changes nothing unless run with --apply.
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

if (empty($env['DB_PASSWORD'])) {
    fwrite(STDERR, "DB_PASSWORD is not set in backend/.env\n");
    exit(1);
}

$pdo = new PDO(
    sprintf('pgsql:host=%s;port=5432;dbname=%s;sslmode=require;connect_timeout=10',
        $env['DB_HOST'], $env['DB_DATABASE']),
    $env['DB_USERNAME'],
    $env['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$rows = $pdo->query(<<<'SQL'
    select id, order_no, created_at, item_photos
    from public.orders
    where item_photos::text like '%file://%'
       or item_photos::text like '%content://%'
    order by created_at
SQL)->fetchAll();

if (!$rows) {
    echo "Nothing to do — no order holds a device-local photo URI.\n";
    exit(0);
}

$clearable = [];
$mixed = [];

foreach ($rows as $r) {
    $photos = json_decode((string) $r['item_photos'], true) ?: [];
    $local = array_filter($photos, static fn ($p) =>
        is_string($p) && (str_starts_with($p, 'file://') || str_starts_with($p, 'content://')));

    if (count($local) === count($photos)) {
        $clearable[] = $r + ['n' => count($photos)];
    } else {
        $mixed[] = $r + ['n' => count($photos)];
    }
}

printf("%d order(s) hold device-local photo URIs\n", count($rows));
echo str_repeat('-', 70), "\n";

foreach ($clearable as $r) {
    printf("  #%-8s %s  %d photo(s), all local — will clear\n",
        $r['order_no'], substr((string) $r['created_at'], 0, 10), $r['n']);
}
foreach ($mixed as $r) {
    printf("  #%-8s %s  MIXED — left alone, inspect by hand\n",
        $r['order_no'], substr((string) $r['created_at'], 0, 10));
}

if (!$apply) {
    echo str_repeat('-', 70), "\n";
    echo "Dry run. Re-run with --apply to clear the rows listed above.\n";
    exit(0);
}

$pdo->beginTransaction();
$stmt = $pdo->prepare("update public.orders set item_photos = '[]'::jsonb where id = ?");
foreach ($clearable as $r) {
    $stmt->execute([$r['id']]);
}
$pdo->commit();

$left = (int) $pdo->query(
    "select count(*) from public.orders
     where item_photos::text like '%file://%' or item_photos::text like '%content://%'"
)->fetchColumn();

echo str_repeat('-', 70), "\n";
printf("Cleared %d row(s). Remaining with local URIs: %d%s\n",
    count($clearable), $left, $mixed ? ' (the mixed ones, deliberately)' : '');
