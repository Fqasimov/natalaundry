<?php

namespace App\Services;

use App\Models\Order;
use App\Models\PromoCode;
use App\Models\Profile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Promo codes, and the first-order welcome discount in particular.
 *
 * ILK20 is not typed in by the customer — it is offered on the home screen and
 * applied automatically to their first order. "First" means the customer has
 * no order that reached a paid-for state: a cancelled attempt must not burn
 * the discount, so cancelled orders are excluded from the check.
 */
class PromoService
{
    public function firstOrderCode(): string
    {
        return (string) config('nata.promo.first_order_code');
    }

    /** Has this customer never completed an order that consumed the offer? */
    public function isEligibleForFirstOrder(Profile $customer): bool
    {
        if (! config('nata.promo.first_order_enabled')) {
            return false;
        }

        return ! Order::query()
            ->where('user_id', $customer->id)
            ->where('status', '!=', 'cancelled')
            ->exists();
    }

    /**
     * The discount the first-order code is worth against `$subtotal`, or 0
     * when the customer isn't eligible.
     */
    public function firstOrderDiscount(Profile $customer, float $subtotal): float
    {
        if (! $this->isEligibleForFirstOrder($customer)) {
            return 0.0;
        }

        $percent = (float) config('nata.promo.first_order_percent');

        return round($subtotal * ($percent / 100), 2);
    }

    /**
     * Resolve the discount for an order about to be written.
     *
     * An explicitly entered code wins over the automatic first-order offer, so
     * a customer holding a better campaign code isn't silently downgraded; if
     * the typed code is worth less, the automatic one still applies.
     *
     * @return array{code: ?string, discount: float}
     */
    public function resolveForOrder(Profile $customer, float $subtotal, ?string $enteredCode = null): array
    {
        $best = ['code' => null, 'discount' => 0.0];

        if ($enteredCode !== null && trim($enteredCode) !== '') {
            $code = PromoCode::query()
                ->whereRaw('UPPER(code) = ?', [Str::upper(trim($enteredCode))])
                ->first();

            if ($code && $code->isRedeemable($subtotal)) {
                $best = ['code' => $code->code, 'discount' => $code->discountFor($subtotal)];
            }
        }

        $auto = $this->firstOrderDiscount($customer, $subtotal);
        if ($auto > $best['discount']) {
            $best = ['code' => $this->firstOrderCode(), 'discount' => $auto];
        }

        return $best;
    }

    /**
     * Count a redemption once the order exists. Incremented atomically so
     * concurrent orders can't push a capped code past max_redemptions.
     */
    public function recordRedemption(Order $order): void
    {
        if (! $order->promo_code) {
            return;
        }

        DB::transaction(function () use ($order) {
            $code = PromoCode::query()
                ->whereRaw('UPPER(code) = ?', [Str::upper($order->promo_code)])
                ->lockForUpdate()
                ->first();

            if ($code) {
                $code->forceFill(['redemptions' => $code->redemptions + 1])->save();
            }
        });
    }

    /**
     * Make sure the first-order code exists as a row, so it shows up in the
     * admin's promo list and shares the redemption bookkeeping of any other
     * code rather than being a special case invented in application code.
     */
    public function ensureFirstOrderCode(): PromoCode
    {
        return PromoCode::query()->firstOrCreate(
            ['code' => $this->firstOrderCode()],
            [
                'id' => (string) Str::uuid(),
                'kind' => 'percent',
                'value' => (float) config('nata.promo.first_order_percent'),
                'min_subtotal' => 0,
                'max_redemptions' => null,
                'redemptions' => 0,
                'active' => true,
                'created_at' => Carbon::now(),
            ],
        );
    }
}
