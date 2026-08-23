<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Response headers for the admin console.
 *
 * The console holds a staff access token in sessionStorage, so a single
 * injection anywhere on the page is an account takeover — that is exactly what
 * the stored XSS in the order board was. That hole is closed at the source, but
 * the page is hand-written vanilla JS with no build step, so the next one is a
 * plausible mistake. A nonce-based policy makes the class of bug non-exploitable
 * rather than relying on every future edit being careful.
 *
 * The nonce is generated per response and shared with the view; the page's one
 * <script> and one <style> carry it. connect-src has to allow the Supabase auth
 * endpoint, since staff sign in with their normal credentials.
 */
class AdminConsoleHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = Str::random(24);
        view()->share('cspNonce', $nonce);

        $response = $next($request);

        // The page calls APP_URL/api, which is usually but not necessarily this
        // origin, and the Supabase auth endpoint for sign-in. Both are named
        // rather than assumed, so a split deployment does not silently break.
        $origins = collect([
            config('app.url'),
            config('services.supabase.url'),
        ])->filter()->map(fn ($url) => rtrim((string) $url, '/'))->unique()->implode(' ');

        $policy = [
            "default-src 'none'",
            "script-src 'nonce-{$nonce}'",
            "style-src 'nonce-{$nonce}'",
            'connect-src '.trim("'self' {$origins}"),
            "img-src 'self' data:",
            "font-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
        ];

        $response->headers->set('Content-Security-Policy', implode('; ', $policy));
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'same-origin');
        // The board lists customer names, addresses and phone numbers.
        $response->headers->set('X-Robots-Tag', 'noindex, nofollow');

        return $response;
    }
}
