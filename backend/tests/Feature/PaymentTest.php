<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Payment;
use App\Models\Profile;
use App\Services\KapitalException;
use App\Services\PaymentService;
use App\Support\PaymentMethod;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The payment path, with the bank faked.
 *
 * The cases that matter here are the dishonest ones: a forged callback, a
 * client naming its own amount, a bank that settles a different figure than
 * we asked for. Those are what turn a payment integration into a way to get
 * laundry for free.
 */
class PaymentTest extends TestCase
{
    private function profile(string $role = 'customer'): Profile
    {
        // forceCreate: Profile guards `id`, which is the Supabase auth uid.
        return Profile::forceCreate([
            'id' => (string) Str::uuid(),
            'name' => 'Test Customer',
            'phone' => '+994500000000',
            'role' => $role,
            'wallet_balance' => 0,
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

    private function fakeBank(array $createOrder = [], array $getOrder = []): void
    {
        Http::fake([
            '*/order/*' => Http::response(['order' => array_merge([
                'id' => 4595,
                'status' => 'FullyPaid',
                'amount' => 42.00,
                'clearedChargeAmount' => 42.00,
            ], $getOrder)]),
            '*/order' => Http::response(['order' => array_merge([
                'id' => 4595,
                'hppUrl' => 'https://txpgtst.kapitalbank.az/flex',
                'password' => '8xjpd1ejxdma',
                'status' => 'Preparing',
                'cvv2AuthStatus' => 'Required',
                'secret' => '312866',
            ], $createOrder)]),
        ]);
    }

    public function test_card_payment_charges_the_server_priced_total_not_a_client_figure(): void
    {
        $this->fakeBank();
        $profile = $this->profile();
        $order = $this->order($profile, 42.00);

        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        // Whatever a client might have wanted to pay, the amount sent to the
        // bank is the one on the order row.
        Http::assertSent(function ($request) {
            if (! str_ends_with($request->url(), '/order')) {
                return false;
            }

            return $request['order']['amount'] === '42.00'
                && $request['order']['currency'] === 'AZN'
                && $request['order']['typeRid'] === 'Order_SMS';
        });

        $this->assertDatabaseHas('payments', [
            'order_id' => $order->id,
            'amount' => 42.00,
            'transaction_ref' => '4595',
            'status' => 'pending',
        ]);
    }

    public function test_redirect_url_carries_the_order_id_and_password(): void
    {
        $this->fakeBank();
        $profile = $this->profile();
        $order = $this->order($profile);

        $result = app(PaymentService::class)->start($order, PaymentMethod::CARD);

        $this->assertStringContainsString('/flex?', $result['redirect_url']);
        $this->assertStringContainsString('id=4595', $result['redirect_url']);
        $this->assertStringContainsString('password=8xjpd1ejxdma', $result['redirect_url']);
        // The HPP url already ends in /flex; it must not be doubled.
        $this->assertStringNotContainsString('/flex/flex', $result['redirect_url']);
    }

    public function test_cash_records_a_pending_payment_and_never_calls_the_bank(): void
    {
        Http::fake();
        $profile = $this->profile();
        $order = $this->order($profile);

        $result = app(PaymentService::class)->start($order, PaymentMethod::CASH);

        $this->assertNull($result['redirect_url']);
        Http::assertNothingSent();

        $order->refresh();
        $this->assertSame(PaymentMethod::CASH, $order->payment_method);
        // Cash is not money in hand until the courier collects it.
        $this->assertSame('pending', $order->payment_status);
    }

    public function test_a_forged_callback_cannot_mark_an_order_paid(): void
    {
        // The bank says the order is still Preparing...
        $this->fakeBank(getOrder: ['status' => 'Preparing']);
        $profile = $this->profile();
        $order = $this->order($profile);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        // ...but the customer's browser arrives claiming it was FullyPaid.
        $this->get('/api/payments/callback?ID=4595&STATUS=FullyPaid')
            ->assertRedirect();

        $order->refresh();
        $this->assertSame(
            'pending',
            $order->payment_status,
            'STATUS from the redirect must never be believed over the bank.'
        );
    }

    public function test_callback_settles_an_order_the_bank_confirms(): void
    {
        $this->fakeBank(getOrder: ['status' => 'FullyPaid']);
        $profile = $this->profile();
        $order = $this->order($profile);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        $this->get('/api/payments/callback?ID=4595&STATUS=Declined')
            ->assertRedirect();

        $order->refresh();
        // Believed because the bank said so, not because the URL did.
        $this->assertSame('paid', $order->payment_status);
    }

    public function test_callback_for_an_unknown_order_is_ignored(): void
    {
        $this->fakeBank();

        $this->get('/api/payments/callback?ID=999999&STATUS=FullyPaid')
            ->assertRedirect('natalaundry://payment/unknown?status=invalid');
    }

    public function test_a_settled_amount_that_differs_from_the_order_is_not_accepted(): void
    {
        // The bank reports success, but for ₼1 rather than the ₼42 owed.
        $this->fakeBank(getOrder: [
            'status' => 'FullyPaid',
            'clearedChargeAmount' => 1.00,
        ]);
        $profile = $this->profile();
        $order = $this->order($profile, 42.00);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        $payment = Payment::where('order_id', $order->id)->firstOrFail();
        $result = app(PaymentService::class)->verify($payment);

        $this->assertSame('amount_mismatch', $result['payment_status']);
        $order->refresh();
        $this->assertNotSame('paid', $order->payment_status);
    }

    public function test_an_unknown_bank_status_reads_as_pending_not_paid(): void
    {
        $this->fakeBank(getOrder: ['status' => 'SomethingNewNobodyDocumented']);
        $profile = $this->profile();
        $order = $this->order($profile);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        $payment = Payment::where('order_id', $order->id)->firstOrFail();
        $this->assertSame('pending', app(PaymentService::class)->verify($payment)['payment_status']);
    }

    public function test_verifying_twice_does_not_change_the_outcome(): void
    {
        $this->fakeBank(getOrder: ['status' => 'FullyPaid']);
        $profile = $this->profile();
        $order = $this->order($profile);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        $payment = Payment::where('order_id', $order->id)->firstOrFail();
        $service = app(PaymentService::class);

        $service->verify($payment);
        $service->verify($payment);

        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
        $this->assertSame(1, Payment::where('order_id', $order->id)->count());
    }

    public function test_an_already_paid_order_cannot_be_paid_again(): void
    {
        $this->fakeBank();
        $profile = $this->profile();
        $order = $this->order($profile);
        $order->forceFill(['payment_status' => 'paid'])->save();

        $this->expectException(\RuntimeException::class);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);
    }

    public function test_a_cancelled_order_cannot_be_paid(): void
    {
        $this->fakeBank();
        $profile = $this->profile();
        $order = $this->order($profile);
        $order->forceFill(['status' => 'cancelled'])->save();

        $this->expectException(\RuntimeException::class);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);
    }

    public function test_wallets_are_hidden_until_the_terminal_is_confirmed(): void
    {
        config(['kapital.wallets_enabled' => false]);
        $this->assertNotContains(PaymentMethod::APPLE_PAY, PaymentMethod::available());
        $this->assertContains(PaymentMethod::CARD, PaymentMethod::available());
        $this->assertContains(PaymentMethod::CASH, PaymentMethod::available());

        config(['kapital.wallets_enabled' => true]);
        $this->assertContains(PaymentMethod::APPLE_PAY, PaymentMethod::available());
        $this->assertContains(PaymentMethod::GOOGLE_PAY, PaymentMethod::available());
    }

    public function test_a_disabled_wallet_cannot_be_used_even_if_asked_for_directly(): void
    {
        config(['kapital.wallets_enabled' => false]);
        $this->fakeBank();
        $profile = $this->profile();
        $order = $this->order($profile);

        $this->expectException(\RuntimeException::class);
        app(PaymentService::class)->start($order, PaymentMethod::APPLE_PAY);
    }

    public function test_gateway_failure_surfaces_as_an_exception_not_a_silent_success(): void
    {
        Http::fake([
            '*/order' => Http::response([
                'errorCode' => 'PmoDecline',
                'errorDescription' => 'Transaction declined by PMO',
            ], 400),
        ]);

        $profile = $this->profile();
        $order = $this->order($profile);

        $this->expectException(KapitalException::class);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);
    }

    public function test_refund_requires_a_settled_payment(): void
    {
        $this->fakeBank();
        $profile = $this->profile();
        $order = $this->order($profile);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        $payment = Payment::where('order_id', $order->id)->firstOrFail();

        $this->expectException(\RuntimeException::class);
        app(PaymentService::class)->refund($payment);
    }

    public function test_a_refund_cannot_exceed_what_was_paid(): void
    {
        $this->fakeBank(getOrder: ['status' => 'FullyPaid']);
        $profile = $this->profile();
        $order = $this->order($profile, 42.00);
        app(PaymentService::class)->start($order, PaymentMethod::CARD);

        $payment = Payment::where('order_id', $order->id)->firstOrFail();
        app(PaymentService::class)->verify($payment);
        $payment->refresh();

        $this->expectException(\RuntimeException::class);
        app(PaymentService::class)->refund($payment, 100.00);
    }
}
