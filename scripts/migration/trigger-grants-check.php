<?php
/**
 * Can EXECUTE be revoked from the trigger functions without breaking signup?
 *
 * Supabase's linter flags trigger functions that keep EXECUTE for `anon` and
 * `authenticated`. During the Frankfurt migration these were left exactly as the
 * source had them, because Postgres *may* check EXECUTE when a trigger fires and
 * breaking signup to satisfy a lint mid-migration is a bad trade.
 *
 * This settles it with evidence instead of argument. Everything runs inside one
 * transaction that is ALWAYS rolled back: the revokes, a real INSERT into
 * auth.users, and the check for the profile row the trigger should create.
 * Grants are transactional in Postgres, so nothing here survives the rollback —
 * the database is in exactly the state it started in.
 *
 * Usage, from the repo root:
 *
 *   php scripts/migration/trigger-grants-check.php
 *
 * Reads backend/.env. The password is passed to PDO only, never printed, never
 * put on a command line where the process list would expose it.
 */

$root = dirname(__DIR__, 2);
$envFile = $root . '/backend/.env';

if (!is_file($envFile)) {
    fwrite(STDERR, "backend/.env not found at $envFile\n");
    exit(1);
}

$env = [];
foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
        continue;
    }
    [$k, $v] = explode('=', $line, 2);
    $env[trim($k)] = trim(trim($v), "\"'");
}

foreach (['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'] as $k) {
    if (empty($env[$k])) {
        fwrite(STDERR, "$k is not set in backend/.env\n");
        exit(1);
    }
}

$password = $env['DB_PASSWORD'];

// Session pooler (5432), not the transaction pooler: this script holds one
// connection across a multi-statement transaction with DDL in it.
$port = 5432;

$dsn = sprintf(
    'pgsql:host=%s;port=%d;dbname=%s;sslmode=require;connect_timeout=10',
    $env['DB_HOST'],
    $port,
    $env['DB_DATABASE']
);

try {
    $pdo = new PDO($dsn, $env['DB_USERNAME'], $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, scrub($e->getMessage(), $password) . "\n");
    if (str_contains($e->getMessage(), 'ENOTFOUND')) {
        fwrite(STDERR, "\nThat is the pooler fleet prefix, not the password.\n");
        fwrite(STDERR, "Frankfurt is on aws-0-eu-central-1, Seoul was on aws-1-*.\n");
    }
    exit(1);
}

function scrub(string $s, string $password): string
{
    return str_replace($password, '***', $s);
}

/** Which functions are actually reachable from a trigger? */
const TRIGGER_FUNCTIONS_SQL = <<<'SQL'
select distinct
    p.oid::regprocedure::text as signature,
    p.proname                 as name,
    p.prosecdef               as security_definer,
    array_to_string(array(
        select r.rolname
        from pg_roles r
        where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
          and r.rolname in ('anon', 'authenticated', 'service_role')
    ), ', ') as granted_to,
    has_function_privilege('public', p.oid, 'EXECUTE') as public_has_execute
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
order by 2
SQL;

echo "Trigger functions and who can EXECUTE them\n";
echo str_repeat('-', 78), "\n";

$funcs = $pdo->query(TRIGGER_FUNCTIONS_SQL)->fetchAll();
if (!$funcs) {
    echo "  none found\n";
    exit(0);
}

foreach ($funcs as $f) {
    printf(
        "  %-34s %-9s PUBLIC:%-4s roles: %s\n",
        $f['name'],
        $f['security_definer'] === true || $f['security_definer'] === 't' ? 'DEFINER' : 'INVOKER',
        $f['public_has_execute'] === true || $f['public_has_execute'] === 't' ? 'yes' : 'no',
        $f['granted_to'] !== '' ? $f['granted_to'] : '(none)'
    );
}

// ---------------------------------------------------------------------------
// The experiment. Revoke everything, then try a real signup, then roll back.
// ---------------------------------------------------------------------------

echo "\nRevoking EXECUTE and attempting a real signup, inside a transaction\n";
echo str_repeat('-', 78), "\n";

$testEmail = 'trigger-grant-check+' . bin2hex(random_bytes(6)) . '@example.invalid';
$rolledBack = false;

try {
    $pdo->beginTransaction();

    // PUBLIC first. Revoking from anon/authenticated alone reports success and
    // changes nothing, because both inherit the grant from PUBLIC — the exact
    // trap that nearly let settle_payment_intent ship world-executable.
    foreach ($funcs as $f) {
        $sig = $f['signature'];
        $pdo->exec("revoke all on function $sig from public");
        $pdo->exec("revoke all on function $sig from anon");
        $pdo->exec("revoke all on function $sig from authenticated");
    }

    // Confirm the revoke actually took effect rather than trusting the command.
    $stillGranted = [];
    foreach ($funcs as $f) {
        $q = $pdo->prepare(
            "select has_function_privilege('authenticated', ?::regprocedure, 'EXECUTE') as auth,
                    has_function_privilege('public', ?::regprocedure, 'EXECUTE') as pub"
        );
        $q->execute([$f['signature'], $f['signature']]);
        $r = $q->fetch();
        if ($r['auth'] || $r['pub']) {
            $stillGranted[] = $f['name'];
        }
    }

    echo $stillGranted
        ? "  WARNING: still executable after revoke: " . implode(', ', $stillGranted) . "\n"
        : "  EXECUTE revoked from PUBLIC, anon and authenticated on all " . count($funcs) . "\n";

    // ---- Test 1: signup, as GoTrue does it -------------------------------
    //
    // Note the confound this deliberately does NOT rely on: this INSERT runs as
    // `postgres`, which is privileged enough that it might sail past a
    // permission check that would stop a real caller. Test 2 removes that
    // confound by becoming `authenticated`.
    $uid = $pdo->query('select gen_random_uuid()')->fetchColumn();

    $insert = $pdo->prepare(<<<'SQL'
        insert into auth.users
            (id, instance_id, aud, role, email, encrypted_password,
             created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
        values
            (?, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             ?, 'x', now(), now(), '{}'::jsonb, '{}'::jsonb)
    SQL);

    $insert->execute([$uid, $testEmail]);

    $profile = $pdo->prepare('select count(*) from public.profiles where id = ?');
    $profile->execute([$uid]);
    $found = (int) $profile->fetchColumn();

    $signupOk = $found === 1;
    echo $signupOk
        ? "  Test 1 (as postgres):      signup fired handle_new_user, profile created\n"
        : "  Test 1 (as postgres):      NO profile row created\n";

    // ---- Test 2: does Postgres check EXECUTE when a trigger FIRES? --------
    //
    // This is the question the whole item turns on, and the existing tables
    // cannot answer it: `orders` has RLS with SELECT policies only, so
    // `authenticated` cannot insert into it at all — writes go through the API
    // by design. An insert there would fail on RLS and tell us nothing about
    // EXECUTE.
    //
    // So build the minimal case instead: a table an unprivileged role may write
    // to, and a SECURITY DEFINER trigger function that NOBODY holds EXECUTE on.
    // If the trigger still fires, EXECUTE is not checked at fire time, and that
    // conclusion generalises to every trigger function in the database.
    //
    // A savepoint keeps a failure here from poisoning the outer transaction.
    $triggerOk = null;
    $pdo->exec('savepoint probe');

    try {
        $pdo->exec('create table public.__trigger_probe (id serial primary key, touched boolean default false)');

        $pdo->exec(<<<'SQL'
            create function public.__trigger_probe_fn() returns trigger
            language plpgsql security definer set search_path = public as $$
            begin
                new.touched := true;
                return new;
            end $$
        SQL);

        $pdo->exec('create trigger probe_trg before insert on public.__trigger_probe
                    for each row execute function public.__trigger_probe_fn()');

        // Strip EXECUTE from everyone. PUBLIC first — anon and authenticated
        // inherit from it, so revoking them alone reports success and changes
        // nothing. That is the trap that nearly let settle_payment_intent ship
        // world-executable during the migration.
        $pdo->exec('revoke all on function public.__trigger_probe_fn() from public');
        $pdo->exec('revoke all on function public.__trigger_probe_fn() from anon, authenticated');
        $pdo->exec('grant insert, select on public.__trigger_probe to authenticated');
        $pdo->exec('grant usage, select on sequence public.__trigger_probe_id_seq to authenticated');

        $canExec = $pdo->query(
            "select has_function_privilege('authenticated', 'public.__trigger_probe_fn()', 'EXECUTE')"
        )->fetchColumn();

        printf("  Test 2 setup:              authenticated EXECUTE on trigger fn = %s\n",
            $canExec ? 'yes (revoke failed)' : 'no');

        $pdo->exec('set local role authenticated');
        $touched = $pdo->query('insert into public.__trigger_probe default values returning touched')
            ->fetchColumn();
        $pdo->exec('reset role');

        $triggerOk = (bool) $touched;
        printf("  Test 2 (as authenticated): insert succeeded, trigger %s\n",
            $triggerOk ? 'RAN with no EXECUTE grant' : 'did NOT run');
    } catch (Throwable $inner) {
        $pdo->exec('rollback to savepoint probe');
        $triggerOk = false;
        echo "  Test 2 (as authenticated): FAILED — "
            . scrub($inner->getMessage(), $password) . "\n";
    }

    echo "\n";
    if ($signupOk && $triggerOk !== false) {
        echo "  VERDICT: safe to revoke. Postgres does not check EXECUTE when a\n";
        echo "  trigger fires — an unprivileged `authenticated` write still ran\n";
        echo "  its triggers with every grant removed.\n";
    } else {
        echo "  VERDICT: do NOT revoke. The grants are load-bearing — leave them\n";
        echo "  as the source has them and silence the linter another way.\n";
    }
} catch (Throwable $e) {
    echo "  Signup FAILED: " . scrub($e->getMessage(), $password) . "\n";
    echo "\n  VERDICT: do NOT revoke — see the error above.\n";
} finally {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
        $rolledBack = true;
    }
}

echo "\n", str_repeat('-', 78), "\n";
echo $rolledBack
    ? "Rolled back. No grant was changed and no user was created.\n"
    : "WARNING: transaction was not open at the end — verify state by hand.\n";

// Prove it, rather than asserting it.
$left = $pdo->prepare('select count(*) from auth.users where email = ?');
$left->execute([$testEmail]);
printf("Test user rows remaining: %d (expected 0)\n", (int) $left->fetchColumn());

$check = $pdo->query(TRIGGER_FUNCTIONS_SQL)->fetchAll();
$changed = false;
foreach ($check as $i => $f) {
    if ($f['granted_to'] !== $funcs[$i]['granted_to']) {
        $changed = true;
    }
}
echo $changed
    ? "WARNING: grants differ from the start state — inspect manually.\n"
    : "Grants identical to the start state.\n";
