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
        if (! $userId) {
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
        if (isset($claims['exp']) && $now >= (int) $claims['exp']) {
            return null;
        }
        if (isset($claims['nbf']) && $now < (int) $claims['nbf']) {
            return null;
        }

        return $claims;
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
