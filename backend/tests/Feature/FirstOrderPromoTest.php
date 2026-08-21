<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Profile;
use App\Models\PromoCode;
use App\Services\PromoService;
use Illuminate\Support\Str;
use Tests\TestCase;

class FirstOrderPromoTest extends TestCase
{
    private PromoService $promo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->promo = app(PromoService::class);
    }

    private function customer(array $attributes = []): Profile
    {
        return Profile::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+994500000000',
            'role' => 'customer',
            'created_at' => now(),
        ], $attributes));
    }

    private function order(Profile $customer, string $status = 'pending'): Order
    {
        return Order::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'status' => $status,
            'delivery_tier' => 'standard',
            'service_type' => 'dry_cleaning',
            'subtotal' => 40,
            'discount' => 0,
            'delivery_fee' => 0,
            'total' => 40,
            'collection_time' => 'Sabah',
            'delivery_time' => 'Sabah',
            'is_outside_city' => false,
            'item_photos' => [],
            'created_at' => now(),
        ]);
    }

    public function test_a_new_customer_is_eligible_and_gets_twenty_percent(): void
    {
        $customer = $this->customer();

        $this->assertTrue($this->promo->isEligibleForFirstOrder($customer));
        $this->assertSame('ILK20', $this->promo->firstOrderCode());
        $this->assertSame(8.0, $this->promo->firstOrderDiscount($customer, 40));
    }

    public function test_the_offer_is_spent_once_an_order_exists(): void
    {
        $customer = $this->customer();
        $this->order($customer);

        $this->assertFalse($this->promo->isEligibleForFirstOrder($customer));
        $this->assertSame(0.0, $this->promo->firstOrderDiscount($customer, 40));
    }

    /** A cancelled attempt must not burn the welcome discount. */
    public function test_a_cancelled_order_does_not_consume_the_offer(): void
    {
        $customer = $this->customer();
        $this->order($customer, 'cancelled');

        $this->assertTrue($this->promo->isEligibleForFirstOrder($customer));
    }

    public function test_it_applies_automatically_with_no_code_entered(): void
    {
        $customer = $this->customer();

        $resolved = $this->promo->resolveForOrder($customer, 40);

        $this->assertSame('ILK20', $resolved['code']);
        $this->assertSame(8.0, $resolved['discount']);
    }

    /** A better typed-in code wins; a worse one doesn't downgrade the offer. */
    public function test_the_larger_discount_wins(): void
    {
        $customer = $this->customer();

        PromoCode::forceCreate([
            'id' => (string) Str::uuid(),
            'code' => 'BAKU50',
            'kind' => 'percent',
            'value' => 50,
            'min_subtotal' => 0,
            'redemptions' => 0,
            'active' => true,
            'created_at' => now(),
        ]);
        PromoCode::forceCreate([
            'id' => (string) Str::uuid(),
            'code' => 'SMALL5',
            'kind' => 'percent',
            'value' => 5,
            'min_subtotal' => 0,
            'redemptions' => 0,
            'active' => true,
            'created_at' => now(),
        ]);

        $better = $this->promo->resolveForOrder($customer, 40, 'BAKU50');
        $this->assertSame('BAKU50', $better['code']);
        $this->assertSame(20.0, $better['discount']);

        $worse = $this->promo->resolveForOrder($customer, 40, 'SMALL5');
        $this->assertSame('ILK20', $worse['code']);
        $this->assertSame(8.0, $worse['discount']);
    }

    public function test_a_returning_customer_keeps_a_valid_entered_code(): void
    {
        $customer = $this->customer();
        $this->order($customer);

        PromoCode::forceCreate([
            'id' => (string) Str::uuid(),
            'code' => 'BAKU20',
            'kind' => 'percent',
            'value' => 20,
            'min_subtotal' => 0,
            'redemptions' => 0,
            'active' => true,
            'created_at' => now(),
        ]);

        $resolved = $this->promo->resolveForOrder($customer, 40, 'BAKU20');
        $this->assertSame('BAKU20', $resolved['code']);
        $this->assertSame(8.0, $resolved['discount']);
    }

    public function test_the_first_order_code_is_seeded_as_a_real_row(): void
    {
        $code = $this->promo->ensureFirstOrderCode();

        $this->assertSame('ILK20', $code->code);
        $this->assertSame('percent', $code->kind);
        $this->assertSame('20.00', (string) $code->value);

        // Idempotent — a second call must not create a duplicate.
        $this->promo->ensureFirstOrderCode();
        $this->assertSame(1, PromoCode::query()->where('code', 'ILK20')->count());
    }

    public function test_redemptions_are_counted(): void
    {
        $customer = $this->customer();
        $this->promo->ensureFirstOrderCode();

        $order = $this->order($customer);
        $order->forceFill(['promo_code' => 'ILK20'])->save();

        $this->promo->recordRedemption($order);

        $this->assertSame(1, PromoCode::query()->where('code', 'ILK20')->first()->redemptions);
    }
}
