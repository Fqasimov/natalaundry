<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\GiftBoxController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\OrderLifecycleController;
use App\Http\Controllers\Api\TrackingController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\WalletController;
use Illuminate\Support\Facades\Route;

// The catalogue mirrors the public "Anyone can read active prices" policy.
Route::get('catalog', [CatalogController::class, 'index']);

// Everything else runs against the caller's Supabase access token.
Route::middleware('supabase')->group(function () {
    Route::get('profile', [ProfileController::class, 'show']);
    Route::patch('profile', [ProfileController::class, 'update']);

    Route::get('orders', [OrderController::class, 'index']);
    Route::post('orders', [OrderController::class, 'store']);
    Route::post('orders/quote', [OrderController::class, 'quote']);
    Route::post('orders/bulk', [OrderController::class, 'storeBulk']);
    Route::get('orders/available', [OrderController::class, 'available']);
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::post('orders/{order}/cancel', [OrderController::class, 'cancel']);
    Route::post('orders/{order}/claim', [OrderController::class, 'claim']);
    Route::post('orders/{order}/advance', [OrderController::class, 'advance']);
    Route::post('orders/{order}/count', [OrderController::class, 'count']);

    // Lifecycle: the nine-step collection -> laundry -> delivery flow.
    // 'available' is declared before the {order} routes so the literal
    // segment is not swallowed by the wildcard.
    Route::get('lifecycle/available', [OrderLifecycleController::class, 'available']);
    Route::post('orders/{order}/broadcast', [OrderLifecycleController::class, 'broadcast']);
    Route::post('orders/{order}/lifecycle/claim', [OrderLifecycleController::class, 'claim']);
    Route::post('orders/{order}/lifecycle/transition', [OrderLifecycleController::class, 'transition']);
    Route::get('orders/{order}/timeline', [OrderLifecycleController::class, 'timeline']);

    // Live tracking: courier writes, customer reads.
    Route::post('orders/{order}/location', [TrackingController::class, 'store']);
    Route::get('orders/{order}/location', [TrackingController::class, 'show']);

    // Admin website. The dispatch and facility controls live in a browser
    // app, not in the phone app; these are the endpoints it drives.
    Route::get('admin/orders', [AdminController::class, 'orders']);
    Route::get('admin/couriers', [AdminController::class, 'couriers']);

    Route::get('gift-boxes', [GiftBoxController::class, 'index']);
    Route::post('gift-boxes/open', [GiftBoxController::class, 'open']);

    Route::get('wallet', [WalletController::class, 'index']);
});
