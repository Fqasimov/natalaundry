<?php

namespace App\Services;

use App\Models\GiftBoxOpening;
use App\Models\Order;
use App\Models\Profile;
use App\Models\Reward;
use App\Models\UserReward;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * "Hədiyyə Qutusu" — the gift box feature.
 *
 * One box, fifty prizes, earned by finalising an order. There used to be
 * three tiers (a free daily one, one per order, and a subscriber-only one);
 * the daily box handed out balance for no purchase and the VIP box gated
 * prizes behind a subscription that is not live, so both are gone. A box now
 * exists only because an order was completed, and each order grants exactly
 * one.
 *
 * The prize is drawn server-side by weight; the client only plays the
 * animation. Rewards expire 7 days after being won, matching the
 * "7 gün qaldı (1 həftəlik)" copy in the app.
 */
class GiftBoxService
{
    /** The only tier. One box per completed order. */
    public const TIER_ORDER = 'order';

    /**
     * Why this order's box can or can't be opened right now.
     *
     * @return array{available: bool, reason: ?string, next_available_at: ?string}
     */
    public function availability(Profile $profile, string $tier = self::TIER_ORDER, ?string $orderId = null): array
    {
        if ($tier !== self::TIER_ORDER) {
            throw new RuntimeException("Unknown gift box tier [{$tier}].");
        }

        return $this->orderAvailability($profile, $orderId);
    }

    private function orderAvailability(Profile $profile, ?string $orderId): array
    {
        if (! $orderId) {
            return ['available' => false, 'reason' => 'order_required', 'next_available_at' => null];
        }

        $order = Order::query()
            ->where('id', $orderId)
            ->where('user_id', $profile->id)
            ->first();

        if (! $order) {
            return ['available' => false, 'reason' => 'order_not_found', 'next_available_at' => null];
        }

        if ($order->status !== 'completed') {
            return ['available' => false, 'reason' => 'order_not_completed', 'next_available_at' => null];
        }

        $alreadyOpened = GiftBoxOpening::query()
            ->where('user_id', $profile->id)
            ->where('box_tier', self::TIER_ORDER)
            ->where('order_id', $orderId)
            ->exists();

        return $alreadyOpened
            ? ['available' => false, 'reason' => 'already_opened', 'next_available_at' => null]
            : ['available' => true, 'reason' => null, 'next_available_at' => null];
    }

    /**
     * The customer's finalised orders whose box is still unopened.
     *
     * This is what makes the box "available only after finalising an order":
     * there is no standing box to open, only the ones an order earned.
     *
     * @return \Illuminate\Support\Collection<int, Order>
     */
    public function unopenedBoxes(Profile $profile)
    {
        $opened = GiftBoxOpening::query()
            ->where('user_id', $profile->id)
            ->where('box_tier', self::TIER_ORDER)
            ->pluck('order_id');

        return Order::query()
            ->where('user_id', $profile->id)
            ->where('status', 'completed')
            ->whereNotIn('id', $opened)
            ->orderByDesc('delivered_at')
            ->get();
    }

    /**
     * Open a box: draw a prize, grant it, and log the opening.
     *
     * The eligibility check runs inside the transaction, against a locked
     * profile row. It used to run before it, which made this a check-then-write:
     * two taps in the same instant both read "available" and both got a prize,
     * so the daily box was openable as often as you could tap and one completed
     * order could pay out twice. Locking the profile serialises a given
     * customer's openings, and the re-check inside then rejects the loser.
     */
    public function open(Profile $profile, string $tier, ?string $orderId = null): UserReward
    {
        return DB::transaction(function () use ($profile, $tier, $orderId) {
            Profile::query()->lockForUpdate()->findOrFail($profile->id);

            $availability = $this->availability($profile, $tier, $orderId);
            if (! $availability['available']) {
                throw new RuntimeException("Gift box unavailable: {$availability['reason']}");
            }

            $reward = $this->draw($tier);

            $userReward = UserReward::create([
                'user_id' => $profile->id,
                'reward_id' => $reward->id,
                'won_at' => now(),
                'expires_at' => now()->addDays((int) config('nata.rewards.ttl_days')),
            ]);

            GiftBoxOpening::create([
                'user_id' => $profile->id,
                'box_tier' => $tier,
                'user_reward_id' => $userReward->id,
                'order_id' => $orderId,
                'opened_at' => now(),
            ]);

            // Some prizes pay out immediately rather than being spent later.
            $this->applyImmediateEffects($profile, $reward);

            return $userReward->load('reward');
        });
    }

    /** Weighted random draw across the active rewards for a tier. */
    private function draw(string $tier): Reward
    {
        $rewards = Reward::query()
            ->where('box_tier', $tier)
            ->where('active', true)
            ->get();

        if ($rewards->isEmpty()) {
            throw new RuntimeException("No active rewards configured for tier [{$tier}].");
        }

        $totalWeight = (int) $rewards->sum('weight');
        if ($totalWeight <= 0) {
            return $rewards->random();
        }

        $roll = random_int(1, $totalWeight);
        $cursor = 0;
        foreach ($rewards as $reward) {
            $cursor += max(1, (int) $reward->weight);
            if ($roll <= $cursor) {
                return $reward;
            }
        }

        return $rewards->last();
    }

    /**
     * Balance and points prizes land straight away; coupons and free-service
     * prizes stay pending until they're applied to an order.
     */
    private function applyImmediateEffects(Profile $profile, Reward $reward): void
    {
        $value = $reward->value ?? [];

        if ($reward->kind === 'balance_bonus' && ! empty($value['amount'])) {
            app(WalletService::class)->credit(
                $profile->id,
                (float) $value['amount'],
                'reward',
                $reward->title
            );
        }

        if ($reward->kind === 'eco_points' && ! empty($value['points'])) {
            $profile->increment('points', (int) $value['points']);
        }
    }

    /** Unspent, unexpired rewards — the "AKTİV MÜKAFATLAR" list. */
    public function activeRewards(Profile $profile)
    {
        return UserReward::query()
            ->with('reward')
            ->where('user_id', $profile->id)
            ->active()
            ->orderBy('expires_at')
            ->get();
    }

    /**
     * What a reward is worth against a given subtotal, in manat.
     * Free-delivery style prizes are handled by the pricing path instead.
     */
    public function discountValue(UserReward $userReward, float $subtotal): float
    {
        if (! $userReward->isSpendable()) {
            return 0.0;
        }

        $reward = $userReward->reward;
        $value = $reward->value ?? [];

        return match ($reward->kind) {
            'discount_coupon' => round($subtotal * ((float) ($value['percent'] ?? 0) / 100), 2),
            'balance_bonus' => min((float) ($value['amount'] ?? 0), $subtotal),
            default => 0.0,
        };
    }

    public function waivesDelivery(UserReward $userReward): bool
    {
        return $userReward->isSpendable()
            && $userReward->reward->kind === 'free_express_delivery';
    }

    public function markUsed(UserReward $userReward, ?string $orderId = null): void
    {
        $userReward->forceFill([
            'used_at' => now(),
            'used_on_order_id' => $orderId,
        ])->save();
    }
}
