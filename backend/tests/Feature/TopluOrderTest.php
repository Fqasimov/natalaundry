<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Profile;
use App\Services\CatalogService;
use App\Services\GiftBoxService;
use App\Services\OrderService;
use App\Services\PricingService;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

/**
 * "Toplu" — the bulk flow: fixed deposit up front, courier counts on pickup,
 * real total settled against the deposit afterwards.
 */
class TopluOrderTest extends TestCase
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
        return Profile::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+994500000000',
            'role' => 'user',
            'wallet_balance' => 0,
            'created_at' => now(),
        ], $attributes));
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'collection_time' => 'Sabah, 18:00 - 20:00',
            'address' => 'Bakı, Nizami küç. 10',
        ], $overrides);
    }

    private function bulkOrderReadyToCount(Profile $customer, Profile $courier): Order
    {
        $order = $this->orders->createBulk($customer, $this->payload());
        $order->forceFill(['courier_id' => $courier->id, 'status' => 'collecting'])->save();

        return $order->fresh();
    }

    public function test_it_creates_a_bulk_order_holding_only_the_deposit(): void
    {
        $order = $this->orders->createBulk($this->customer(), $this->payload());

        $this->assertSame('toplu', $order->service_type);
        $this->assertSame('0.00', (string) $order->subtotal);
        $this->assertSame('20.00', (string) $order->deposit_amount);
        // Total mirrors the deposit — it is genuinely all that's owed so far.
        $this->assertSame('20.00', (string) $order->total);
        $this->assertNull($order->counted_total);
        $this->assertSame('deposit_paid', $order->payment_status);
        $this->assertCount(0, $order->items);
    }

    public function test_bulk_orders_skip_the_photo_requirement(): void
    {
        // Itemised orders demand three photos; there is nothing to photograph
        // before a bulk load has even been collected.
        $order = $this->orders->createBulk($this->customer(), $this->payload());

        $this->assertSame([], $order->item_photos);
    }

    public function test_counting_above_the_deposit_leaves_a_balance_due(): void
    {
        $customer = $this->customer();
        $courier = $this->customer(['role' => 'courier']);
        $order = $this->bulkOrderReadyToCount($customer, $courier);

        $this->orders->countBulk($order, $courier, 47.50);
        $order->refresh();

        $this->assertSame('47.50', (string) $order->counted_total);
        $this->assertSame('47.50', (string) $order->total);
        $this->assertSame('balance_due', $order->payment_status);
        $this->assertNotNull($order->counted_at);
        $this->assertSame($courier->id, $order->counted_by);
        // Nothing refunded — the customer still owes the difference.
        $this->assertSame('0.00', (string) $customer->fresh()->wallet_balance);
    }

    public function test_counting_below_the_deposit_refunds_the_difference(): void
    {
        $customer = $this->customer();
        $courier = $this->customer(['role' => 'courier']);
        $order = $this->bulkOrderReadyToCount($customer, $courier);

        $this->orders->countBulk($order, $courier, 12.00);

        $this->assertSame('8.00', (string) $customer->fresh()->wallet_balance);
        $this->assertSame('paid', $order->fresh()->payment_status);
        $this->assertDatabaseHas('wallet_transactions', [
            'user_id' => $customer->id,
            'kind' => 'refund',
        ]);
    }

    public function test_counting_exactly_the_deposit_settles_without_a_refund(): void
    {
        $customer = $this->customer();
        $courier = $this->customer(['role' => 'courier']);
        $order = $this->bulkOrderReadyToCount($customer, $courier);

        $this->orders->countBulk($order, $courier, 20.00);

        $this->assertSame('0.00', (string) $customer->fresh()->wallet_balance);
        $this->assertSame('paid', $order->fresh()->payment_status);
    }

    public function test_an_order_cannot_be_counted_twice(): void
    {
        $customer = $this->customer();
        $courier = $this->customer(['role' => 'courier']);
        $order = $this->bulkOrderReadyToCount($customer, $courier);

        $this->orders->countBulk($order, $courier, 5.00);
        // A double submission must not refund the difference a second time.
        $this->assertSame('15.00', (string) $customer->fresh()->wallet_balance);

        $this->expectException(RuntimeException::class);
        $this->orders->countBulk($order->fresh(), $courier, 5.00);
    }

    public function test_only_the_assigned_courier_can_count(): void
    {
        $customer = $this->customer();
        $courier = $this->customer(['role' => 'courier']);
        $stranger = $this->customer(['role' => 'courier']);
        $order = $this->bulkOrderReadyToCount($customer, $courier);

        $this->expectException(RuntimeException::class);
        $this->orders->countBulk($order, $stranger, 30.00);
    }

    public function test_itemised_orders_cannot_be_counted(): void
    {
        $customer = $this->customer();
        $courier = $this->customer(['role' => 'courier']);

        $order = $this->orders->create($customer, [
            'items' => [['service_id' => 'dry_cleaning', 'item_id' => 'sweater', 'quantity' => 1]],
            'delivery_tier' => 'standard',
            'collection_time' => 'Sabah',
            'delivery_time' => 'Sabah',
            'item_photos' => ['a.jpg', 'b.jpg', 'c.jpg'],
        ]);
        $order->forceFill(['courier_id' => $courier->id])->save();

        $this->expectException(RuntimeException::class);
        $this->orders->countBulk($order->fresh(), $courier, 30.00);
    }

    public function test_a_negative_count_is_rejected(): void
    {
        $customer = $this->customer();
        $courier = $this->customer(['role' => 'courier']);
        $order = $this->bulkOrderReadyToCount($customer, $courier);

        $this->expectException(\InvalidArgumentException::class);
        $this->orders->countBulk($order, $courier, -5);
    }
}
