<?php

/**
 * Times the admin board's own query on whichever port .env names, so "the
 * board is slow" becomes a number instead of an impression.
 *
 * usage: & C:\php84\php.exe scripts/debug-timing.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Order;
use Illuminate\Support\Facades\DB;

echo 'port : ' . config('database.connections.pgsql.port') . "\n";

$time = function (string $label, callable $fn, int $runs = 3) {
    $best = INF;
    for ($i = 0; $i < $runs; $i++) {
        $start = microtime(true);
        $fn();
        $best = min($best, (microtime(true) - $start) * 1000);
    }
    printf("  %-42s %7.0f ms (best of %d)\n", $label, $best, $runs);
};

$time('connect + select 1', fn () => DB::select('select 1'));

$time('admin board query (orders + items)', function () {
    Order::query()
        ->with('items')
        ->whereNotIn('lifecycle_state', ['delivered', 'cancelled'])
        ->orderByDesc('created_at')
        ->get();
});

$time('count orders', fn () => Order::query()->count());
