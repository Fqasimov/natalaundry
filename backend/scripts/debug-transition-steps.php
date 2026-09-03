<?php

/**
 * Runs transition()'s steps one at a time, each in its own transaction, so a
 * failure reports its own Postgres error instead of poisoning the next
 * statement into "current transaction is aborted".
 *
 * Every step is rolled back.
 *
 * usage: & C:\php84\php.exe scripts/debug-transition-steps.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\Profile;
use App\Support\OrderLifecycle;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

$admin = Profile::query()->where('role', 'admin')->firstOrFail();
$order = Order::query()
    ->where('lifecycle_state', 'order_placed')
    ->whereNull('courier_id')
    ->orderByDesc('created_at')
    ->firstOrFail();

$to = OrderLifecycle::ASSIGNING_COURIERS;
$now = Carbon::now();

function step(string $label, callable $fn): void
{
    DB::beginTransaction();
    try {
        $fn();
        echo "  ok  {$label}\n";
    } catch (Throwable $e) {
        echo "BAD   {$label}\n";
        echo '      ' . get_class($e) . "\n";
        echo '      ' . str_replace("\n", "\n      ", $e->getMessage()) . "\n";
    } finally {
        DB::rollBack();
    }
}

step('orders update (forceFill + save)', function () use ($order, $to, $now) {
    $changes = [
        'lifecycle_state' => $to,
        'status' => OrderLifecycle::LEGACY_STATUS[$to],
    ];
    if ($column = OrderLifecycle::TIMESTAMP_COLUMN[$to] ?? null) {
        $changes[$column] = $now;
    }
    $fresh = Order::query()->whereKey($order->id)->firstOrFail();
    $fresh->forceFill($changes)->save();
});

step('order_status_logs create', function () use ($order, $admin, $to, $now) {
    OrderStatusLog::query()->create([
        'order_id' => $order->id,
        'from_state' => 'order_placed',
        'to_state' => $to,
        'actor_id' => $admin->id,
        'actor_role' => 'admin',
        'note' => null,
        'created_at' => $now,
    ]);
});

echo "\n(all rolled back)\n";
