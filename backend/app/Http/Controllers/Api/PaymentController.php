<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Profile;
use App\Models\WalletTopup;
use App\Services\WalletService;
use App\Services\KapitalException;
use App\Services\PaymentService;
use App\Support\PaymentMethod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use RuntimeException;

class PaymentController extends Controller
{
    public function __construct(
        private readonly PaymentService $payments,
        private readonly WalletService $wallet,
    ) {}

    private function profile(Request $request): Profile
    {
        return $request->attributes->get('profile');
    }

    /**
     * What the checkout screen is allowed to offer, and why.
     *
     * Stays public and configuration-only: the answer depends on the merchant
     * terminal, not on who is asking. Checkout gets the customer's Nata
     * Balance from GET /wallet instead — that route is authenticated, which is
     * where a per-customer figure belongs.
     */
    public function methods(): JsonResponse
    {
        return response()->json([
            'data' => [
                'methods' => PaymentMethod::available(),
                'wallets_enabled' => (bool) config('kapital.wallets_enabled'),
            ],
        ]);
    }

    /**
     * Starts payment for one of the caller's own orders.
     *
     * No amount is accepted from the request — see PaymentService::start().
     */
    public function start(Request $request, string $order): JsonResponse
    {
        $validated = $request->validate([
            'method' => ['required', 'string', Rule::in(PaymentMethod::available())],
            'language' => ['nullable', 'string', 'in:az,ru,en'],
        ]);

        $model = Order::query()
            ->where('id', $order)
            ->where('user_id', $this->profile($request)->id)
            ->firstOrFail();

        try {
            $result = $this->payments->start(
                $model,
                $validated['method'],
                $validated['language'] ?? 'az',
            );
        } catch (KapitalException $e) {
            // The bank's wording can name a decline reason we should not relay.
            Log::warning('Payment start failed', [
                'order_id' => $model->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Payment could not be started. Please try again.',
            ], 502);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $result]);
    }

    /**
     * Current payment state for an order, re-checked against the bank.
     *
     * The app calls this when it comes back to the foreground after the
     * hosted payment page, and it is also the fallback for a customer who
     * killed the browser before being redirected.
     */
    public function show(Request $request, string $order): JsonResponse
    {
        $profile = $this->profile($request);

        $model = Order::query()
            ->where('id', $order)
            ->where(fn ($q) => $q
                ->where('user_id', $profile->id)
                ->orWhere('courier_id', $profile->id))
            ->firstOrFail();

        $payment = Payment::query()
            ->where('order_id', $model->id)
            ->latest('created_at')
            ->first();

        // Nothing to re-check for cash or for an order never sent to the bank.
        if (! $payment || $payment->transaction_ref === null) {
            return response()->json(['data' => [
                'payment_status' => $model->payment_status ?? 'pending',
                'payment_method' => $model->payment_method,
                'bank_status' => null,
            ]]);
        }

        try {
            $result = $this->payments->verify($payment);
        } catch (KapitalException $e) {
            // The gateway being unreachable is not the customer's problem and
            // must not read as "unpaid" — report what we last knew.
            Log::warning('Payment verify failed', [
                'order_id' => $model->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json(['data' => [
                'payment_status' => $model->payment_status ?? 'pending',
                'payment_method' => $model->payment_method,
                'bank_status' => null,
                'stale' => true,
            ]]);
        }

        return response()->json(['data' => [
            'payment_status' => $result['payment_status'],
            'payment_method' => $model->payment_method,
            'bank_status' => $result['bank_status'],
        ]]);
    }

    /**
     * Where the bank sends the customer's browser when they are done.
     *
     * Public and unauthenticated by necessity — it is a redirect target for a
     * browser that carries no Supabase token. That is exactly why nothing
     * here is believed: the ID is looked up, the real status is fetched from
     * the bank, and the STATUS parameter is ignored entirely. Hitting this
     * URL by hand with STATUS=FullyPaid achieves nothing.
     */
    public function callback(Request $request): RedirectResponse
    {
        $bankOrderId = (string) $request->query('ID', '');
        $scheme = config('kapital.app_return_scheme');

        if ($bankOrderId === '') {
            return redirect()->away("{$scheme}://payment/unknown?status=invalid");
        }

        $payment = $this->payments->findByBankOrderId($bankOrderId);

        if (! $payment) {
            // Not an order payment — it may be a Nata Balance top-up, which
            // returns through this same URL because the bank only knows one
            // callback per terminal.
            $topup = WalletTopup::query()->where('transaction_ref', $bankOrderId)->first();
            if ($topup) {
                return $this->completeTopupCallback($topup, $scheme);
            }

            Log::warning('Kapital callback for an unknown order', ['bank_order_id' => $bankOrderId]);

            return redirect()->away("{$scheme}://payment/unknown?status=invalid");
        }

        try {
            $result = $this->payments->verify($payment);
            $status = $result['payment_status'];
        } catch (KapitalException $e) {
            // Could not confirm. The app will poll; do not guess an outcome.
            Log::warning('Kapital callback verification failed', [
                'bank_order_id' => $bankOrderId,
                'error' => $e->getMessage(),
            ]);
            $status = 'unconfirmed';
        }

        return redirect()->away(
            "{$scheme}://payment/{$payment->order_id}?status={$status}"
        );
    }

    /**
     * Finishes a top-up that came back through the shared callback.
     *
     * Nothing in the query string is believed — the same rule the order
     * callback follows. The bank is asked directly, and WalletService is the
     * one place that decides whether money moves, so a replayed callback
     * credits nothing the second time.
     */
    private function completeTopupCallback(WalletTopup $topup, string $scheme): RedirectResponse
    {
        try {
            $bankOrder = app(\App\Services\KapitalGateway::class)->getOrder((string) $topup->transaction_ref);
            $mapped = config('kapital.status_map')[(string) ($bankOrder['status'] ?? '')] ?? 'pending';

            $settled = $bankOrder['clearedChargeAmount'] ?? $bankOrder['amount'] ?? null;
            if ($mapped === 'paid' && $settled !== null
                && abs((float) $settled - (float) $topup->amount) > 0.001) {
                Log::error('Top-up callback settled a different amount', [
                    'topup_id' => $topup->id,
                    'expected' => (float) $topup->amount,
                    'settled' => (float) $settled,
                ]);
                $mapped = 'amount_mismatch';
            }

            $this->wallet->settleTopup($topup, $mapped);
            $status = $mapped;
        } catch (KapitalException $e) {
            Log::warning('Top-up callback verification failed', [
                'topup_id' => $topup->id,
                'error' => $e->getMessage(),
            ]);
            $status = 'unconfirmed';
        }

        return redirect()->away("{$scheme}://wallet?topup={$topup->id}&status={$status}");
    }

    /**
     * Refund, for staff only.
     *
     * Customers cannot refund themselves — this moves money out, so it sits
     * behind the same admin check the dispatch console uses.
     */
    public function refund(Request $request, string $order): JsonResponse
    {
        $profile = $this->profile($request);
        if (! $profile->isAdmin()) {
            return response()->json(['message' => 'Only staff can issue refunds.'], 403);
        }

        $validated = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'same_day' => ['boolean'],
        ]);

        $payment = Payment::query()
            ->where('order_id', $order)
            ->where('status', 'paid')
            ->latest('created_at')
            ->firstOrFail();

        try {
            $result = $this->payments->refund(
                $payment,
                isset($validated['amount']) ? (float) $validated['amount'] : null,
                (bool) ($validated['same_day'] ?? false),
            );
        } catch (KapitalException $e) {
            Log::warning('Refund failed', ['order_id' => $order, 'error' => $e->getMessage()]);

            return response()->json(['message' => 'The refund could not be processed.'], 502);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $result]);
    }
}
