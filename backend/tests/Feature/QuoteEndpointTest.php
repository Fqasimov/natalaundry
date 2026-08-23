<?php

namespace Tests\Feature;

use App\Models\Profile;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The quote a customer is shown must be the price they are charged. The
 * endpoint used to take a price per line from the request, so any drift
 * between the app's offline catalogue and the server's would show one total
 * at checkout and take another at order time.
 */
class QuoteEndpointTest extends TestCase
{
    private const SECRET = 'test-jwt-secret';

    private string $userId;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('services.supabase.jwt_secret', self::SECRET);
        config()->set('services.supabase.url', '');

        $this->userId = (string) Str::uuid();
        Profile::forceCreate([
            'id' => $this->userId,
            'name' => 'Test',
            'phone' => '+994500000000',
            'role' => 'customer',
        ]);
    }

    public function test_a_quote_is_priced_from_the_catalogue(): void
    {
        $response = $this->postJson('/api/orders/quote', [
            'items' => [['service_id' => 'dry_cleaning', 'item_id' => 'coat', 'quantity' => 1]],
            'delivery_tier' => 'standard',
        ], $this->auth())->assertOk();

        $catalogPrice = (float) config('catalog.dry_cleaning.coat.price');
        $this->assertEqualsWithDelta($catalogPrice, (float) $response->json("subtotal"), 0.001);
    }

    /** A price in the body is not a price — it is ignored. */
    public function test_a_price_sent_by_the_client_is_not_used(): void
    {
        $response = $this->postJson('/api/orders/quote', [
            'items' => [[
                'service_id' => 'dry_cleaning',
                'item_id' => 'coat',
                'quantity' => 1,
                'price' => 0.01,
            ]],
            'delivery_tier' => 'standard',
        ], $this->auth())->assertOk();

        $this->assertNotSame(0.01, $response->json('subtotal'));
        $this->assertGreaterThan(1, $response->json('total'));
    }

    public function test_an_unknown_delivery_tier_is_rejected(): void
    {
        $this->postJson('/api/orders/quote', [
            'items' => [['service_id' => 'dry_cleaning', 'item_id' => 'coat', 'quantity' => 1]],
            'delivery_tier' => 'free_please',
        ], $this->auth())->assertStatus(422);
    }

    /** @return array<string, string> */
    private function auth(): array
    {
        $enc = fn (string $raw) => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
        $header = $enc(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = $enc(json_encode([
            'sub' => $this->userId,
            'role' => 'authenticated',
            'aud' => 'authenticated',
            'exp' => time() + 3600,
        ]));
        $sig = $enc(hash_hmac('sha256', "{$header}.{$payload}", self::SECRET, true));

        return ['Authorization' => "Bearer {$header}.{$payload}.{$sig}"];
    }
}
