<?php
/**
 * Does an unverified signup stay out of our tables?
 *
 * on_auth_user_created used to fire AFTER INSERT, so a profiles row and a
 * customer_details row appeared the moment anyone submitted the form —
 * confirmed or not. That is free write access to two tables for anyone willing
 * to type an address they do not own.
 *
 * The rows should now appear only when email_confirmed_at is set: on INSERT if
 * the project auto-confirms, and on UPDATE when the customer enters the code.
 *
 * Rolled back, so no test user survives.
 */

$root = dirname(__DIR__, 2);
$env = [];
foreach (file($root . '/backend/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $env[trim($k)] = trim(trim($v), "\"'");
}

$pdo = new PDO(
    sprintf('pgsql:host=%s;port=5432;dbname=%s;sslmode=require;connect_timeout=10',
        $env['DB_HOST'], $env['DB_DATABASE']),
    $env['DB_USERNAME'], $env['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

$pass = 0; $fail = 0;
$check = static function (string $what, bool $ok, string $d = '') use (&$pass, &$fail) {
    printf("  %-54s %s%s\n", $what, $ok ? 'pass' : 'FAIL', $d ? "  ($d)" : '');
    $ok ? $pass++ : $fail++;
};

$rows = static fn (PDO $p, string $uid): array => [
    'profiles' => (int) $p->query("select count(*) from public.profiles where id='$uid'")->fetchColumn(),
    'details'  => (int) $p->query("select count(*) from public.customer_details where id='$uid'")->fetchColumn(),
];

/**
 * profiles.phone is UNIQUE, so each test user needs its own number — reusing
 * one tests the duplicate-phone path rather than the one being measured.
 */
$makeUser = static function (PDO $pdo, ?string $confirmed, ?string $phone = null): string {
    $uid = $pdo->query('select gen_random_uuid()')->fetchColumn();
    $phone ??= '+9945' . random_int(10000000, 99999999);
    $s = $pdo->prepare(<<<'SQL'
        insert into auth.users
            (id, instance_id, aud, role, email, encrypted_password,
             created_at, updated_at, email_confirmed_at,
             raw_app_meta_data, raw_user_meta_data)
        values (?, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ?, 'x', now(), now(), ?::timestamptz, '{}'::jsonb,
                jsonb_build_object('name', 'Test Person', 'phone', ?::text))
    SQL);
    $s->execute([
        $uid,
        'gate-check+' . bin2hex(random_bytes(5)) . '@example.invalid',
        $confirmed,
        $phone,
    ]);
    return $uid;
};

$pdo->beginTransaction();

try {
    echo "An ordinary signup, not yet confirmed\n", str_repeat('-', 70), "\n";

    $sharedPhone = '+9945' . random_int(10000000, 99999999);
    $uid = $makeUser($pdo, null, $sharedPhone);
    $r = $rows($pdo, $uid);
    $check('no profiles row', $r['profiles'] === 0);
    $check('no customer_details row', $r['details'] === 0);

    echo "\nThe customer enters the code\n", str_repeat('-', 70), "\n";

    $pdo->prepare('update auth.users set email_confirmed_at = now() where id = ?')->execute([$uid]);
    $r = $rows($pdo, $uid);
    $check('profiles row created on confirmation', $r['profiles'] === 1);
    $check('customer_details row created too', $r['details'] === 1);

    $p = $pdo->query("select name, phone, role, language from public.profiles where id='$uid'")->fetch();
    $check('name carried through from signup metadata',
        $p['name'] === 'Test Person', $p['name'] ?? 'null');
    $check('phone carried through',
        $p['phone'] === $sharedPhone, $p['phone'] ?? 'null');
    $check("role defaults to 'user'", $p['role'] === 'user');

    echo "\nConfirming again (a resent code, or a reload)\n", str_repeat('-', 70), "\n";

    $pdo->prepare('update auth.users set email_confirmed_at = now() where id = ?')->execute([$uid]);
    $r = $rows($pdo, $uid);
    $check('still exactly one profiles row', $r['profiles'] === 1);
    $check('still exactly one customer_details row', $r['details'] === 1);

    echo "\nA user created already-confirmed (admin, or auto-confirm)\n", str_repeat('-', 70), "\n";

    $uid2 = $makeUser($pdo, 'now()');
    $r = $rows($pdo, $uid2);
    $check('rows created immediately, as before', $r['profiles'] === 1 && $r['details'] === 1);

    echo "\nA second person on the same phone number\n", str_repeat('-', 70), "\n";

    // profiles.phone is UNIQUE. Before this was handled, the confirmation threw
    // and the customer had a code, typed it, and was told something went wrong
    // with no way forward.
    $uid3 = $makeUser($pdo, null, $sharedPhone);
    $pdo->prepare('update auth.users set email_confirmed_at = now() where id = ?')->execute([$uid3]);
    $r = $rows($pdo, $uid3);
    $check('confirmation still succeeds', $r['profiles'] === 1 && $r['details'] === 1);
    $check('their profile has no phone rather than no profile',
        $pdo->query("select phone from public.profiles where id='$uid3'")->fetchColumn() === null);
    $check('the first person keeps the number',
        $pdo->query("select phone from public.profiles where id='$uid'")->fetchColumn() === $sharedPhone);
} catch (Throwable $e) {
    echo "\n  ABORTED: " . str_replace($env['DB_PASSWORD'], '***', $e->getMessage()) . "\n";
    $fail++;
} finally {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
}

echo "\n", str_repeat('-', 70), "\n";
printf("%d passed, %d failed. Rolled back — auth.users still %d rows.\n",
    $pass, $fail, (int) $pdo->query('select count(*) from auth.users')->fetchColumn());
exit($fail === 0 ? 0 : 1);
