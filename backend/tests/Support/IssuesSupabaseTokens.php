<?php

namespace Tests\Support;

use App\Models\Profile;

/**
 * Mint the access tokens the API expects, for tests that go over HTTP.
 *
 * HS256 rather than ES256: the asymmetric path needs a live JWKS endpoint to
 * fetch verification keys from, which a test cannot have. Both paths are
 * chosen from the token header by the middleware, so exercising the routes
 * over HS256 tests the same routing, authorisation and controller code — the
 * signature verification itself has its own tests in SupabaseEs256TokenTest
 * and SupabaseTokenTest.
 */
trait IssuesSupabaseTokens
{
    protected function supabaseSecret(): string
    {
        return 'test-jwt-secret';
    }

    /**
     * An Authorization header carrying a token for this profile.
     *
     * The `iss` claim is derived from the configured project URL because the
     * middleware checks it whenever a URL is set. Leaving it out works only
     * while the URL is empty, which quietly couples every test that uses this
     * to that one config value.
     *
     * @return array<string, string>
     */
    protected function as(Profile $profile): array
    {
        $enc = fn (string $raw) => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');

        $claims = [
            'sub' => $profile->id,
            'role' => 'authenticated',
            'aud' => 'authenticated',
            'exp' => time() + 3600,
        ];

        $url = config('services.supabase.url');
        if (is_string($url) && $url !== '') {
            $claims['iss'] = rtrim($url, '/').'/auth/v1';
        }

        $header = $enc(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = $enc(json_encode($claims));
        $sig = $enc(hash_hmac('sha256', "{$header}.{$payload}", $this->supabaseSecret(), true));

        return ['Authorization' => "Bearer {$header}.{$payload}.{$sig}"];
    }
}
