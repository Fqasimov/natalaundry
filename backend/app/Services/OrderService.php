<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Profile;
use App\Models\PromoCode;
use App\Models\UserReward;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Order lifecycle.
 *
 * Creation re-prices everything from the catalogue, so a tampered client
 * can't choose its own totals. The customer-facing `status` and the internal
 * `dispatch_state` advance independently, each stamping the matching
 * timestamp column the schema provides.
 */
class OrderService
{
    /** status → the next status a courier can move it to, and what to stamp. */
    private const STATUS_FLOW = [
        'collecting' => ['next' => 'cleaning', 'stamps' => ['collected_at', 'cleaning_started_at']],
        'cleaning' => ['next' => 'delivering', 'stamps' => ['delivering_at']],
        'delivering' => ['next' => 'completed', 'stamps' => ['delivered_at']],
    ];

    public function __construct(
        private readonly PricingService $pricing,
        private readonly CatalogService $catalog,
        private readonly GiftBoxService $giftBoxes,
    ) {}

    /**
     * @param  array{
     *   items: array<int, array{service_id: string, item_id: string, quantity: int}>,
     *   delivery_tier: string, collection_time: string, delivery_time: string,
     *   address?: ?string, address_lat?: ?float, address_lng?: ?float,
     *   notes?: ?string, is_outside_city?: bool, item_photos?: array<int, string>,
     *   promo_code?: ?string, user_reward_id?: ?string, payment_method?: ?string
     * }  $payload
     */
    public function create(Profile $profile, array $payload): Order
    {
        $photos = $payload['item_photos'] ?? [];
        $required = (int) config('nata.required_photos');
        if (count($photos) < $required) {
            // Mirrors the app's hard gate: "Sifarişi davam etdirmək üçün ən azı
            // 3 ədəd paltar şəkli yükləməlisiniz."
            throw ValidationException::withMessages([
                'item_photos' => ["At least {$required} garment photos are required."],
            ]);
        }

        $tier = $payload['delivery_tier'];
        if (! in_array($tier, config('nata.delivery.tiers'), true)) {
            throw ValidationException::withMessages([
                'delivery_tier' => ["Unknown delivery tier [{$tier}]."],
            ]);
        }

        // Re-resolve every line against the server catalogue.
        $lines = [];
        foreach ($payload['items'] as $item) {
            $resolved = $this->catalog->resolve($item['service_id'], $item['item_id']);
            $quantity = max(1, (int) $item['quantity']);
            $lines[] = [
                'service_id' => $item['service_id'],
                'item_id' => $item['item_id'],
                'item_name' => $resolved['name'],
                'price' => $resolved['price'],
                'quantity' => $quantity,
            ];
        }

        if ($lines === []) {
            throw ValidationException::withMessages(['items' => ['An order needs at least one item.']]);
        }

        $isOutsideCity = (bool) ($payload['is_outside_city'] ?? false);
        $subtotal = $this->pricing->subtotal($lines);

        [$discount, $promo, $userReward] = $this->resolveDiscounts(
            $profile,
            $subtotal,
            $payload['promo_code'] ?? null,
            $payload['user_reward_id'] ?? null,
        );

        $breakdown = $this->pricing->breakdown($lines, $tier, $isOutsideCity, $discount);

        // A free-delivery reward zeroes the fee after the tier is priced.
        if ($userReward && $this->giftBoxes->waivesDelivery($userReward)) {
            $breakdown['delivery_fee'] = 0.0;
            $breakdown['total'] = round(
                max(0, $breakdown['subtotal'] - $breakdown['discount']),
                2
            );
        }

        return DB::transaction(function () use (
            $profile, $payload, $tier, $lines, $breakdown, $isOutsideCity, $photos, $promo, $userReward
        ) {
            $order = Order::create([
                'user_id' => $profile->id,
                'status' => 'pending',
                'dispatch_state' => 'awaiting_admin',
                'delivery_tier' => $tier,
                'service_type' => $lines[0]['service_id'],
                'subtotal' => $breakdown['subtotal'],
                'discount' => $breakdown['discount'],
                'delivery_fee' => $breakdown['delivery_fee'],
                'total' => $breakdown['total'],
                'collection_time' => $payload['collection_time'],
                'delivery_time' => $payload['delivery_time'],
                'address' => $payload['address'] ?? null,
                'address_lat' => $payload['address_lat'] ?? null,
                'address_lng' => $payload['address_lng'] ?? null,
                'notes' => $payload['notes'] ?? null,
                'is_outside_city' => $isOutsideCity,
                'item_photos' => array_values($photos),
                'payment_method' => $payload['payment_method'] ?? null,
                'payment_status' => 'pending',
                'reward_id' => $userReward?->id,
            ]);

            $order->items()->createMany($lines);

            if ($promo) {
                $promo->increment('redemptions');
            }

            if ($userReward) {
                $this->giftBoxes->markUsed($userReward, $order->id);
            }

            return $order->load('items');
        });
    }

    /**
     * @return array{0: float, 1: ?PromoCode, 2: ?UserReward}
     */
    private function resolveDiscounts(
        Profile $profile,
        float $subtotal,
        ?string $promoCode,
        ?string $userRewardId
    ): array {
        $discount = 0.0;
        $promo = null;
        $userReward = null;

        if ($promoCode) {
            $promo = PromoCode::query()->where('code', strtoupper(trim($promoCode)))->first();
            if (! $promo || ! $promo->isRedeemable($subtotal)) {
                throw ValidationException::withMessages([
                    'promo_code' => ['This promo code is not valid for this order.'],
                ]);
            }
            $discount += $promo->discountFor($subtotal);
        }

        if ($userRewardId) {
            $userReward = UserReward::query()
                ->with('reward')
                ->where('id', $userRewardId)
                ->where('user_id', $profile->id)
                ->first();

            if (! $userReward || ! $userReward->isSpendable()) {
                throw ValidationException::withMessages([
                    'user_reward_id' => ['This reward is not available.'],
                ]);
            }
            $discount += $this->giftBoxes->discountValue($userReward, $subtotal);
        }

        return [round(min($discount, $subtotal), 2), $promo, $userReward];
    }

    /** "Users can cancel their own pending orders." */
    public function cancel(Order $order): Order
    {
        if (! $order->isCancellable()) {
            throw new RuntimeException('Only pending orders can be cancelled.');
        }

        $order->status = 'cancelled';
        $order->save();

        return $order;
    }

    /** A courier claims an unassigned pending order. */
    public function claim(Order $order, Profile $courier): Order
    {
        if (! $courier->isCourier()) {
            throw new RuntimeException('Only couriers can claim orders.');
        }

        $claimed = DB::transaction(function () use ($order, $courier) {
            $affected = Order::query()
                ->whereKey($order->id)
                ->where('status', 'pending')
                ->whereNull('courier_id')
                ->update([
                    'courier_id' => $courier->id,
                    'status' => 'collecting',
                    'dispatch_state' => 'assigned',
                    'assigned_at' => now(),
                ]);

            return $affected > 0;
        });

        if (! $claimed) {
            throw new RuntimeException('This order has already been taken.');
        }

        return $order->refresh();
    }

    /** Advance an assigned order one step through the flow. */
    public function advance(Order $order, Profile $courier): Order
    {
        if ($order->courier_id !== $courier->id) {
            throw new RuntimeException('Only the assigned courier can advance this order.');
        }

        $step = self::STATUS_FLOW[$order->status] ?? null;
        if (! $step) {
            throw new RuntimeException("Order cannot advance from [{$order->status}].");
        }

        $order->status = $step['next'];
        foreach ($step['stamps'] as $column) {
            $order->{$column} = now();
        }
        $order->save();

        return $order;
    }

    /** Admin approves a pending order so it can be offered to couriers. */
    public function approve(Order $order): Order
    {
        $order->dispatch_state = 'approved';
        $order->approved_at = now();
        $order->save();

        return $order;
    }
}
