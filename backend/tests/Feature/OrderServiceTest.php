<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Profile;
use App\Models\PromoCode;
use App\Services\CatalogService;
use App\Services\GiftBoxService;
use App\Services\OrderService;
use App\Services\PricingService;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Tests\TestCase;

class OrderServiceTest extends TestCase
{
    private OrderService $orders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->orders = new OrderService(
            new PricingService,
            new CatalogService,
            app(GiftBoxService::class),
        );
    }

    private function customer(array $attributes = []): Profile
    {
        // `id` is guarded on the model (it comes from Supabase Auth, never
        // from user input), so tests set it explicitly.
        return Profile::forceCreate(array_merge([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'name' => 'Test Müştəri',
            'phone' => '+994500000000',
            'role' => 'user',
            'created_at' => now(),
        ], $attributes));
    }

    /**
     * A customer who has ordered before.
     *
     * The ILK20 welcome discount applies automatically to a first order, so
     * tests that pin the base pricing arithmetic (the video's ₼37 + ₼5 = ₼42)
     * need a customer who is past it — otherwise they'd be asserting the
     * discounted total and the invariant would quietly stop being tested.
     */
    private function returningCustomer(array $attributes = []): Profile
    {
        $profile = $this->customer($attributes);

        Order::forceCreate([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'user_id' => $profile->id,
            'status' => 'completed',
            'delivery_tier' => 'standard',
            'service_type' => 'dry_cleaning',
            'subtotal' => 10,
            'discount' => 0,
            'delivery_fee' => 0,
            'total' => 10,
            'collection_time' => 'Dünən',
            'delivery_time' => 'Dünən',
            'is_outside_city' => false,
            'item_photos' => [],
            'created_at' => now()->subDay(),
        ]);

        return $profile;
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'items' => [
                ['service_id' => 'dry_cleaning', 'item_id' => 'sweater', 'quantity' => 3],
                ['service_id' => 'dry_cleaning', 'item_id' => 'trousers', 'quantity' => 1],
            ],
            'delivery_tier' => 'standard',
            'collection_time' => 'Sabah, 18:00 - 20:00',
            'delivery_time' => '8 avq, Ş., 18:00 - 20:00',
            'address' => 'Bakı, Nizami küç. 10',
            'item_photos' => ['a.jpg', 'b.jpg', 'c.jpg'],
        ], $overrides);
    }

    public function test_it_creates_an_order_priced_from_the_catalogue(): void
    {
        $order = $this->orders->create($this->returningCustomer(), $this->payload());

        // Sviter ₼9 × 3 + Şalvar ₼10 = ₼37, under the ₼40 threshold so ₼5
        // delivery applies — the exact figures the video shows.
        $this->assertSame('37.00', (string) $order->subtotal);
        $this->assertSame('5.00', (string) $order->delivery_fee);
        $this->assertSame('42.00', (string) $order->total);
        $this->assertSame('pending', $order->status);
        $this->assertSame('awaiting_admin', $order->dispatch_state);
        $this->assertCount(2, $order->items);
    }

    public function test_it_ignores_prices_supplied_by_the_client(): void
    {
        // A tampered client claiming the sweater costs ₼0 must not win.
        $payload = $this->payload();
        $payload['items'][0]['price'] = 0;
        $payload['items'][0]['item_name'] = 'Free sweater';

        $order = $this->orders->create($this->customer(), $payload);

        $this->assertSame('37.00', (string) $order->subtotal);
        $this->assertSame('Sviter', $order->items->firstWhere('item_id', 'sweater')->item_name);
    }

    public function test_it_requires_three_photos(): void
    {
        $this->expectException(ValidationException::class);
        $this->orders->create($this->customer(), $this->payload(['item_photos' => ['only-one.jpg']]));
    }

    /**
     * Discount resolution moved inside the create transaction, so a rejection
     * now happens mid-transaction. It must still surface as a validation
     * failure and leave nothing behind.
     */
    public function test_an_unknown_promo_code_is_rejected_and_writes_nothing(): void
    {
        $customer = $this->customer();
        $before = Order::query()->count();

        try {
            $this->orders->create($customer, $this->payload(['promo_code' => 'NOPE404']));
            $this->fail('an unknown promo code should be rejected');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('promo_code', $e->errors());
        }

        $this->assertSame($before, Order::query()->count(), 'a rejected order was still written');
    }

    public function test_it_rejects_an_unknown_delivery_tier(): void
    {
        $this->expectException(ValidationException::class);
        $this->orders->create($this->customer(), $this->payload(['delivery_tier' => 'teleport']));
    }

    public function test_it_rejects_an_unknown_catalogue_item(): void
    {
        $this->expectException(RuntimeException::class);
        $this->orders->create($this->customer(), $this->payload([
            'items' => [['service_id' => 'dry_cleaning', 'item_id' => 'spaceship', 'quantity' => 1]],
        ]));
    }

    public function test_a_valid_promo_code_discounts_the_order(): void
    {
        PromoCode::create([
            'code' => 'BAKU20',
            'kind' => 'percent',
            'value' => 20,
            'active' => true,
        ]);

        $order = $this->orders->create($this->customer(), $this->payload(['promo_code' => 'baku20']));

        // 20% of ₼37 = ₼7.40; total 37 + 5 - 7.40
        $this->assertSame('7.40', (string) $order->discount);
        $this->assertSame('34.60', (string) $order->total);
        $this->assertSame(1, PromoCode::where('code', 'BAKU20')->first()->redemptions);
    }

    public function test_an_unknown_promo_code_is_rejected(): void
    {
        $this->expectException(ValidationException::class);
        $this->orders->create($this->customer(), $this->payload(['promo_code' => 'NOPE']));
    }

    public function test_outside_city_adds_its_surcharge(): void
    {
        $order = $this->orders->create($this->returningCustomer(), $this->payload(['is_outside_city' => true]));

        $this->assertSame('10.00', (string) $order->delivery_fee);
        $this->assertSame('47.00', (string) $order->total);
    }

    /**
     * The welcome offer is applied by the server, not entered by the customer:
     * the payload carries no promo_code at all.
     */
    public function test_a_first_order_gets_the_welcome_discount(): void
    {
        $order = $this->orders->create($this->customer(), $this->payload());

        // ₼37 subtotal − 20% = ₼7.40 off, then the ₼5 under-threshold fee.
        $this->assertSame('7.40', (string) $order->discount);
        $this->assertSame('34.60', (string) $order->total);
        $this->assertSame('ILK20', $order->promo_code);
    }

    public function test_a_second_order_does_not_get_it_again(): void
    {
        $customer = $this->returningCustomer();
        $order = $this->orders->create($customer, $this->payload());

        $this->assertSame('0.00', (string) $order->discount);
        $this->assertNull($order->promo_code);
        $this->assertSame('42.00', (string) $order->total);
    }

    public function test_only_pending_orders_can_be_cancelled(): void
    {
        $order = $this->orders->create($this->customer(), $this->payload());
        $this->orders->cancel($order);
        $this->assertSame('cancelled', $order->fresh()->status);

        $other = $this->orders->create($this->customer(), $this->payload());
        $other->update(['status' => 'cleaning']);

        $this->expectException(RuntimeException::class);
        $this->orders->cancel($other->fresh());
    }

    public function test_a_courier_claims_and_advances_an_order(): void
    {
        $order = $this->orders->create($this->customer(), $this->payload());
        $courier = $this->customer(['role' => 'courier', 'name' => 'Kuryer']);

        $this->orders->claim($order, $courier);
        $order->refresh();

        $this->assertSame('collecting', $order->status);
        $this->assertSame($courier->id, $order->courier_id);
        $this->assertNotNull($order->assigned_at);

        $this->orders->advance($order, $courier);
        $this->assertSame('cleaning', $order->status);
        $this->assertNotNull($order->fresh()->collected_at);

        $this->orders->advance($order, $courier);
        $this->assertSame('delivering', $order->status);

        $this->orders->advance($order, $courier);
        $this->assertSame('completed', $order->status);
        $this->assertNotNull($order->fresh()->delivered_at);
    }

    public function test_an_order_cannot_be_claimed_twice(): void
    {
        $order = $this->orders->create($this->customer(), $this->payload());
        $first = $this->customer(['role' => 'courier']);
        $second = $this->customer(['role' => 'courier']);

        $this->orders->claim($order, $first);

        $this->expectException(RuntimeException::class);
        $this->orders->claim($order->fresh(), $second);
    }

    public function test_only_the_assigned_courier_can_advance(): void
    {
        $order = $this->orders->create($this->customer(), $this->payload());
        $courier = $this->customer(['role' => 'courier']);
        $stranger = $this->customer(['role' => 'courier']);

        $this->orders->claim($order, $courier);

        $this->expectException(RuntimeException::class);
        $this->orders->advance($order->fresh(), $stranger);
    }

    public function test_a_non_courier_cannot_claim(): void
    {
        $order = $this->orders->create($this->customer(), $this->payload());

        $this->expectException(RuntimeException::class);
        $this->orders->claim($order, $this->customer());
    }
}
