<?php

/**
 * Runs AdminController::couriers()'s query and prints what the endpoint would
 * return. The dialog's courier list is built from it, and if it comes back the
 * wrong shape the click on "Kuryerlərə göndər" throws inside forEach and looks
 * like nothing happened at all.
 *
 * usage: & C:\php84\php.exe scripts/debug-couriers-endpoint.php
 */

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\CourierDetail;
use App\Models\Profile;

try {
    $couriers = Profile::query()
        ->where('role', 'courier')
        ->orderBy('name')
        ->get(['id', 'name', 'phone']);

    $details = CourierDetail::query()
        ->whereIn('id', $couriers->pluck('id'))
        ->get()
        ->keyBy('id');

    $payload = $couriers->map(function (Profile $courier) use ($details) {
        $detail = $details->get($courier->id);

        return [
            'id' => $courier->id,
            'name' => $courier->name,
            'phone' => $courier->phone,
            'is_active' => (bool) ($detail->is_active ?? false),
            'current_lat' => $detail->current_lat ?? null,
            'current_lng' => $detail->current_lng ?? null,
            'last_location_update' => $detail->last_location_update ?? null,
        ];
    })->values();

    echo json_encode(['data' => $payload], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), "\n";
    echo "\ncouriers returned: " . $payload->count() . "\n";
    echo 'on shift        : ' . $payload->where('is_active', true)->count() . "\n";
} catch (Throwable $e) {
    echo 'FAILED: ' . get_class($e) . "\n" . $e->getMessage() . "\n";
}
