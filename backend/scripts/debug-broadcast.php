<?php

/**
 * Runs OrderLifecycleService::broadcast() and reports the FIRST failure.
 *
 * The admin console shows SQLSTATE[25P02] "current transaction is aborted",
 * which only ever means an earlier statement in the same transaction failed —
 * the notification insert is simply the first one to notice afterwards. The
 * original error never reaches the log because the aborted-transaction error
 * replaces it.
 *
 * Everything runs inside an outer transaction that is always rolled back, so
 * this diagnoses without dispatching anything for real.
 *
 * usage: & C:\php84\php.exe scripts/debug-broadcast.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Order;
use App\Models\Profile;
use App\Services\OrderLifecycleService;
use Illuminate\Support\Facades\DB;

$admin = Profile::query()->where('role', 'admin')->first();
if (! $admin) {
    fwrite(STDERR, "no admin profile\n");
    exit(1);
}

$order = Order::query()
    ->where('lifecycle_state', 'order_placed')
    ->whereNull('courier_id')
    ->orderByDesc('created_at')
    ->first();

if (! $order) {
    fwrite(STDERR, "no order sitting at order_placed\n");
    exit(1);
}

echo "admin  : {$admin->id}\n";
echo "order  : {$order->id} (#{$order->order_no}, {$order->lifecycle_state})\n\n";

// Log every statement, so the one that actually fails is visible even though
// Postgres reports only the aborted transaction afterwards.
DB::listen(function ($query) {
    $sql = preg_replace('/\s+/', ' ', $query->sql);
    echo '  SQL  ' . mb_substr($sql, 0, 150) . "\n";
});

DB::beginTransaction();
try {
    app(OrderLifecycleService::class)->broadcast($order, $admin);
    echo "\nbroadcast SUCCEEDED\n";
} catch (Throwable $e) {
    echo "\nFAILED: " . get_class($e) . "\n";
    echo $e->getMessage() . "\n";
} finally {
    DB::rollBack();
    echo "\n(rolled back — nothing was dispatched)\n";
}
