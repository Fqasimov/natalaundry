<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Profile;
use App\Models\WalletTransaction;
use App\Services\OrderService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use RuntimeException;

/**
 * The guards that stop one real event being applied twice.
 *
 * These cannot spawn genuine parallel connections — the suite runs on an
 * in-memory SQLite database with a single connection. What they *can* pin is
 * the property that actually matters: every guard reads the row it is about
 * to write, inside the transaction that writes it. A second attempt therefore
 * sees the first one's effect and refuses, rather than validating against a
 * copy fetched before the first attempt committed.
 *
 * That is the shape of the bug these replaced: the check ran against an
 * instance loaded earlier, so re-running the operation on that same stale
 * instance succeeded twice. Each test below does exactly that.
 */
class ConcurrencyGuardTest extends TestCase
{
    private function profile(string $role = 'customer', float $balance = 0): Profile
    {
        return Profile::forceCreate([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+994500000000',
            'role' => $role,
            'wallet_balance' => $balance,
        ]);
    }

    private function bulkOrder(Profile $customer, Profile $courier, float $deposit = 20.00): Order
    {
        return Order::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'courier_id' => $courier->id,
            'status' => 'collecting',
            'dispatch_state' => 'assigned',
            'delivery_tier' => 'standard',
            'service_type' => config('nata.toplu.service_type'),
            'subtotal' => 0,
            'discount' => 0,
            'delivery_fee' => 0,
            'total' => $deposit,
            'deposit_amount' => $deposit,
            'collection_time' => 'Today, 2-4 PM',
            'delivery_time' => 'Tomorrow, 2-4 PM',
            'item_photos' => [],
            'payment_status' => 'deposit_paid',
        ]);
    }

    public function test_a_bulk_load_cannot_be_counted_twice_and_refunded_twice(): void
    {
        $customer = $this->profile();
        $courier = $this->profile('courier');
        $order = $this->bulkOrder($customer, $courier, deposit: 20.00);

        $orders = app(OrderService::class);

        // Counted at 12 against a 20 deposit: 8 comes back to the wallet.
        $orders->countBulk($order, $courier, 12.00);
        $this->assertEqualsWithDelta(8.00, (float) $customer->fresh()->wallet_balance, 0.001);

        // The same stale instance again — this is what a second in-flight
        // request holds. It used to pass, because the counted_at guard read
        // this copy rather than the row.
        $stale = Order::find($order->id);
        $stale->counted_at = null;

        try {
            $orders->countBulk($stale, $courier, 12.00);
            $this->fail('A bulk load must only be counted once.');
        } catch (RuntimeException) {
            // expected
        }

        $this->assertEqualsWithDelta(8.00, (float) $customer->fresh()->wallet_balance, 0.001);
        $this->assertSame(1, WalletTransaction::where('user_id', $customer->id)->count());
    }

    public function test_an_order_cannot_be_advanced_twice_from_a_stale_copy(): void
    {
        $customer = $this->profile();
        $courier = $this->profile('courier');

        $order = Order::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'courier_id' => $courier->id,
            'status' => 'collecting',
            'dispatch_state' => 'assigned',
            'delivery_tier' => 'standard',
            'service_type' => 'wash',
            'subtotal' => 10, 'discount' => 0, 'delivery_fee' => 5, 'total' => 15,
            'collection_time' => 'Today', 'delivery_time' => 'Tomorrow',
            'item_photos' => [],
            'payment_status' => 'pending',
        ]);

        $orders = app(OrderService::class);
        $orders->advance($order, $courier);
        $this->assertSame('cleaning', $order->fresh()->status);

        // A second request holding the pre-advance copy must not skip a state.
        $stale = Order::find($order->id);
        $stale->status = 'collecting';
        $orders->advance($stale, $courier);

        // One step from the real state, not two from the stale one.
        $this->assertSame('delivering', $order->fresh()->status);
    }

    public function test_a_claimed_order_can_no_longer_be_cancelled_by_a_stale_request(): void
    {
        $customer = $this->profile();
        $courier = $this->profile('courier');

        $order = Order::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'status' => 'pending',
            'dispatch_state' => 'awaiting_admin',
            'delivery_tier' => 'standard',
            'service_type' => 'wash',
            'subtotal' => 10, 'discount' => 0, 'delivery_fee' => 5, 'total' => 15,
            'collection_time' => 'Today', 'delivery_time' => 'Tomorrow',
            'item_photos' => [],
            'payment_status' => 'pending',
        ]);

        // The customer's cancel request is in flight, holding this copy...
        $inFlight = Order::find($order->id);

        // ...and a courier claims the order first.
        app(OrderService::class)->claim($order, $courier);
        $this->assertSame('collecting', $order->fresh()->status);

        try {
            app(OrderService::class)->cancel($inFlight);
            $this->fail('An order already taken by a courier must not be cancellable.');
        } catch (RuntimeException) {
            // expected
        }

        $this->assertSame('collecting', $order->fresh()->status);
    }

    public function test_every_money_moving_write_runs_inside_a_transaction(): void
    {
        $customer = $this->profile();
        $courier = $this->profile('courier');
        $order = $this->bulkOrder($customer, $courier, deposit: 20.00);

        $depth = null;
        DB::listen(function () use (&$depth) {
            $depth ??= DB::transactionLevel();
        });

        app(OrderService::class)->countBulk($order, $courier, 12.00);

        // The very first statement the count issues is already inside a
        // transaction — i.e. the lock is taken before anything is read, not
        // after the decision has been made.
        $this->assertNotNull($depth, 'countBulk issued no queries.');
        $this->assertGreaterThan(0, $depth, 'countBulk read before opening a transaction.');
    }
}
