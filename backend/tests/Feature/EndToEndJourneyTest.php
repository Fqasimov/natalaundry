<?php

namespace Tests\Feature;

use App\Models\CourierAssignment;
use App\Models\CourierLocation;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\Profile;
use App\Models\Reward;
use App\Models\UserReward;
use App\Support\OrderLifecycle;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\Support\IssuesSupabaseTokens;
use Tests\TestCase;

/**
 * The whole journey, over HTTP, in one test.
 *
 * Every other test in this suite exercises one service or one endpoint. This
 * one walks the route a real order takes — customer places it, pays, admin
 * broadcasts it, a courier claims it, drives it through nine states while
 * posting GPS, the customer watches the map, and the finished order yields a
 * gift box whose prize is then spent on the next order.
 *
 * It goes through the router and the auth middleware rather than calling
 * services directly, because that is where the seams actually are: a service
 * can be correct while the route that reaches it is not registered, not
 * authorised, or validating a different payload shape than the app sends.
 *
 * The three tables this leans on hardest — courier_assignments,
 * courier_locations, order_status_logs — did not exist in production until
 * 2026-08-27, so none of this chain had ever run against a real schema.
 */
class EndToEndJourneyTest extends TestCase
{
    use IssuesSupabaseTokens;

    private Profile $customer;
    private Profile $courier;
    private Profile $admin;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.supabase.jwt_secret', $this->supabaseSecret());
        // Empty URL keeps the middleware on the HS256 path; the ES256/JWKS
        // route has its own test and needs a live key server.
        config()->set('services.supabase.url', '');

        $this->customer = $this->profile(['name' => 'Müştəri', 'phone' => '+994500000001']);
        $this->courier = $this->profile(['name' => 'Kuryer', 'phone' => '+994500000002', 'role' => 'courier']);
        $this->admin = $this->profile(['name' => 'Admin', 'phone' => '+994500000003', 'role' => 'admin']);
    }

    /**
     * The whole thing, in order. Deliberately one test rather than several:
     * each step consumes the state the previous one produced, and splitting
     * it would mean rebuilding that state from fixtures — which is exactly
     * the coupling this is meant to check.
     */
    public function test_an_order_travels_from_basket_to_delivered_and_pays_out_a_prize(): void
    {
        // ── 1. Quote ─────────────────────────────────────────────────────
        // What the customer is shown before committing.
        $quote = $this->postJson('/api/orders/quote', [
            'items' => [
                ['service_id' => 'dry_cleaning', 'item_id' => 'dc-outer-4', 'quantity' => 2],
            ],
            'delivery_tier' => 'standard',
        ], $this->as($this->customer))->assertOk()->json();

        $this->assertGreaterThan(0, $quote['subtotal'], 'quote priced the basket');

        // ── 2. Place the order ───────────────────────────────────────────
        // No prices in the body. The server prices it from its own catalogue.
        $created = $this->postJson('/api/orders', [
            'items' => [
                ['service_id' => 'dry_cleaning', 'item_id' => 'dc-outer-4', 'quantity' => 2],
            ],
            'delivery_tier' => 'standard',
            'collection_time' => 'Sabah, 10:00 - 12:00',
            'delivery_time' => 'Birisi gün, 14:00 - 16:00',
            'address' => 'Nizami küç. 22, Bakı',
            'address_lat' => 40.3776,
            'address_lng' => 49.8920,
            'is_outside_city' => false,
            'payment_method' => 'cash',
        ], $this->as($this->customer))->assertCreated()->json('data');

        $orderId = $created['id'];
        $order = Order::findOrFail($orderId);

        $this->assertSame(OrderLifecycle::ORDER_PLACED, $order->lifecycle_state);
        $this->assertSame($this->customer->id, $order->user_id);

        // The first-order discount is applied server-side; the app never sends
        // the code. Quote and order agree on the subtotal either way.
        $this->assertEqualsWithDelta($quote['subtotal'], (float) $order->subtotal, 0.01);
        $this->assertGreaterThan(0, (float) $order->total);

        // ── 3. Pay ───────────────────────────────────────────────────────
        // Cash settles outside the gateway, so no bank call is involved.
        $this->postJson("/api/orders/{$orderId}/pay", [
            'method' => 'cash',
        ], $this->as($this->customer))->assertOk();

        $payment = $this->getJson("/api/orders/{$orderId}/payment", $this->as($this->customer))
            ->assertOk()->json('data');
        $this->assertArrayHasKey('payment_status', $payment);
        // Cash never reaches the gateway, so there is no bank status to read.
        $this->assertSame('cash', $payment['payment_method']);
        $this->assertNull($payment['bank_status']);

        // ── 4. The customer cannot dispatch their own order ──────────────
        // Role gates live on the server, not in whichever screen called it.
        //
        // 403, not 422. A customer may never broadcast, from any state, so
        // the screen should hide the control rather than retry — which is
        // exactly what it cannot work out if this arrives as a 422 next to
        // "not from this state". ForbiddenActorException carries the
        // difference; see OrderLifecycleController::guard().
        $this->postJson("/api/orders/{$orderId}/broadcast", [
            'courier_ids' => [$this->courier->id],
        ], $this->as($this->customer))->assertStatus(403);

        // ── 5. Admin broadcasts to the courier pool ──────────────────────
        $this->postJson("/api/orders/{$orderId}/broadcast", [
            'courier_ids' => [$this->courier->id],
        ], $this->as($this->admin))->assertOk();

        $this->assertSame(
            OrderLifecycle::ASSIGNING_COURIERS,
            $order->fresh()->lifecycle_state
        );
        $this->assertDatabaseHas('courier_assignments', [
            'order_id' => $orderId,
            'courier_id' => $this->courier->id,
        ]);

        // The offer shows up in the courier's own pool.
        $available = $this->getJson('/api/lifecycle/available', $this->as($this->courier))
            ->assertOk()->json();
        $this->assertNotEmpty($available, 'courier sees the broadcast offer');

        // ── 6. Courier claims it ─────────────────────────────────────────
        $this->postJson("/api/orders/{$orderId}/lifecycle/claim", [], $this->as($this->courier))
            ->assertOk();

        $order->refresh();
        $this->assertSame(OrderLifecycle::COURIER_ASSIGNED, $order->lifecycle_state);
        $this->assertSame($this->courier->id, $order->courier_id);
        $this->assertNotNull(
            CourierAssignment::where('order_id', $orderId)
                ->where('courier_id', $this->courier->id)
                ->first()?->claimed_at,
            'the winning claim is stamped'
        );

        // A second courier loses the race — first-to-claim is decided by the
        // database, and the loser must get a clean 409, not an exception.
        $rival = $this->profile(['name' => 'Rəqib', 'phone' => '+994500000004', 'role' => 'courier']);
        $this->postJson("/api/orders/{$orderId}/lifecycle/claim", [], $this->as($rival))
            ->assertStatus(409);

        // ── 7. GPS is refused before the order is moving ─────────────────
        // The loop is driven by order state; a ping outside the en-route
        // states means a courier's loop failed to stop.
        $this->postJson("/api/orders/{$orderId}/location", [
            'lat' => 40.40, 'lng' => 49.85,
        ], $this->as($this->courier))->assertStatus(409);

        // ── 8. Walk the lifecycle ────────────────────────────────────────
        $courierSteps = [
            OrderLifecycle::COURIER_EN_ROUTE_PICKUP => 'collecting',
            OrderLifecycle::PICKED_UP => 'collecting',
            OrderLifecycle::AT_LAUNDRY => 'cleaning',
        ];
        foreach ($courierSteps as $state => $legacyStatus) {
            $this->postJson("/api/orders/{$orderId}/lifecycle/transition", [
                'to' => $state,
            ], $this->as($this->courier))->assertOk();

            $this->assertSame($legacyStatus, $order->fresh()->status, "legacy status for {$state}");
        }

        // Skipping a step must fail: callers name the target, so a double-tap
        // is rejected rather than silently advancing two states.
        $this->postJson("/api/orders/{$orderId}/lifecycle/transition", [
            'to' => OrderLifecycle::DELIVERED,
        ], $this->as($this->courier))->assertStatus(422);

        // Only an admin marks the load finished — a role refusal, so 403,
        // in contrast to the skipped step just above which is 422.
        $this->postJson("/api/orders/{$orderId}/lifecycle/transition", [
            'to' => OrderLifecycle::PROCESSING_FINISHED,
        ], $this->as($this->courier))->assertStatus(403);

        $this->postJson("/api/orders/{$orderId}/lifecycle/transition", [
            'to' => OrderLifecycle::PROCESSING_FINISHED,
        ], $this->as($this->admin))->assertOk();

        // ── 9. Out for delivery, with live tracking ──────────────────────
        $this->postJson("/api/orders/{$orderId}/lifecycle/transition", [
            'to' => OrderLifecycle::COURIER_EN_ROUTE_DELIVERY,
        ], $this->as($this->courier))->assertOk();

        // A short run of fixes, as the phone would send them.
        $road = [
            [40.3900, 49.8500, 210.0],
            [40.3860, 49.8600, 195.0],
            [40.3820, 49.8750, 180.5],
            [40.3776, 49.8920, 172.0],
        ];
        foreach ($road as [$lat, $lng, $heading]) {
            $this->postJson("/api/orders/{$orderId}/location", [
                'lat' => $lat,
                'lng' => $lng,
                'heading' => $heading,
                'speed' => 8.5,
                'accuracy' => 12.0,
            ], $this->as($this->courier))->assertCreated();
        }

        $this->assertSame(4, CourierLocation::where('order_id', $orderId)->count());

        // What the customer's map actually reads.
        $tracking = $this->getJson("/api/orders/{$orderId}/location", $this->as($this->customer))
            ->assertOk()->json('data');

        $this->assertTrue($tracking['tracking'], 'order reports as trackable');
        $this->assertFalse($tracking['stale'], 'a fresh fix is not stale');
        $this->assertEqualsWithDelta(40.3776, $tracking['position']['lat'], 0.0001, 'latest fix wins');
        $this->assertEqualsWithDelta(49.8920, $tracking['position']['lng'], 0.0001);
        $this->assertSame('Kuryer', $tracking['courier']['name'], 'map labels the courier');
        $this->assertEqualsWithDelta(40.3776, $tracking['destination']['lat'], 0.0001, 'destination pin');
        $this->assertEqualsWithDelta(49.8920, $tracking['destination']['lng'], 0.0001);

        // A stranger must not be able to follow someone else's courier.
        $stranger = $this->profile(['name' => 'Kənar', 'phone' => '+994500000005']);
        $this->getJson("/api/orders/{$orderId}/location", $this->as($stranger))
            ->assertStatus(403);

        // ── 10. Delivered ────────────────────────────────────────────────
        $this->postJson("/api/orders/{$orderId}/lifecycle/transition", [
            'to' => OrderLifecycle::DELIVERED,
        ], $this->as($this->courier))->assertOk();

        $order->refresh();
        $this->assertSame(OrderLifecycle::DELIVERED, $order->lifecycle_state);
        $this->assertSame('completed', $order->status, 'legacy column tracks the new one');

        // Tracking closes with the order rather than staying open forever.
        $closed = $this->getJson("/api/orders/{$orderId}/location", $this->as($this->customer))
            ->assertOk()->json('data');
        $this->assertFalse($closed['tracking'], 'the trail closes on delivery');

        // ── 11. The timeline the customer sees ───────────────────────────
        $timeline = $this->getJson("/api/orders/{$orderId}/timeline", $this->as($this->customer))
            ->assertOk()->json();

        $logged = OrderStatusLog::where('order_id', $orderId)->count();
        $this->assertGreaterThanOrEqual(7, $logged, 'every transition left an audit row');
        $this->assertNotEmpty($timeline);

        // ── 12. The gift box the finished order earned ───────────────────
        $this->seedRewards();

        $boxes = $this->getJson('/api/gift-boxes', $this->as($this->customer))
            ->assertOk()->json();
        $this->assertCount(1, $boxes['boxes'], 'a delivered order yields exactly one box');
        $this->assertSame($orderId, $boxes['boxes'][0]['order_id']);

        $prize = $this->postJson('/api/gift-boxes/open', [
            'order_id' => $orderId,
        ], $this->as($this->customer))->assertCreated()->json();

        $this->assertNotEmpty($prize['kind']);
        $this->assertNotEmpty($prize['title']);

        // The same box cannot be opened twice — this is the check-then-write
        // that the cooldown depends on.
        $this->postJson('/api/gift-boxes/open', [
            'order_id' => $orderId,
        ], $this->as($this->customer))->assertStatus(422);

        $this->assertSame(1, UserReward::where('user_id', $this->customer->id)->count());

        // ── 13. The prize is spendable, once ─────────────────────────────
        $won = UserReward::where('user_id', $this->customer->id)->firstOrFail();

        $after = $this->getJson('/api/gift-boxes', $this->as($this->customer))
            ->assertOk()->json();
        $this->assertCount(1, $after['active_rewards'], 'the prize shows in the wallet');
        $this->assertEmpty($after['boxes'], 'the box is spent');

        $second = $this->postJson('/api/orders', [
            'items' => [
                ['service_id' => 'dry_cleaning', 'item_id' => 'dc-outer-4', 'quantity' => 1],
            ],
            'delivery_tier' => 'standard',
            'collection_time' => 'Sabah, 10:00 - 12:00',
            'delivery_time' => 'Birisi gün, 14:00 - 16:00',
            'address' => 'Nizami küç. 22, Bakı',
            'address_lat' => 40.3776,
            'address_lng' => 49.8920,
            'user_reward_id' => $won->id,
            'payment_method' => 'cash',
        ], $this->as($this->customer))->assertCreated()->json('data');

        $this->assertNotNull($second['id']);
        $this->assertNotNull(
            UserReward::find($won->id)->used_at,
            'spending the prize marks it used, so it cannot be spent again'
        );
    }

    /**
     * The admin console's own data feed. Separate from the journey because it
     * is a different client — a browser app, not the phone.
     */
    public function test_the_admin_console_lists_orders_and_couriers_and_refuses_everyone_else(): void
    {
        $this->postJson('/api/orders', [
            'items' => [['service_id' => 'dry_cleaning', 'item_id' => 'dc-outer-4', 'quantity' => 1]],
            'delivery_tier' => 'standard',
            'collection_time' => 'Sabah, 10:00 - 12:00',
            'delivery_time' => 'Birisi gün, 14:00 - 16:00',
            'address' => 'Nizami küç. 22',
        ], $this->as($this->customer))->assertCreated();

        $orders = $this->getJson('/api/admin/orders', $this->as($this->admin))->assertOk()->json();
        $this->assertNotEmpty($orders, 'admin sees the incoming feed');

        $couriers = $this->getJson('/api/admin/couriers', $this->as($this->admin))->assertOk()->json();
        $this->assertNotEmpty($couriers, 'admin sees the courier roster');

        // The console is admin-only, whoever is asking.
        $this->getJson('/api/admin/orders', $this->as($this->customer))->assertStatus(403);
        $this->getJson('/api/admin/orders', $this->as($this->courier))->assertStatus(403);
        $this->getJson('/api/admin/orders')->assertStatus(401);
    }

    /**
     * Toplu: pay a deposit, courier counts the load afterwards, the real
     * total is settled against the deposit.
     */
    public function test_a_bulk_order_settles_against_its_deposit(): void
    {
        $created = $this->postJson('/api/orders/bulk', [
            'collection_time' => 'Bu gün, 16:00 - 18:00',
            'delivery_time' => 'Bu gün, 16:00 - 18:00',
            'address' => 'Nizami küç. 22',
            'is_outside_city' => false,
        ], $this->as($this->customer))->assertCreated()->json('data');

        $order = Order::findOrFail($created['id']);
        $this->assertEqualsWithDelta(
            (float) config('nata.toplu.deposit'),
            (float) $order->deposit_amount,
            0.01,
            'the deposit is the server\'s figure'
        );

        // Get it into a state where the courier may count it.
        $this->postJson("/api/orders/{$order->id}/broadcast", [
            'courier_ids' => [$this->courier->id],
        ], $this->as($this->admin))->assertOk();
        $this->postJson("/api/orders/{$order->id}/lifecycle/claim", [], $this->as($this->courier))
            ->assertOk();
        foreach ([OrderLifecycle::COURIER_EN_ROUTE_PICKUP, OrderLifecycle::PICKED_UP] as $state) {
            $this->postJson("/api/orders/{$order->id}/lifecycle/transition", [
                'to' => $state,
            ], $this->as($this->courier))->assertOk();
        }

        // Counted above the deposit: the customer owes the difference.
        $this->postJson("/api/orders/{$order->id}/count", [
            'counted_total' => 35.00,
        ], $this->as($this->courier))->assertOk();

        $order->refresh();
        $this->assertEqualsWithDelta(35.00, (float) $order->counted_total, 0.01);
        $this->assertNotNull($order->counted_at);
        $this->assertSame('balance_due', $order->payment_status);

        // Counting twice must not double-settle.
        $this->postJson("/api/orders/{$order->id}/count", [
            'counted_total' => 90.00,
        ], $this->as($this->courier))->assertStatus(422);

        $this->assertEqualsWithDelta(35.00, (float) $order->fresh()->counted_total, 0.01);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private function profile(array $attributes = []): Profile
    {
        // forceCreate: `id` is guarded, because it comes from Supabase Auth
        // rather than being generated here.
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

    /** A signed access token for this profile, as Supabase would mint. */

    /** A minimal prize pool — the draw needs something to draw from. */
    private function seedRewards(): void
    {
        foreach ([
            ['balance_bonus', '5 AZN Balans Bonusu', ['amount' => 5], 60],
            ['eco_points', '100 Eko Xal', ['points' => 100], 30],
            ['free_service', 'Pulsuz Ütüləmə', ['service_id' => 'ironing'], 10],
        ] as [$kind, $title, $value, $weight]) {
            Reward::forceCreate([
                'id' => (string) Str::uuid(),
                'kind' => $kind,
                'title' => $title,
                'description' => $title,
                'value' => $value,
                'weight' => $weight,
                'box_tier' => 'order',
                'active' => true,
                'created_at' => now(),
            ]);
        }
    }
}
