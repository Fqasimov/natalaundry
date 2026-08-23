<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->defineRateLimits();
    }

    /**
     * Rate limits, keyed by the authenticated user where there is one.
     *
     * Keyed by user id rather than IP because the whole app sits behind mobile
     * carrier NAT — an IP limit would be one limit shared by a neighbourhood.
     * Unauthenticated requests fall back to the IP, which is all there is.
     */
    private function defineRateLimits(): void
    {
        $key = fn (Request $request) => $request->attributes->get('profile')?->id
            ?? $request->ip();

        // The default for everything authenticated. Comfortably above what the
        // app does when a customer is using it hard.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)->by($key($request)));

        // Order creation. A customer placing more than a handful of orders an
        // hour is not a customer, and each one costs the business a courier
        // run to work out.
        RateLimiter::for('orders', fn (Request $request) => Limit::perHour(20)->by($key($request)));

        // Position pings. The courier loop sends one every few seconds while en
        // route, so this has to be generous — it is here to stop a runaway loop
        // or a replay flooding the table, not to pace the normal case.
        RateLimiter::for('tracking', fn (Request $request) => Limit::perMinute(60)->by($key($request)));
    }
}
