<?php

namespace Tests\Feature;

use App\Models\Profile;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The token middleware is the whole perimeter of this API, so its rejections
 * are worth pinning: everything past it assumes the caller is the subject of
 * a live access token issued by our own Supabase project.
 */
class SupabaseTokenTest extends TestCase
{
    private const SECRET = 'test-jwt-secret';

    private const URL = 'https://project.supabase.co';

    private string $userId;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.supabase.jwt_secret', self::SECRET);
        config()->set('services.supabase.url', self::URL);

        $this->userId = (string) Str::uuid();
        Profile::forceCreate([
            'id' => $this->userId,
            'name' => 'Test',
            'phone' => '+994500000000',
            'role' => 'customer',
        ]);
    }

    public function test_a_valid_token_is_accepted(): void
    {
        $this->getJson('/api/profile', $this->auth($this->claims()))
            ->assertOk();
    }

    public function test_a_token_without_expiry_is_rejected(): void
    {
        $claims = $this->claims();
        unset($claims['exp']);

        $this->getJson('/api/profile', $this->auth($claims))->assertUnauthorized();
    }

    public function test_an_expired_token_is_rejected(): void
    {
        $this->getJson('/api/profile', $this->auth($this->claims(['exp' => time() - 1])))
            ->assertUnauthorized();
    }

    /**
     * Supabase signs the anon and service_role API keys with the same secret
     * as user tokens. The anon key ships inside the mobile bundle, so it must
     * not be replayable here.
     */
    public function test_a_project_api_key_is_rejected(): void
    {
        $anonKey = $this->claims(['role' => 'anon']);
        unset($anonKey['sub']);

        $this->getJson('/api/profile', $this->auth($anonKey))->assertUnauthorized();
        $this->getJson('/api/profile', $this->auth($this->claims(['role' => 'service_role'])))
            ->assertUnauthorized();
    }

    public function test_a_token_from_another_project_is_rejected(): void
    {
        $this->getJson('/api/profile', $this->auth($this->claims([
            'iss' => 'https://someone-else.supabase.co/auth/v1',
        ])))->assertUnauthorized();
    }

    public function test_the_wrong_audience_is_rejected(): void
    {
        $this->getJson('/api/profile', $this->auth($this->claims(['aud' => 'admin'])))
            ->assertUnauthorized();
    }

    public function test_the_none_algorithm_is_rejected(): void
    {
        $header = $this->segment(['alg' => 'none', 'typ' => 'JWT']);
        $payload = $this->segment($this->claims());

        $this->getJson('/api/profile', ['Authorization' => "Bearer {$header}.{$payload}."])
            ->assertUnauthorized();
    }

    public function test_a_token_signed_with_the_wrong_secret_is_rejected(): void
    {
        $this->getJson('/api/profile', $this->auth($this->claims(), 'not-the-secret'))
            ->assertUnauthorized();
    }

    /** A non-uuid subject would reach Postgres as a cast error, not a miss. */
    public function test_a_malformed_subject_is_rejected(): void
    {
        $this->getJson('/api/profile', $this->auth($this->claims(['sub' => "' OR 1=1 --"])))
            ->assertUnauthorized();
    }

    public function test_a_token_for_an_unknown_user_is_forbidden(): void
    {
        $this->getJson('/api/profile', $this->auth($this->claims(['sub' => (string) Str::uuid()])))
            ->assertForbidden();
    }

    /** @return array<string, mixed> */
    private function claims(array $overrides = []): array
    {
        return array_merge([
            'sub' => $this->userId,
            'role' => 'authenticated',
            'aud' => 'authenticated',
            'iss' => self::URL.'/auth/v1',
            'exp' => time() + 3600,
        ], $overrides);
    }

    /** @return array<string, string> */
    private function auth(array $claims, ?string $secret = null): array
    {
        $header = $this->segment(['alg' => 'HS256', 'typ' => 'JWT']);
        $payload = $this->segment($claims);
        $signature = $this->encode(
            hash_hmac('sha256', "{$header}.{$payload}", $secret ?? self::SECRET, true),
        );

        return ['Authorization' => "Bearer {$header}.{$payload}.{$signature}"];
    }

    private function segment(array $data): string
    {
        return $this->encode(json_encode($data));
    }

    private function encode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }
}
