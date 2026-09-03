<?php

/**
 * broadcast()'s steps in ONE transaction, each fenced by a nested transaction
 * (Laravel turns those into savepoints) so the first real error is reported
 * with its own message rather than aborting everything after it.
 *
 * Each step passes alone and the sequence fails, so the order matters.
 * Everything is rolled back.
 *
 * usage: & C:\php84\php.exe scripts/debug-broadcast-steps.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\CourierAssignment;
use App\Models\CourierDetail;
use App\Models\Order;
use App\Models\Profile;
use App\Services\OrderLifecycleService;
use App\Support\OrderLifecycle;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

$admin = Profile::query()->where('role', 'admin')->firstOrFail();
$order = Order::query()
    ->where('lifecycle_state', 'order_placed')
    ->whereNull('courier_id')
    ->orderByDesc('created_at')
    ->firstOrFail();
$courierId = CourierDetail::query()->where('is_active', true)->value('id');

echo "order #{$order->order_no}, courier {$courierId}\n\n";

$now = Carbon::now();
$failed = false;

$step = function (string $label, callable $fn) use (&$failed) {
    if ($failed) { echo "  --  {$label} (skipped)\n"; return; }
    DB::beginTransaction(); // nested -> SAVEPOINT
    try {
        $fn();
        DB::commit();
        echo "  ok  {$label}\n";
    } catch (Throwable $e) {
        DB::rollBack();
        $failed = true;
        echo "BAD   {$label}\n";
        echo '      ' . get_class($e) . "\n";
        echo '      ' . str_replace("\n", "\n      ", $e->getMessage()) . "\n";
    }
};

DB::listen(function ($query) {
    echo '       SQL  ' . preg_replace('/\s+/', ' ', $query->sql) . "\n";
    echo '       ARG  ' . json_encode($query->bindings, JSON_UNESCAPED_UNICODE) . "\n";
});

DB::beginTransaction();

$step('courier_assignments updateOrCreate', function () use ($order, $courierId, $now) {
    CourierAssignment::query()->updateOrCreate(
        ['order_id' => $order->id, 'courier_id' => $courierId],
        ['offered_at' => $now, 'created_at' => $now],
    );
});

$step('  sanity check 1: select 1', function () { DB::select('select 1'); });

$step('orders approved_at save', function () use ($order, $now) {
    $order->forceFill(['approved_at' => $order->approved_at ?? $now])->save();
});

$step('  sanity check 2: select 1', function () { DB::select('select 1'); });

// transition() opened as its own steps, because fencing it whole only says
// "something inside failed".
$to = OrderLifecycle::ASSIGNING_COURIERS;

$step('transition: orders forceFill + save', function () use ($order, $to, $now) {
    $changes = [
        'lifecycle_state' => $to,
        'status' => OrderLifecycle::LEGACY_STATUS[$to],
    ];
    if ($column = OrderLifecycle::TIMESTAMP_COLUMN[$to] ?? null) {
        $changes[$column] = $now;
    }
    $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
    $locked->forceFill($changes)->save();
});

$step('  sanity check 3: select 1', function () { DB::select('select 1'); });

$step('transition: order_status_logs create', function () use ($order, $admin, $to, $now) {
    \App\Models\OrderStatusLog::query()->create([
        'order_id' => $order->id,
        'from_state' => 'order_placed',
        'to_state' => $to,
        'actor_id' => $admin->id,
        'actor_role' => 'admin',
        'note' => null,
        'created_at' => $now,
    ]);
});

$step('  sanity check 4: select 1', function () { DB::select('select 1'); });

$step('transition: notifyCustomer', function () use ($order, $admin, $to) {
    $service = app(OrderLifecycleService::class);
    $method = new ReflectionMethod($service, 'notifyCustomer');
    $method->setAccessible(true);
    $method->invoke($service, $order, $to, $admin);
});

$step('  sanity check 5: select 1', function () { DB::select('select 1'); });

DB::rollBack();
echo "\n(rolled back)\n";
