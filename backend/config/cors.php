<?php

/**
 * Who may call this API from a browser.
 *
 * The mobile app is not affected by any of this — CORS is a browser
 * mechanism and a native HTTP client ignores it. It matters for exactly two
 * callers: the admin console, and the Expo web build during development.
 *
 * Laravel's default is `allowed_origins => ['*']`, and with no config file
 * present that default applied. This API is bearer-token authenticated rather
 * than cookie authenticated, so a wildcard was not immediately exploitable —
 * a cross-origin page still has no way to obtain the token. But it means any
 * site could script the API on behalf of anything that *does* hold one, and
 * the list of legitimate browser origins here is short and known, so there is
 * no reason to keep it open.
 */
$origins = array_values(array_filter(array_map(
    fn (string $origin) => rtrim(trim($origin), '/'),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')),
)));

return [
    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],

    // Falls back to the app's own origin, which is where the admin console is
    // served from. Add anything else through CORS_ALLOWED_ORIGINS.
    'allowed_origins' => $origins !== []
        ? $origins
        : array_values(array_filter([rtrim((string) config('app.url'), '/')])),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],

    'exposed_headers' => [],

    'max_age' => 3600,

    // No cookies are involved: the API authenticates with a bearer token, and
    // allowing credentials would forbid ever widening the origin list safely.
    'supports_credentials' => false,
];
