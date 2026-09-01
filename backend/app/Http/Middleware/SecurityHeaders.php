<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Response headers that cost nothing and close off whole classes of attack.
 *
 * This is a JSON API and an OAuth-style redirect target, not a website, so
 * the set is deliberately narrow:
 *
 * - `nosniff` stops a browser deciding that a JSON error body is really HTML
 *   or a script. That matters here because the payment callback renders in a
 *   real browser, and an attacker who can influence any reflected value wants
 *   exactly that content-type confusion.
 * - `DENY` framing: nothing in this API is meant to be embedded, and the
 *   callback being frameable invites clickjacking on the payment return.
 * - A restrictive referrer policy keeps order ids out of the Referer header
 *   when the bank's page links onward — those ids are capability-ish, and
 *   they should not leak to a third party's logs.
 * - HSTS only over HTTPS, because sending it over plain HTTP is meaningless
 *   and pinning a dev machine to HTTPS breaks local work.
 * - A CSP that forbids everything: the API returns no markup, so nothing
 *   legitimate is lost, and an injected payload has nowhere to load from.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Cross-Origin-Resource-Policy', 'same-site');
        $response->headers->set(
            'Content-Security-Policy',
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        );

        // Responses carry order totals, addresses and phone numbers. None of
        // it should sit in a shared cache.
        $response->headers->set('Cache-Control', 'no-store, private');

        if ($request->secure()) {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains',
            );
        }

        return $response;
    }
}
