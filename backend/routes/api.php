<?php

use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\GiftBoxController;
use App\Http\Controllers\Api\OrderController;
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
    Route::get('orders/available', [OrderController::class, 'available']);
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::post('orders/{order}/cancel', [OrderController::class, 'cancel']);
    Route::post('orders/{order}/claim', [OrderController::class, 'claim']);
    Route::post('orders/{order}/advance', [OrderController::class, 'advance']);

    Route::get('gift-boxes', [GiftBoxController::class, 'index']);
    Route::post('gift-boxes/open', [GiftBoxController::class, 'open']);

    Route::get('wallet', [WalletController::class, 'index']);
});
