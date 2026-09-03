<?php

use Illuminate\Support\Facades\Route;

/*
 * This app serves two things: a JSON API under /api, and the admin console.
 * Nothing else has a reason to be at the root, and Laravel's stock welcome
 * page there reads as "the API is running" to anyone looking for the console.
 * Send them where they were going.
 */
Route::redirect('/', '/admin');

/*
 * The admin console. Served by Laravel rather than shipped in the phone app:
 * facility work happens at a desk, and dispatch controls in every install
 * would widen the blast radius for no benefit.
 *
 * The page itself is public — it holds no data. Everything it renders comes
 * from /api/admin/*, which requires an admin Supabase token, so an anonymous
 * visitor gets a login form and nothing else.
 */
Route::view('/admin', 'admin')
    ->middleware(\App\Http\Middleware\AdminConsoleHeaders::class)
    ->name('admin');
