<?php

namespace App\Http\Middleware;

use App\Models\Profile;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifies the Supabase access token the mobile app already holds, so the
 * app keeps using Supabase Auth and this API simply trusts the same token.
 *
 * Supports HS256 (the project's legacy JWT secret, SUPABASE_JWT_SECRET). If
 * the project has been migrated to asymmetric JWT signing keys, verification
 * should be swapped for the project's JWKS endpoint — the claim handling
 * below stays the same.
 *
 * On success the resolved Profile is attached to the request.
 */
class AuthenticateSupabaseToken
{
    /**
     * The only role a caller of this API may present.
     *
     * Supabase signs the project's anon and service_role API keys with the
     * very same secret as user access tokens, so a valid signature alone says
     * nothing about who is calling. Those keys are long-lived and the anon one
     * ships inside the mobile bundle; pinning the role keeps a leaked key from
     * being replayed here as if it were a signed-in user.
     */
    private const REQUIRED_ROLE = 'authenticated';

    private const REQUIRED_AUDIENCE = 'authenticated';

    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->bearerToken($request);
        if (! $token) {
            return response()->json(['message' => 'Missing bearer token.'], 401);
        }

        $claims = $this->verify($token);
        if (! $claims) {
            return response()->json(['message' => 'Invalid or expired token.'], 401);
        }

        $userId = $claims['sub'] ?? null;
        // The column is a uuid, so a malformed subject would reach Postgres as
        // a cast error rather than a miss. Reject it here as a bad token.
        if (! is_string($userId) || ! $this->isUuid($userId)) {
            return response()->json(['message' => 'Token has no subject.'], 401);
        }

        $profile = Profile::find($userId);
        if (! $profile) {
            return response()->json(['message' => 'No profile for this user.'], 403);
        }

        $request->attributes->set('profile', $profile);
        $request->setUserResolver(fn () => $profile);

        return $next($request);
    }

    private function bearerToken(Request $request): ?string
    {
        $header = $request->header('Authorization', '');

        return str_starts_with($header, 'Bearer ')
            ? trim(substr($header, 7))
            : null;
    }

    /**
     * Verify an HS256 JWT and return its claims, or null if it fails.
     *
     * @return array<string, mixed>|null
     */
    private function verify(string $token): ?array
    {
        $secret = config('services.supabase.jwt_secret');
        if (! $secret) {
            return null;
        }

        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;

        $header = json_decode($this->base64UrlDecode($encodedHeader) ?: '', true);
        if (! is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            return null;
        }

        $expected = hash_hmac('sha256', "{$encodedHeader}.{$encodedPayload}", $secret, true);
        $provided = $this->base64UrlDecode($encodedSignature);
        if ($provided === null || ! hash_equals($expected, $provided)) {
            return null;
        }

        $claims = json_decode($this->base64UrlDecode($encodedPayload) ?: '', true);
        if (! is_array($claims)) {
            return null;
        }

        $now = time();

        // Expiry is required, not merely honoured when present: a token that
        // omits exp would otherwise be accepted forever, and every token
        // Supabase Auth issues carries one.
        if (! isset($claims['exp']) || ! is_numeric($claims['exp']) || $now >= (int) $claims['exp']) {
            return null;
        }
        if (isset($claims['nbf']) && is_numeric($claims['nbf']) && $now < (int) $claims['nbf']) {
            return null;
        }

        if (($claims['role'] ?? null) !== self::REQUIRED_ROLE) {
            return null;
        }
        if (! $this->audienceMatches($claims['aud'] ?? null)) {
            return null;
        }
        if (! $this->issuerMatches($claims['iss'] ?? null)) {
            return null;
        }

        return $claims;
    }

    /** `aud` may be a string or a list; either must name our audience. */
    private function audienceMatches(mixed $aud): bool
    {
        if (is_string($aud)) {
            return $aud === self::REQUIRED_AUDIENCE;
        }

        return is_array($aud) && in_array(self::REQUIRED_AUDIENCE, $aud, true);
    }

    /**
     * Tokens must come from this project's auth server.
     *
     * The expected issuer is derived from SUPABASE_URL so there is nothing
     * extra to configure. If that is unset — as it is in parts of the test
     * suite — the check is skipped rather than failing every request.
     */
    private function issuerMatches(mixed $iss): bool
    {
        $url = config('services.supabase.url');
        if (! is_string($url) || $url === '') {
            return true;
        }

        return is_string($iss) && $iss === rtrim($url, '/').'/auth/v1';
    }

    private function isUuid(string $value): bool
    {
        return (bool) preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            $value,
        );
    }

    private function base64UrlDecode(string $value): ?string
    {
        $remainder = strlen($value) % 4;
        if ($remainder) {
            $value .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
