<?php

/**
 * Calls OrderLifecycleController@broadcast the way the console does, with an
 * admin profile already attached (the middleware's job), so the controller and
 * its response are exercised rather than just the service underneath.
 *
 * Rolled back.
 *
 * usage: & C:\php84\php.exe scripts/debug-broadcast-endpoint.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Http\Controllers\Api\OrderLifecycleController;
use App\Models\Order;
use App\Models\Profile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

$admin = Profile::query()->where('role', 'admin')->firstOrFail();
$order = Order::query()
    ->where('lifecycle_state', 'order_placed')
    ->whereNull('courier_id')
    ->orderByDesc('created_at')
    ->firstOrFail();

echo "order #{$order->order_no}\n";
echo "port  : " . config('database.connections.pgsql.port') . "\n\n";

$request = Request::create("/api/orders/{$order->id}/broadcast", 'POST', [], [], [], [
    'CONTENT_TYPE' => 'application/json',
    'HTTP_ACCEPT' => 'application/json',
], json_encode([]));
$request->attributes->set('profile', $admin);
$request->setUserResolver(fn () => $admin);

DB::beginTransaction();
try {
    $response = app(OrderLifecycleController::class)->broadcast($request, $order);
    echo 'HTTP ' . $response->getStatusCode() . "\n";
    echo mb_substr($response->getContent(), 0, 400) . "\n";
} catch (Throwable $e) {
    echo 'FAILED: ' . get_class($e) . "\n" . $e->getMessage() . "\n";
} finally {
    DB::rollBack();
    echo "\n(rolled back)\n";
}
