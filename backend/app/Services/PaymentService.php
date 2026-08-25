<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Payment;
use App\Support\PaymentMethod;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Paying for an order.
 *
 * Two rules shape everything here:
 *
 * 1. **The amount is read from our own orders row.** Never from a request
 *    body, never from anything the bank echoes back. A client that could name
 *    its own charge could pay ₼0.01 for a ₼42 order, which is the same class
 *    of bug OrderService already guards against when it re-prices a basket.
 *
 * 2. **Paid status comes from GET /order/{id}, never from the redirect.**
 *    The customer arrives back on a URL of the form
 *    `?ID=1234&STATUS=FullyPaid`, and both of those are just query
 *    parameters — anyone can type them. The bank's own documentation also
 *    warns the value "can be temporary". So the callback is treated purely as
 *    a hint that something happened, and the real state is fetched.
 */
class PaymentService
{
    public function __construct(
        private readonly KapitalGateway $gateway,
    ) {}

    /**
     * Begins payment for an order.
     *
     * For cash this is only a bookkeeping change — nothing is collected until
     * the courier hands over the laundry. For card and wallets it opens an
     * order at the bank and returns the hosted-payment-page URL to send the
     * customer to.
     *
     * @return array{method: string, redirect_url: ?string, payment_id: string, bank_order_id: ?string}
     */
    public function start(Order $order, string $method, string $language = 'az'): array
    {
        if (! in_array($method, PaymentMethod::available(), true)) {
            throw new RuntimeException("Unsupported payment method [{$method}].");
        }

        if ($order->payment_status === 'paid') {
            throw new RuntimeException('This order has already been paid.');
        }

        if (in_array($order->status, ['cancelled', 'completed'], true)) {
            throw new RuntimeException("A {$order->status} order cannot be paid for.");
        }

        // What is actually owed, straight from the row the server priced.
        $amount = (float) $order->total;
        if ($amount <= 0) {
            throw new RuntimeException('This order has nothing to pay.');
        }

        return $method === PaymentMethod::CASH
            ? $this->startCash($order, $amount)
            : $this->startGateway($order, $method, $amount, $language);
    }

    /**
     * Cash on delivery. No gateway involved: the courier collects, and the
     * order is settled by hand later. `payment_status` stays 'pending' —
     * which is the truth, the money is not in yet.
     */
    private function startCash(Order $order, float $amount): array
    {
        $payment = DB::transaction(function () use ($order, $amount) {
            $order->forceFill([
                'payment_method' => PaymentMethod::CASH,
                'payment_status' => 'pending',
            ])->save();

            return Payment::create([
                'order_id' => $order->id,
                'amount' => $amount,
                'status' => 'pending',
                'payment_method' => PaymentMethod::CASH,
                'transaction_ref' => null,
                // Set explicitly rather than left to the column default: an
                // order can have several payment attempts and they are read
                // back newest-first, so this ordering has to be reliable.
                'created_at' => now(),
            ]);
        });

        return [
            'method' => PaymentMethod::CASH,
            'redirect_url' => null,
            'payment_id' => (string) $payment->id,
            'bank_order_id' => null,
        ];
    }

    /**
     * Card or wallet: open an order at the bank and hand back the HPP URL.
     *
     * The bank order id is stored on the Payment row before the customer is
     * sent anywhere, so the callback can always find its way back to our
     * order — including when the customer closes the browser mid-flow and we
     * only learn the outcome from a later status poll.
     */
    private function startGateway(Order $order, string $method, float $amount, string $language): array
    {
        $reference = 'Nata #'.($order->order_no ?? substr((string) $order->id, 0, 8));

        $bank = $this->gateway->createOrder(
            amount: $amount,
            reference: $reference,
            description: $reference,
            language: $language,
        );

        $payment = DB::transaction(function () use ($order, $method, $amount, $bank) {
            $order->forceFill([
                'payment_method' => $method,
                'payment_status' => 'pending',
            ])->save();

            return Payment::create([
                'order_id' => $order->id,
                'amount' => $amount,
                'status' => 'pending',
                'payment_method' => $method,
                'transaction_ref' => $bank['id'],
                'created_at' => now(),
            ]);
        });

        // Documented shape: {hppUrl}/flex?id={id}&password={password}.
        // hppUrl already ends in /flex in every observed response, so it is
        // only appended when missing rather than blindly concatenated.
        $base = rtrim($bank['hppUrl'], '/');
        if (! str_ends_with($base, '/flex')) {
            $base .= '/flex';
        }

        $redirect = $base.'?'.http_build_query([
            'id' => $bank['id'],
            'password' => $bank['password'],
        ]);

        return [
            'method' => $method,
            'redirect_url' => $redirect,
            'payment_id' => (string) $payment->id,
            'bank_order_id' => $bank['id'],
        ];
    }

    /**
     * Asks the bank what really happened, and settles our side to match.
     *
     * Safe to call as often as you like: from the browser callback, from the
     * app polling after it regains focus, or from a reconciliation job for
     * customers who closed the browser before being redirected. Each call
     * re-reads the bank and converges — it never double-applies, because the
     * state written is derived from the bank's status rather than accumulated.
     *
     * @return array{payment_status: string, bank_status: string, order_id: string}
     */
    public function verify(Payment $payment): array
    {
        if ($payment->transaction_ref === null) {
            throw new RuntimeException('This payment has no bank reference to verify.');
        }

        $bankOrder = $this->gateway->getOrder($payment->transaction_ref);
        $bankStatus = (string) ($bankOrder['status'] ?? 'Unknown');

        // Unknown statuses map to 'pending' — an unrecognised value must never
        // be read as "paid".
        $mapped = config('kapital.status_map')[$bankStatus] ?? 'pending';

        // Guard against a mismatched amount: if the bank settled a different
        // figure than we asked for, that is not a payment we can accept
        // silently. Recorded as a failure and flagged loudly instead.
        $settled = $bankOrder['clearedChargeAmount'] ?? $bankOrder['amount'] ?? null;
        if ($mapped === 'paid' && $settled !== null
            && abs((float) $settled - (float) $payment->amount) > 0.001) {
            Log::error('Kapital settled amount does not match the order', [
                'payment_id' => $payment->id,
                'order_id' => $payment->order_id,
                'expected' => (float) $payment->amount,
                'settled' => (float) $settled,
                'bank_order_id' => $payment->transaction_ref,
            ]);
            $mapped = 'amount_mismatch';
        }

        DB::transaction(function () use ($payment, $mapped, $bankStatus) {
            $payment->forceFill(['status' => $mapped])->save();

            $order = Order::query()->lockForUpdate()->find($payment->order_id);
            if (! $order) {
                return;
            }

            // Only ever move the order forward from this payment. A second,
            // later payment attempt on an already-paid order must not drag
            // payment_status back to 'pending'.
            if ($order->payment_status === 'paid' && $mapped !== 'refunded'
                && $mapped !== 'partially_refunded') {
                return;
            }

            $order->forceFill(['payment_status' => $mapped])->save();

            Log::info('Payment verified', [
                'order_id' => $order->id,
                'bank_status' => $bankStatus,
                'payment_status' => $mapped,
            ]);
        });

        return [
            'payment_status' => $mapped,
            'bank_status' => $bankStatus,
            'order_id' => (string) $payment->order_id,
        ];
    }

    /**
     * Refunds a paid order, fully or partially.
     *
     * Same-day cancellations reverse rather than refund where the bank still
     * allows it: a reversal drops the authorisation so the charge never
     * reaches the customer's statement, which is a better outcome than a
     * charge followed days later by a credit.
     */
    public function refund(Payment $payment, ?float $amount = null, bool $sameDay = false): array
    {
        if ($payment->transaction_ref === null) {
            throw new RuntimeException('This payment has no bank reference to refund.');
        }
        if ($payment->status !== 'paid') {
            throw new RuntimeException('Only a settled payment can be refunded.');
        }
        if ($amount !== null && $amount > (float) $payment->amount) {
            throw new RuntimeException('A refund cannot exceed the amount paid.');
        }

        $sameDay
            ? $this->gateway->reverse($payment->transaction_ref, $amount)
            : $this->gateway->refund($payment->transaction_ref, $amount);

        // Re-read rather than assuming the refund landed: verify() is the one
        // place that decides what a payment's state is.
        return $this->verify($payment);
    }

    /**
     * Finds the payment a bank callback refers to.
     *
     * The incoming ID is untrusted, so this is a plain lookup — if it matches
     * nothing, the callback is ignored rather than trusted.
     */
    public function findByBankOrderId(string $bankOrderId): ?Payment
    {
        return Payment::query()
            ->where('transaction_ref', $bankOrderId)
            ->latest('created_at')
            ->first();
    }
}
