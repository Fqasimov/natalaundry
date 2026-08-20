<?php

namespace App\Services;

use InvalidArgumentException;

/**
 * Server-side pricing. The mobile app computes the same numbers locally so it
 * can show a live estimate, but nothing it sends is trusted: every order is
 * repriced here from the catalogue and the request's structural choices
 * (tier, outside-city flag, promo, reward).
 */
class PricingService
{
    /**
     * @param  array<int, array{price: float|int, quantity: int}>  $lines
     */
    public function subtotal(array $lines): float
    {
        $sum = 0.0;
        foreach ($lines as $line) {
            $sum += ((float) $line['price']) * ((int) $line['quantity']);
        }

        return round($sum, 2);
    }

    public function deliveryFee(float $subtotal, string $tier, bool $isOutsideCity = false): float
    {
        $config = config('nata.delivery');

        if (! in_array($tier, $config['tiers'], true)) {
            throw new InvalidArgumentException("Unknown delivery tier [{$tier}].");
        }

        $base = $subtotal >= (float) $config['free_threshold'] ? 0.0 : (float) $config['base_fee'];
        $surcharge = (float) ($config['tier_surcharge'][$tier] ?? 0);
        $outside = $isOutsideCity ? (float) $config['outside_city_fee'] : 0.0;

        return round($base + $surcharge + $outside, 2);
    }

    /**
     * Full breakdown for an order.
     *
     * @param  array<int, array{price: float|int, quantity: int}>  $lines
     * @return array{subtotal: float, delivery_fee: float, discount: float, total: float,
     *               qualifies_for_free_delivery: bool, amount_to_free_delivery: float}
     */
    public function breakdown(
        array $lines,
        string $tier,
        bool $isOutsideCity = false,
        float $discount = 0.0
    ): array {
        $subtotal = $this->subtotal($lines);
        $deliveryFee = $this->deliveryFee($subtotal, $tier, $isOutsideCity);
        $discount = round(min($discount, $subtotal), 2);
        $threshold = (float) config('nata.delivery.free_threshold');

        return [
            'subtotal' => $subtotal,
            'delivery_fee' => $deliveryFee,
            'discount' => $discount,
            'total' => round(max(0, $subtotal + $deliveryFee - $discount), 2),
            'qualifies_for_free_delivery' => $subtotal >= $threshold,
            'amount_to_free_delivery' => round(max(0, $threshold - $subtotal), 2),
        ];
    }
}
