<?php

namespace Tests\Feature;

use App\Models\CourierAssignment;
use App\Models\Notification;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\Profile;
use App\Services\ForbiddenActorException;
use App\Services\InvalidTransitionException;
use App\Services\OrderAlreadyClaimedException;
use App\Services\OrderLifecycleService;
use App\Support\OrderLifecycle;
use Illuminate\Support\Str;
use Tests\TestCase;

class OrderLifecycleTest extends TestCase
{
    private OrderLifecycleService $lifecycle;

    protected function setUp(): void
    {
        parent::setUp();
        $this->lifecycle = app(OrderLifecycleService::class);
    }

    private function profile(array $attributes = []): Profile
    {
        // Profile::create drops `id` — it is guarded, since it comes from
        // Supabase Auth rather than being generated here.
        return Profile::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+994500000000',
            'email' => 't@example.com',
            'language' => 'az',
            'points' => 0,
            'is_subscribed' => false,
            'role' => 'customer',
            'wallet_balance' => 0,
            'created_at' => now(),
        ], $attributes));
    }

    private function order(Profile $customer, array $attributes = []): Order
    {
        return Order::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'status' => 'pending',
            'lifecycle_state' => OrderLifecycle::ORDER_PLACED,
            'delivery_tier' => 'standard',
            'service_type' => 'dry_cleaning',
            'subtotal' => 40,
            'discount' => 0,
            'delivery_fee' => 0,
            'total' => 40,
            'collection_time' => 'Sabah, 18:00 - 20:00',
            'delivery_time' => 'Sabah, 18:00 - 20:00',
            'is_outside_city' => false,
            'item_photos' => [],
            'created_at' => now(),
        ], $attributes));
    }

    /** Walks the full nine-step flow and checks the legacy column tracks it. */
    public function test_the_full_lifecycle_runs_in_order(): void
    {
        $customer = $this->profile();
        $admin = $this->profile(['role' => 'admin']);
        $courier = $this->profile(['role' => 'courier', 'name' => 'Kuryer']);
        $order = $this->order($customer);

        $this->lifecycle->broadcast($order, $admin, [$courier->id]);
        $this->assertSame(OrderLifecycle::ASSIGNING_COURIERS, $order->fresh()->lifecycle_state);

        $this->lifecycle->claim($order->fresh(), $courier);
        $order->refresh();
        $this->assertSame(OrderLifecycle::COURIER_ASSIGNED, $order->lifecycle_state);
        $this->assertSame($courier->id, $order->courier_id);

        $steps = [
            OrderLifecycle::COURIER_EN_ROUTE_PICKUP => 'collecting',
            OrderLifecycle::PICKED_UP => 'collecting',
            OrderLifecycle::AT_LAUNDRY => 'cleaning',
        ];
        foreach ($steps as $state => $legacy) {
            $this->lifecycle->transition($order->fresh(), $state, $courier, 'courier');
            $this->assertSame($legacy, $order->fresh()->status, "legacy status for {$state}");
        }

        $this->lifecycle->transition($order->fresh(), OrderLifecycle::PROCESSING_FINISHED, $admin, 'admin');
        $this->assertNotNull($order->fresh()->processing_finished_at);

        $this->lifecycle->transition($order->fresh(), OrderLifecycle::COURIER_EN_ROUTE_DELIVERY, $courier, 'courier');
        $this->lifecycle->transition($order->fresh(), OrderLifecycle::DELIVERED, $courier, 'courier');

        $order->refresh();
        $this->assertSame(OrderLifecycle::DELIVERED, $order->lifecycle_state);
        $this->assertSame('completed', $order->status);
        $this->assertNotNull($order->delivered_at);
    }

    public function test_steps_cannot_be_skipped(): void
    {
        $customer = $this->profile();
        $courier = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, ['courier_id' => $courier->id]);

        $this->expectException(InvalidTransitionException::class);
        $this->lifecycle->transition($order, OrderLifecycle::DELIVERED, $courier, 'courier');
    }

    public function test_a_courier_cannot_drive_an_admin_only_step(): void
    {
        $customer = $this->profile();
        $admin = $this->profile(['role' => 'admin']);
        $courier = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, [
            'courier_id' => $courier->id,
            'lifecycle_state' => OrderLifecycle::AT_LAUNDRY,
            'status' => 'cleaning',
        ]);

        $this->expectException(InvalidTransitionException::class);
        $this->lifecycle->transition($order, OrderLifecycle::PROCESSING_FINISHED, $courier, 'courier');
    }

    public function test_only_the_assigned_courier_may_advance(): void
    {
        $customer = $this->profile();
        $mine = $this->profile(['role' => 'courier']);
        $other = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, [
            'courier_id' => $mine->id,
            'lifecycle_state' => OrderLifecycle::COURIER_ASSIGNED,
        ]);

        $this->expectException(InvalidTransitionException::class);
        $this->lifecycle->transition($order, OrderLifecycle::COURIER_EN_ROUTE_PICKUP, $other, 'courier');
    }

    /**
     * The claim race. The second courier must lose cleanly rather than
     * overwriting the first — this is the behaviour the row lock buys.
     */
    public function test_only_the_first_courier_claims_a_broadcast_order(): void
    {
        $customer = $this->profile();
        $admin = $this->profile(['role' => 'admin']);
        $first = $this->profile(['role' => 'courier', 'name' => 'Birinci']);
        $second = $this->profile(['role' => 'courier', 'name' => 'Ikinci']);
        $order = $this->order($customer);

        $this->lifecycle->broadcast($order, $admin, [$first->id, $second->id]);

        $this->lifecycle->claim($order->fresh(), $first);
        $this->assertSame($first->id, $order->fresh()->courier_id);

        try {
            $this->lifecycle->claim($order->fresh(), $second);
            $this->fail('The second courier should not have been able to claim.');
        } catch (OrderAlreadyClaimedException $e) {
            $this->assertSame('Order already claimed.', $e->getMessage());
        }

        // The winner is unchanged and only one assignment records a claim.
        $this->assertSame($first->id, $order->fresh()->courier_id);
        $this->assertSame(1, CourierAssignment::query()
            ->where('order_id', $order->id)
            ->whereNotNull('claimed_at')
            ->count());
    }

    public function test_a_courier_outside_the_broadcast_pool_cannot_claim(): void
    {
        $customer = $this->profile();
        $admin = $this->profile(['role' => 'admin']);
        $invited = $this->profile(['role' => 'courier']);
        $stranger = $this->profile(['role' => 'courier']);
        $order = $this->order($customer);

        $this->lifecycle->broadcast($order, $admin, [$invited->id]);

        $this->expectException(OrderAlreadyClaimedException::class);
        $this->lifecycle->claim($order->fresh(), $stranger);
    }

    public function test_every_transition_is_logged_and_notified(): void
    {
        $customer = $this->profile();
        $admin = $this->profile(['role' => 'admin']);
        $courier = $this->profile(['role' => 'courier', 'name' => 'Kuryer']);
        $order = $this->order($customer);

        $this->lifecycle->broadcast($order, $admin, [$courier->id]);
        $this->lifecycle->claim($order->fresh(), $courier);

        $logs = OrderStatusLog::query()->where('order_id', $order->id)->orderBy('created_at')->get();
        $this->assertSame(
            [OrderLifecycle::ASSIGNING_COURIERS, OrderLifecycle::COURIER_ASSIGNED],
            $logs->pluck('to_state')->all(),
        );
        $this->assertSame(['admin', 'courier'], $logs->pluck('actor_role')->all());

        $notes = Notification::query()->where('user_id', $customer->id)->get();
        $this->assertCount(2, $notes);
        // The courier's name is interpolated into the assignment message.
        $this->assertStringContainsString('Kuryer', $notes->last()->body);
        $this->assertSame('notifyCourierAssigned', $notes->last()->payload['key']);
    }

    public function test_tracking_is_only_active_while_en_route(): void
    {
        $customer = $this->profile();
        $order = $this->order($customer, ['lifecycle_state' => OrderLifecycle::COURIER_EN_ROUTE_PICKUP]);
        $this->assertTrue($order->isTracking());

        $order->forceFill(['lifecycle_state' => OrderLifecycle::PICKED_UP])->save();
        $this->assertFalse($order->fresh()->isTracking());

        $order->forceFill(['lifecycle_state' => OrderLifecycle::COURIER_EN_ROUTE_DELIVERY])->save();
        $this->assertTrue($order->fresh()->isTracking());
    }

    public function test_an_order_cannot_be_cancelled_once_collected(): void
    {
        $customer = $this->profile();
        $order = $this->order($customer, [
            'lifecycle_state' => OrderLifecycle::PICKED_UP,
            'status' => 'collecting',
        ]);

        $this->expectException(InvalidTransitionException::class);
        $this->lifecycle->transition($order, OrderLifecycle::CANCELLED, $customer, 'customer');
    }

    /**
     * The two refusals must stay distinguishable.
     *
     * A state refusal means "not from here, but you could" — the screen should
     * re-read the order, because someone else has probably moved it already. A
     * role refusal means "never, whoever you are" — the screen should not be
     * offering the control at all. They were folded into one exception and one
     * status code, so a client had no way to tell them apart.
     *
     * ForbiddenActorException extends InvalidTransitionException, so asserting
     * the general type would pass for either. These assert the exact class.
     */
    public function test_a_forbidden_state_change_is_not_a_role_refusal(): void
    {
        $customer = $this->profile();
        $courier = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, ['courier_id' => $courier->id]);

        try {
            $this->lifecycle->transition($order, OrderLifecycle::DELIVERED, $courier, 'courier');
            $this->fail('Skipping to delivered should have been refused.');
        } catch (InvalidTransitionException $e) {
            $this->assertNotInstanceOf(
                ForbiddenActorException::class,
                $e,
                'A courier may reach delivered eventually, so this is a state refusal, not a role one.',
            );
        }
    }

    public function test_a_role_refusal_is_reported_as_one(): void
    {
        $customer = $this->profile();
        $courier = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, [
            'courier_id' => $courier->id,
            'lifecycle_state' => OrderLifecycle::AT_LAUNDRY,
            'status' => 'cleaning',
        ]);

        // The state is right for this move; only the role is wrong.
        $this->assertTrue(OrderLifecycle::canTransition(
            OrderLifecycle::AT_LAUNDRY,
            OrderLifecycle::PROCESSING_FINISHED,
        ));

        $this->expectException(ForbiddenActorException::class);
        $this->lifecycle->transition($order, OrderLifecycle::PROCESSING_FINISHED, $courier, 'courier');
    }

    public function test_a_courier_who_is_not_the_assigned_one_is_a_role_refusal(): void
    {
        $customer = $this->profile();
        $mine = $this->profile(['role' => 'courier']);
        $other = $this->profile(['role' => 'courier']);
        $order = $this->order($customer, [
            'courier_id' => $mine->id,
            'lifecycle_state' => OrderLifecycle::COURIER_ASSIGNED,
        ]);

        $this->expectException(ForbiddenActorException::class);
        $this->lifecycle->transition($order, OrderLifecycle::COURIER_EN_ROUTE_PICKUP, $other, 'courier');
    }
}
