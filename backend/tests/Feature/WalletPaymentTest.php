<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Profile;
use App\Models\WalletTopup;
use App\Models\WalletTransaction;
use App\Services\PaymentService;
use App\Services\WalletService;
use App\Support\PaymentMethod;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\Support\IssuesSupabaseTokens;
use Tests\TestCase;
use RuntimeException;

/**
 * Nata Balance: paying with it, and putting money into it.
 *
 * The interesting cases are all about money appearing or disappearing where
 * it should not — spending a balance twice, being credited twice for one
 * top-up, or naming your own figure for either.
 */
class WalletPaymentTest extends TestCase
{
    use IssuesSupabaseTokens;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('services.supabase.jwt_secret', $this->supabaseSecret());
    }

    private function profile(float $balance = 0, string $role = 'customer'): Profile
    {
        return Profile::forceCreate([
            'id' => (string) Str::uuid(),
            'name' => 'Test Customer',
            'phone' => '+994500000000',
            'role' => $role,
            'wallet_balance' => $balance,
        ]);
    }

    private function order(Profile $profile, float $total = 42.00): Order
    {
        return Order::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $profile->id,
            'status' => 'pending',
            'dispatch_state' => 'awaiting_admin',
            'delivery_tier' => 'standard',
            'service_type' => 'wash',
            'subtotal' => 37.00,
            'discount' => 0,
            'delivery_fee' => 5.00,
            'total' => $total,
            'collection_time' => 'Today, 2-4 PM',
            'delivery_time' => 'Tomorrow, 2-4 PM',
            'item_photos' => [],
            'payment_status' => 'pending',
        ]);
    }

    private function fakeBank(array $getOrder = []): void
    {
        Http::fake([
            '*/order/*' => Http::response(['order' => array_merge([
                'id' => 4595,
                'status' => 'FullyPaid',
                'amount' => 50.00,
                'clearedChargeAmount' => 50.00,
            ], $getOrder)]),
            '*/order' => Http::response(['order' => [
                'id' => 4595,
                'hppUrl' => 'https://txpgtst.kapitalbank.az/flex',
                'password' => '8xjpd1ejxdma',
                'status' => 'Preparing',
            ]]),
        ]);
    }

    // ---- paying with the balance --------------------------------------------

    public function test_paying_with_balance_settles_the_order_and_debits_the_wallet(): void
    {
        $profile = $this->profile(balance: 100.00);
        $order = $this->order($profile, total: 42.00);

        $result = app(PaymentService::class)->start($order, PaymentMethod::BALANCE);

        $this->assertSame(PaymentMethod::BALANCE, $result['method']);
        // Nothing to redirect to: this never leaves our own database.
        $this->assertNull($result['redirect_url']);
        $this->assertNull($result['bank_order_id']);

        $this->assertSame('paid', $order->fresh()->payment_status);
        $this->assertEqualsWithDelta(58.00, (float) $profile->fresh()->wallet_balance, 0.001);

        $ledger = WalletTransaction::where('user_id', $profile->id)->first();
        $this->assertEqualsWithDelta(-42.00, (float) $ledger->amount, 0.001);
        $this->assertSame($order->id, $ledger->order_id);
    }

    public function test_an_insufficient_balance_is_refused_and_leaves_the_order_unpaid(): void
    {
        $profile = $this->profile(balance: 10.00);
        $order = $this->order($profile, total: 42.00);

        try {
            app(PaymentService::class)->start($order, PaymentMethod::BALANCE);
            $this->fail('A balance of 10 should not settle an order of 42.');
        } catch (RuntimeException) {
            // expected
        }

        // The whole thing rolls back: no partial debit, no half-paid order.
        $this->assertEqualsWithDelta(10.00, (float) $profile->fresh()->wallet_balance, 0.001);
        $this->assertSame('pending', $order->fresh()->payment_status);
        $this->assertSame(0, WalletTransaction::where('user_id', $profile->id)->count());
    }

    public function test_an_already_paid_order_cannot_be_charged_to_the_balance_again(): void
    {
        $profile = $this->profile(balance: 100.00);
        $order = $this->order($profile, total: 42.00);

        app(PaymentService::class)->start($order, PaymentMethod::BALANCE);

        try {
            app(PaymentService::class)->start($order->fresh(), PaymentMethod::BALANCE);
            $this->fail('Paying twice should be refused.');
        } catch (RuntimeException) {
            // expected
        }

        // Charged once, not twice.
        $this->assertEqualsWithDelta(58.00, (float) $profile->fresh()->wallet_balance, 0.001);
        $this->assertSame(1, WalletTransaction::where('user_id', $profile->id)->count());
    }

    public function test_the_charge_is_the_order_total_not_anything_the_client_sends(): void
    {
        $profile = $this->profile(balance: 100.00);
        $order = $this->order($profile, total: 42.00);

        // A client naming its own price has nowhere to put it — and even if it
        // reaches the route, the amount comes off the order row.
        $this->postJson("/api/orders/{$order->id}/pay", [
            'method' => PaymentMethod::BALANCE,
            'amount' => 0.01,
            'total' => 0.01,
        ], $this->as($profile))->assertOk();

        $this->assertEqualsWithDelta(58.00, (float) $profile->fresh()->wallet_balance, 0.001);
    }

    public function test_another_customer_cannot_pay_for_someone_elses_order_from_their_balance(): void
    {
        $owner = $this->profile(balance: 0);
        $attacker = $this->profile(balance: 500.00);
        $order = $this->order($owner, total: 42.00);

        // Not a favour — it would settle the victim's order while the attacker
        // learns its id is valid. Scoped lookup means it is simply not found.
        $this->postJson("/api/orders/{$order->id}/pay", [
            'method' => PaymentMethod::BALANCE,
        ], $this->as($attacker))->assertNotFound();

        $this->assertSame('pending', $order->fresh()->payment_status);
        $this->assertEqualsWithDelta(500.00, (float) $attacker->fresh()->wallet_balance, 0.001);
    }

    // ---- topping the balance up ---------------------------------------------

    public function test_a_topup_credits_the_balance_once_however_often_it_is_confirmed(): void
    {
        $profile = $this->profile(balance: 0);
        $topup = WalletTopup::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $profile->id,
            'amount' => 50.00,
            'status' => 'pending',
            'transaction_ref' => '4595',
            'created_at' => now(),
        ]);

        $wallet = app(WalletService::class);

        // The browser callback, the app's poll and a reconciliation run can all
        // land on the same top-up. Only the first one may move money.
        $wallet->settleTopup($topup, 'paid');
        $wallet->settleTopup($topup->fresh(), 'paid');
        $wallet->settleTopup($topup->fresh(), 'paid');

        $this->assertEqualsWithDelta(50.00, (float) $profile->fresh()->wallet_balance, 0.001);
        $this->assertSame(1, WalletTransaction::where('user_id', $profile->id)->count());
        $this->assertNotNull($topup->fresh()->settled_at);
    }

    public function test_an_unpaid_topup_credits_nothing(): void
    {
        $profile = $this->profile(balance: 0);
        $topup = WalletTopup::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $profile->id,
            'amount' => 50.00,
            'status' => 'pending',
            'transaction_ref' => '4596',
            'created_at' => now(),
        ]);

        app(WalletService::class)->settleTopup($topup, 'failed');

        $this->assertEqualsWithDelta(0.0, (float) $profile->fresh()->wallet_balance, 0.001);
        $this->assertNull($topup->fresh()->settled_at);
    }

    public function test_topup_amounts_outside_the_configured_bounds_are_refused(): void
    {
        $profile = $this->profile();

        $this->postJson('/api/wallet/topup', ['amount' => 0.5], $this->as($profile))
            ->assertStatus(422);

        $this->postJson('/api/wallet/topup', ['amount' => 999999], $this->as($profile))
            ->assertStatus(422);

        $this->assertSame(0, WalletTopup::count());
    }

    public function test_a_customer_cannot_read_or_drive_another_customers_topup(): void
    {
        $this->fakeBank();
        $owner = $this->profile();
        $attacker = $this->profile();

        $topup = WalletTopup::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $owner->id,
            'amount' => 50.00,
            'status' => 'pending',
            'transaction_ref' => '4597',
            'created_at' => now(),
        ]);

        // Settlement is keyed off the row, not the caller, so an unscoped
        // lookup here would let anyone drive someone else's crediting.
        $this->getJson("/api/wallet/topup/{$topup->id}", $this->as($attacker))
            ->assertNotFound();

        $this->assertNull($topup->fresh()->settled_at);
        $this->assertEqualsWithDelta(0.0, (float) $owner->fresh()->wallet_balance, 0.001);
    }

    public function test_a_topup_the_bank_settled_for_a_different_amount_is_not_credited(): void
    {
        // The bank says paid, but for 5 rather than the 50 we recorded.
        $this->fakeBank(['status' => 'FullyPaid', 'amount' => 5.00, 'clearedChargeAmount' => 5.00]);

        $profile = $this->profile();
        $topup = WalletTopup::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $profile->id,
            'amount' => 50.00,
            'status' => 'pending',
            'transaction_ref' => '4598',
            'created_at' => now(),
        ]);

        $this->getJson("/api/wallet/topup/{$topup->id}", $this->as($profile))->assertOk();

        $this->assertEqualsWithDelta(0.0, (float) $profile->fresh()->wallet_balance, 0.001);
        $this->assertSame('amount_mismatch', $topup->fresh()->status);
        $this->assertNull($topup->fresh()->settled_at);
    }
}
