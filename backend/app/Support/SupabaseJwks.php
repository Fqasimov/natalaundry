<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The project's public JWT signing keys.
 *
 * Supabase has moved from a single shared HS256 secret to asymmetric ES256
 * signing keys, published at /auth/v1/.well-known/jwks.json. Those keys are
 * public by design — they only verify signatures, they cannot create them —
 * so unlike SUPABASE_JWT_SECRET there is nothing here to keep out of logs or
 * out of source control.
 *
 * Keys are cached, because fetching them on every request would put an
 * outbound HTTP call in the path of every authenticated API call. A token
 * whose `kid` is not in the cached set forces one refresh — that is what
 * makes key rotation work without a deploy — and the refresh is rate-limited
 * so an attacker cannot turn unknown-kid tokens into a request amplifier.
 */
class SupabaseJwks
{
    private const CACHE_KEY = 'supabase:jwks';

    private const CACHE_TTL = 3600;

    /** Shortest gap between refreshes triggered by an unknown `kid`. */
    private const REFRESH_COOLDOWN = 60;

    /**
     * The verification key for a `kid`, as a PEM public key, or null.
     */
    public function keyFor(string $kid): ?string
    {
        $keys = $this->keys();

        if (! isset($keys[$kid])) {
            // Unknown kid: either the project rotated its keys, or the token
            // is junk. Refresh once, at most once per cooldown.
            if ($this->refreshAllowed()) {
                $keys = $this->keys(force: true);
            }
        }

        return $keys[$kid] ?? null;
    }

    /**
     * @return array<string, string> kid => PEM
     */
    private function keys(bool $force = false): array
    {
        if ($force) {
            Cache::forget(self::CACHE_KEY);
        }

        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
            $url = rtrim((string) config('services.supabase.url'), '/');
            if ($url === '') {
                return [];
            }

            try {
                $response = Http::timeout(5)
                    ->retry(2, 200, throw: false)
                    ->get("{$url}/auth/v1/.well-known/jwks.json");
            } catch (\Throwable $e) {
                Log::warning('Could not fetch Supabase JWKS', ['error' => $e->getMessage()]);

                return [];
            }

            if ($response->failed()) {
                Log::warning('Supabase JWKS request failed', ['status' => $response->status()]);

                return [];
            }

            $keys = [];
            foreach ((array) ($response->json('keys') ?? []) as $jwk) {
                if (! is_array($jwk)) {
                    continue;
                }
                $kid = $jwk['kid'] ?? null;
                $pem = self::jwkToPem($jwk);
                if (is_string($kid) && $pem !== null) {
                    $keys[$kid] = $pem;
                }
            }

            return $keys;
        });
    }

    private function refreshAllowed(): bool
    {
        return Cache::add(self::CACHE_KEY.':cooldown', 1, self::REFRESH_COOLDOWN);
    }

    /**
     * Converts an EC P-256 JWK into a PEM public key.
     *
     * openssl_verify() wants a key, not a pair of coordinates, so the JWK's
     * x and y are wrapped in the DER SubjectPublicKeyInfo structure for
     * id-ecPublicKey / prime256v1 and base64'd into a PEM block. The prefix
     * below is that fixed structure up to the start of the point.
     *
     * @param  array<string, mixed>  $jwk
     */
    public static function jwkToPem(array $jwk): ?string
    {
        if (($jwk['kty'] ?? null) !== 'EC' || ($jwk['crv'] ?? null) !== 'P-256') {
            return null;
        }

        $x = self::base64UrlDecode((string) ($jwk['x'] ?? ''));
        $y = self::base64UrlDecode((string) ($jwk['y'] ?? ''));
        if ($x === null || $y === null || strlen($x) !== 32 || strlen($y) !== 32) {
            return null;
        }

        // SEQUENCE { SEQUENCE { OID ecPublicKey, OID prime256v1 },
        //            BIT STRING (0x00 unused, 0x04 uncompressed point) }
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d03010703420004').$x.$y;

        return "-----BEGIN PUBLIC KEY-----\n"
            .chunk_split(base64_encode($der), 64, "\n")
            ."-----END PUBLIC KEY-----\n";
    }

    /**
     * Converts a JWS ES256 signature to the DER form OpenSSL expects.
     *
     * JWS carries the signature as raw r‖s, 32 bytes each. OpenSSL wants
     * SEQUENCE { INTEGER r, INTEGER s }. DER integers are signed, so a value
     * whose top bit is set needs a leading 0x00 or it reads as negative.
     */
    public static function signatureToDer(string $signature): ?string
    {
        if (strlen($signature) !== 64) {
            return null;
        }

        $r = self::derInteger(substr($signature, 0, 32));
        $s = self::derInteger(substr($signature, 32, 32));
        $body = $r.$s;

        return "\x30".self::derLength(strlen($body)).$body;
    }

    private static function derInteger(string $value): string
    {
        // Drop leading zero bytes, then re-add one if the high bit is set.
        $value = ltrim($value, "\x00");
        if ($value === '') {
            $value = "\x00";
        }
        if (ord($value[0]) > 0x7F) {
            $value = "\x00".$value;
        }

        return "\x02".self::derLength(strlen($value)).$value;
    }

    private static function derLength(int $length): string
    {
        if ($length < 0x80) {
            return chr($length);
        }

        $bytes = '';
        while ($length > 0) {
            $bytes = chr($length & 0xFF).$bytes;
            $length >>= 8;
        }

        return chr(0x80 | strlen($bytes)).$bytes;
    }

    public static function base64UrlDecode(string $value): ?string
    {
        $remainder = strlen($value) % 4;
        if ($remainder) {
            $value .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return $decoded === false ? null : $decoded;
    }
}
