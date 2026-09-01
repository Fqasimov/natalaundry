<?php

namespace Tests\Feature;

use App\Models\Profile;
use Illuminate\Support\Str;
use Tests\Support\IssuesSupabaseTokens;
use Tests\TestCase;

/**
 * The blunt defences: response headers, request size caps, and the limiters
 * on the endpoints an attacker can reach without an account.
 */
class ApiHardeningTest extends TestCase
{
    use IssuesSupabaseTokens;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('services.supabase.jwt_secret', $this->supabaseSecret());
    }

    private function profile(): Profile
    {
        return Profile::forceCreate([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+994500000000',
            'role' => 'customer',
            'wallet_balance' => 0,
        ]);
    }

    public function test_api_responses_carry_the_security_headers(): void
    {
        $response = $this->getJson('/api/catalog');

        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'DENY');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

        // Order totals, addresses and phone numbers must not sit in a shared cache.
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));

        // Nothing here returns markup, so the policy forbids every source.
        $this->assertStringContainsString("default-src 'none'", $response->headers->get('Content-Security-Policy'));
    }

    public function test_an_order_cannot_carry_an_unbounded_number_of_lines(): void
    {
        $profile = $this->profile();

        // Each line costs a catalogue resolve and a row insert inside one
        // transaction, so an uncapped array is a way to pin a database
        // connection with a single request.
        $items = array_fill(0, 5000, [
            'service_id' => 'dry_cleaning',
            'item_id' => 'tshirt',
            'quantity' => 1,
        ]);

        $this->postJson('/api/orders', [
            'items' => $items,
            'delivery_tier' => 'standard',
            'collection_time' => 'Today, 2-4 PM',
            'delivery_time' => 'Tomorrow, 2-4 PM',
        ], $this->as($profile))->assertStatus(422);
    }

    public function test_the_quote_endpoint_is_capped_the_same_way(): void
    {
        $profile = $this->profile();

        $this->postJson('/api/orders/quote', [
            'items' => array_fill(0, 5000, [
                'service_id' => 'dry_cleaning',
                'item_id' => 'tshirt',
                'quantity' => 1,
            ]),
            'delivery_tier' => 'standard',
        ], $this->as($profile))->assertStatus(422);
    }

    public function test_the_public_payment_callback_is_rate_limited(): void
    {
        // Public by necessity, and every hit makes an outbound call to the
        // bank to re-read an order — so left open it turns one cheap request
        // into one bank API call. The limiter is what caps that.
        $limited = false;

        for ($i = 0; $i < 40; $i++) {
            $response = $this->get('/api/payments/callback?ID=nonexistent');
            if ($response->getStatusCode() === 429) {
                $limited = true;
                break;
            }
        }

        $this->assertTrue($limited, 'The payment callback accepted 40 unauthenticated hits.');
    }

    public function test_the_catalog_is_rate_limited(): void
    {
        $limited = false;

        for ($i = 0; $i < 40; $i++) {
            if ($this->getJson('/api/catalog')->getStatusCode() === 429) {
                $limited = true;
                break;
            }
        }

        $this->assertTrue($limited, 'The catalogue accepted 40 unauthenticated hits.');
    }

    public function test_a_customer_cannot_promote_themselves_through_the_profile_endpoint(): void
    {
        $profile = $this->profile();
        // Read back from the database: forceCreate leaves column defaults
        // (points defaults to 100) unset on the in-memory model.
        $pointsBefore = (int) $profile->fresh()->points;

        // role, wallet_balance and points are all writable columns on the row;
        // the only thing keeping them out is that they are not in the rules.
        $this->patchJson('/api/profile', [
            'name' => 'Legit Name',
            'role' => 'admin',
            'wallet_balance' => 99999,
            'points' => 99999,
        ], $this->as($profile))->assertOk();

        $fresh = $profile->fresh();
        $this->assertSame('customer', $fresh->role);
        $this->assertEqualsWithDelta(0.0, (float) $fresh->wallet_balance, 0.001);
        $this->assertSame($pointsBefore, (int) $fresh->points);
        $this->assertSame('Legit Name', $fresh->name);
    }
}
