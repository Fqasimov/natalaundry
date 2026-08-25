<?php

namespace Tests\Feature;

use App\Models\Profile;
use App\Support\SupabaseJwks;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ES256 tokens, which is what the live project now issues.
 *
 * A real P-256 keypair is generated per test and its public half served as a
 * fake JWKS endpoint, so these exercise the actual signature path — the DER
 * conversions included — rather than a stub that returns true.
 */
class SupabaseEs256TokenTest extends TestCase
{
    private array $keypair;

    private string $kid = 'test-key-1';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        config([
            'services.supabase.url' => 'https://project.supabase.co',
            'services.supabase.jwt_secret' => null,
        ]);

        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        $details = openssl_pkey_get_details($key);

        $this->keypair = [
            'private' => $key,
            'x' => $details['ec']['x'],
            'y' => $details['ec']['y'],
        ];

        Http::fake([
            '*/.well-known/jwks.json' => Http::response([
                'keys' => [[
                    'kty' => 'EC',
                    'crv' => 'P-256',
                    'alg' => 'ES256',
                    'use' => 'sig',
                    'kid' => $this->kid,
                    'x' => $this->b64($this->keypair['x']),
                    'y' => $this->b64($this->keypair['y']),
                ]],
            ]),
        ]);
    }

    private function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private function profile(): Profile
    {
        return Profile::forceCreate([
            'id' => (string) Str::uuid(),
            'name' => 'ES256 Customer',
            'phone' => '+994500000001',
            'role' => 'customer',
            'wallet_balance' => 0,
        ]);
    }

    /** Signs a real ES256 JWT with the generated key. */
    private function token(array $claims = [], ?string $kid = null): string
    {
        $header = $this->b64(json_encode([
            'alg' => 'ES256',
            'typ' => 'JWT',
            'kid' => $kid ?? $this->kid,
        ]));

        $payload = $this->b64(json_encode(array_merge([
            'sub' => (string) Str::uuid(),
            'role' => 'authenticated',
            'aud' => 'authenticated',
            'iss' => 'https://project.supabase.co/auth/v1',
            'exp' => time() + 3600,
        ], $claims)));

        openssl_sign("{$header}.{$payload}", $der, $this->keypair['private'], OPENSSL_ALGO_SHA256);

        // OpenSSL emits DER; JWS wants raw r‖s, so unpack it back.
        $raw = $this->derToRaw($der);

        return "{$header}.{$payload}.".$this->b64($raw);
    }

    private function derToRaw(string $der): string
    {
        $offset = 2;
        // r
        $offset++; // 0x02
        $len = ord($der[$offset++]);
        $r = ltrim(substr($der, $offset, $len), "\x00");
        $offset += $len;
        // s
        $offset++; // 0x02
        $len = ord($der[$offset++]);
        $s = ltrim(substr($der, $offset, $len), "\x00");

        return str_pad($r, 32, "\x00", STR_PAD_LEFT).str_pad($s, 32, "\x00", STR_PAD_LEFT);
    }

    public function test_a_valid_es256_token_authenticates(): void
    {
        $profile = $this->profile();

        $this->withHeader('Authorization', 'Bearer '.$this->token(['sub' => $profile->id]))
            ->getJson('/api/profile')
            ->assertOk();
    }

    /**
     * An attacker's own keypair, presented under the real key's `kid`. The
     * signature must be checked against the published key, not merely be
     * well-formed.
     */
    public function test_a_token_signed_by_a_different_key_is_rejected(): void
    {
        $profile = $this->profile();

        // Sign with a key the JWKS has never heard of, while still claiming
        // the legitimate kid.
        $attacker = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        $this->keypair['private'] = $attacker;

        $this->withHeader('Authorization', 'Bearer '.$this->token(['sub' => $profile->id]))
            ->getJson('/api/profile')
            ->assertStatus(401);
    }

    public function test_an_unknown_kid_is_rejected(): void
    {
        $profile = $this->profile();

        $this->withHeader('Authorization', 'Bearer '.$this->token(['sub' => $profile->id], 'no-such-key'))
            ->getJson('/api/profile')
            ->assertStatus(401);
    }

    /**
     * The classic JWT attack: strip the signature and claim the token needs
     * none. The algorithm must never be taken from the token alone.
     */
    public function test_alg_none_is_rejected(): void
    {
        $profile = $this->profile();

        $header = $this->b64(json_encode(['alg' => 'none', 'typ' => 'JWT']));
        $payload = $this->b64(json_encode([
            'sub' => $profile->id,
            'role' => 'authenticated',
            'aud' => 'authenticated',
            'iss' => 'https://project.supabase.co/auth/v1',
            'exp' => time() + 3600,
        ]));

        $this->withHeader('Authorization', "Bearer {$header}.{$payload}.")
            ->getJson('/api/profile')
            ->assertStatus(401);
    }

    /**
     * An ES256 public key must not be usable as an HS256 shared secret —
     * the other classic confusion attack.
     */
    public function test_algorithm_confusion_is_rejected(): void
    {
        $profile = $this->profile();
        $pem = SupabaseJwks::jwkToPem([
            'kty' => 'EC', 'crv' => 'P-256',
            'x' => $this->b64($this->keypair['x']),
            'y' => $this->b64($this->keypair['y']),
        ]);

        $header = $this->b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT', 'kid' => $this->kid]));
        $payload = $this->b64(json_encode([
            'sub' => $profile->id,
            'role' => 'authenticated',
            'aud' => 'authenticated',
            'iss' => 'https://project.supabase.co/auth/v1',
            'exp' => time() + 3600,
        ]));
        $forged = $this->b64(hash_hmac('sha256', "{$header}.{$payload}", $pem, true));

        $this->withHeader('Authorization', "Bearer {$header}.{$payload}.{$forged}")
            ->getJson('/api/profile')
            ->assertStatus(401);
    }

    public function test_an_expired_es256_token_is_rejected(): void
    {
        $profile = $this->profile();

        $this->withHeader('Authorization', 'Bearer '.$this->token([
            'sub' => $profile->id,
            'exp' => time() - 10,
        ]))->getJson('/api/profile')->assertStatus(401);
    }

    public function test_an_anon_key_role_is_rejected(): void
    {
        $profile = $this->profile();

        $this->withHeader('Authorization', 'Bearer '.$this->token([
            'sub' => $profile->id,
            'role' => 'anon',
        ]))->getJson('/api/profile')->assertStatus(401);
    }
}
