<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Profile;
use App\Support\OrderLifecycle;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * How many queries does each hot endpoint cost, and does that number grow
 * with the amount of data?
 *
 * A count that rises with row count is an N+1: fine at 15 orders, fatal at
 * 15,000. These assertions are deliberately loose — they are tripwires for
 * "this got worse", not targets. What matters is the *shape*: the same
 * endpoint measured at two sizes must cost the same number of queries.
 */
class QueryBudgetTest extends TestCase
{
    private const SECRET = 'test-jwt-secret';

    private Profile $customer;
    private Profile $courier;
    private Profile $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('services.supabase.jwt_secret', self::SECRET);
        config()->set('services.supabase.url', '');

        $this->customer = $this->profile(['phone' => '+994500000001']);
        $this->courier = $this->profile(['phone' => '+994500000002', 'role' => 'courier']);
        $this->admin = $this->profile(['phone' => '+994500000003', 'role' => 'admin']);
    }

    public function test_the_order_list_costs_the_same_at_five_orders_as_at_forty(): void
    {
        $this->seedOrders(5);
        $small = $this->countQueries(fn () => $this->getJson('/api/orders', $this->as($this->customer))->assertOk());

        $this->seedOrders(35);
        $large = $this->countQueries(fn () => $this->getJson('/api/orders', $this->as($this->customer))->assertOk());

        $this->assertSame(
            $small,
            $large,
            "GET /api/orders is N+1: {$small} queries for 5 orders, {$large} for 40"
        );
    }

    public function test_the_admin_feed_costs_the_same_at_five_orders_as_at_forty(): void
    {
        $this->seedOrders(5);
        $small = $this->countQueries(fn () => $this->getJson('/api/admin/orders', $this->as($this->admin))->assertOk());

        $this->seedOrders(35);
        $large = $this->countQueries(fn () => $this->getJson('/api/admin/orders', $this->as($this->admin))->assertOk());

        $this->assertSame(
            $small,
            $large,
            "GET /api/admin/orders is N+1: {$small} queries for 5 orders, {$large} for 40"
        );
    }

    public function test_the_courier_job_pool_does_not_scale_with_the_pool_size(): void
    {
        $this->seedOrders(5, ['lifecycle_state' => OrderLifecycle::ASSIGNING_COURIERS]);
        $small = $this->countQueries(fn () => $this->getJson('/api/lifecycle/available', $this->as($this->courier))->assertOk());

        $this->seedOrders(35, ['lifecycle_state' => OrderLifecycle::ASSIGNING_COURIERS]);
        $large = $this->countQueries(fn () => $this->getJson('/api/lifecycle/available', $this->as($this->courier))->assertOk());

        $this->assertSame(
            $small,
            $large,
            "GET /api/lifecycle/available is N+1: {$small} vs {$large}"
        );
    }

    /**
     * The single most-called endpoint in the system: every customer watching a
     * delivery polls it every few seconds. Its cost is multiplied by every
     * concurrent viewer, so it is the one that has to stay tiny.
     */
    public function test_the_tracking_poll_is_cheap(): void
    {
        $order = $this->seedOrders(1, [
            'lifecycle_state' => OrderLifecycle::COURIER_EN_ROUTE_DELIVERY,
            'courier_id' => $this->courier->id,
        ])[0];

        $n = $this->countQueries(
            fn () => $this->getJson("/api/orders/{$order->id}/location", $this->as($this->customer))->assertOk()
        );

        // Order + profile (auth) + latest fix + courier name. Anything much
        // above this is doing work per poll that it should not.
        $this->assertLessThanOrEqual(6, $n, "tracking poll costs {$n} queries");
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private function countQueries(callable $fn): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $fn();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    /** @return array<int, Order> */
    private function seedOrders(int $n, array $attributes = []): array
    {
        $made = [];
        for ($i = 0; $i < $n; $i++) {
            $order = Order::forceCreate(array_merge([
                'id' => (string) Str::uuid(),
                'user_id' => $this->customer->id,
                'status' => 'pending',
                'lifecycle_state' => OrderLifecycle::ORDER_PLACED,
                'delivery_tier' => 'standard',
                'service_type' => 'dry_cleaning',
                'subtotal' => 40, 'discount' => 0, 'delivery_fee' => 0, 'total' => 40,
                'collection_time' => 'Sabah, 18:00 - 20:00',
                'delivery_time' => 'Sabah, 18:00 - 20:00',
                'address' => 'Nizami küç. 22',
                'address_lat' => 40.3776, 'address_lng' => 49.8920,
                'is_outside_city' => false,
                'item_photos' => [],
                'created_at' => now(),
            ], $attributes));

            $order->items()->create([
                'id' => (string) Str::uuid(),
                'service_id' => 'dry_cleaning',
                'item_id' => 'dc-outer-4',
                'item_name' => 'Palto',
                'price' => 20,
                'quantity' => 2,
            ]);

            $made[] = $order;
        }

        return $made;
    }

    private function profile(array $attributes = []): Profile
    {
        return Profile::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+994500000000',
            'email' => Str::uuid().'@example.com',
            'language' => 'az',
            'points' => 0,
            'is_subscribed' => false,
            'role' => 'user',
            'wallet_balance' => 0,
            'created_at' => now(),
        ], $attributes));
    }

    private function as(Profile $profile): array
    {
        $enc = fn (string $raw) => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
        $header = $enc(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = $enc(json_encode([
            'sub' => $profile->id,
            'role' => 'authenticated',
            'aud' => 'authenticated',
            'exp' => time() + 3600,
        ]));
        $sig = $enc(hash_hmac('sha256', "{$header}.{$payload}", self::SECRET, true));

        return ['Authorization' => "Bearer {$header}.{$payload}.{$sig}"];
    }
}
