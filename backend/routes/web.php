<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/*
 * The admin console. Served by Laravel rather than shipped in the phone app:
 * facility work happens at a desk, and dispatch controls in every install
 * would widen the blast radius for no benefit.
 *
 * The page itself is public — it holds no data. Everything it renders comes
 * from /api/admin/*, which requires an admin Supabase token, so an anonymous
 * visitor gets a login form and nothing else.
 */
Route::view('/admin', 'admin')->name('admin');
