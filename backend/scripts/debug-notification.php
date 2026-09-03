<?php

/**
 * Creates one notification exactly as OrderLifecycleService does, outside any
 * transaction, so Postgres reports its own error rather than "transaction is
 * aborted". Rolled back.
 *
 * usage: & C:\php84\php.exe scripts/debug-notification.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Notification;
use App\Models\Order;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$order = Order::query()->orderByDesc('created_at')->first();

DB::listen(function ($query) {
    echo '  SQL  ' . preg_replace('/\s+/', ' ', $query->sql) . "\n";
});

DB::beginTransaction();
try {
    Notification::query()->create([
        'id' => (string) Str::uuid(),
        'user_id' => $order->user_id,
        'kind' => 'assigning_couriers',
        'order_id' => $order->id,
        'title' => 'Nata Laundry',
        'body' => 'test',
        'read' => false,
        'payload' => ['key' => 'notifyAssigningCouriers', 'vars' => []],
        'created_at' => Carbon::now(),
    ]);
    echo "\ncreate SUCCEEDED\n";
} catch (Throwable $e) {
    echo "\nFAILED: " . get_class($e) . "\n" . $e->getMessage() . "\n";
} finally {
    DB::rollBack();
    echo "\n(rolled back)\n";
}
