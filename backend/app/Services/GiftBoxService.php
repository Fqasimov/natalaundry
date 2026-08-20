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
 * Three tiers, each with its own unlock rule:
 *  - daily_bronze   free, once every 24h
 *  - gold           granted once per completed order
 *  - legendary_vip  Nata Plus / VIP subscribers only
 *
 * The prize is drawn server-side by weight; the client only plays the
 * animation. Rewards expire 7 days after being won, matching the
 * "7 gün qaldı (1 həftəlik)" copy in the app.
 */
class GiftBoxService
{
    public const TIER_DAILY = 'daily_bronze';

    public const TIER_GOLD = 'gold';

    public const TIER_VIP = 'legendary_vip';

    /**
     * Why a tier can or can't be opened right now.
     *
     * @return array{available: bool, reason: ?string, next_available_at: ?string}
     */
    public function availability(Profile $profile, string $tier, ?string $orderId = null): array
    {
        return match ($tier) {
            self::TIER_DAILY => $this->dailyAvailability($profile),
            self::TIER_GOLD => $this->goldAvailability($profile, $orderId),
            self::TIER_VIP => $profile->hasActiveSubscription()
                ? ['available' => true, 'reason' => null, 'next_available_at' => null]
                : ['available' => false, 'reason' => 'subscription_required', 'next_available_at' => null],
            default => throw new RuntimeException("Unknown gift box tier [{$tier}]."),
        };
    }

    private function dailyAvailability(Profile $profile): array
    {
        $cooldownHours = (int) config('nata.rewards.daily_box_cooldown_hours');

        $last = GiftBoxOpening::query()
            ->where('user_id', $profile->id)
            ->where('box_tier', self::TIER_DAILY)
            ->latest('opened_at')
            ->first();

        if (! $last) {
            return ['available' => true, 'reason' => null, 'next_available_at' => null];
        }

        $next = $last->opened_at->copy()->addHours($cooldownHours);
        if ($next->isFuture()) {
            return [
                'available' => false,
                'reason' => 'cooldown',
                'next_available_at' => $next->toIso8601String(),
            ];
        }

        return ['available' => true, 'reason' => null, 'next_available_at' => null];
    }

    private function goldAvailability(Profile $profile, ?string $orderId): array
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
            ->where('box_tier', self::TIER_GOLD)
            ->where('order_id', $orderId)
            ->exists();

        return $alreadyOpened
            ? ['available' => false, 'reason' => 'already_opened', 'next_available_at' => null]
            : ['available' => true, 'reason' => null, 'next_available_at' => null];
    }

    /**
     * Open a box: draw a prize, grant it, and log the opening.
     */
    public function open(Profile $profile, string $tier, ?string $orderId = null): UserReward
    {
        $availability = $this->availability($profile, $tier, $orderId);
        if (! $availability['available']) {
            throw new RuntimeException("Gift box unavailable: {$availability['reason']}");
        }

        return DB::transaction(function () use ($profile, $tier, $orderId) {
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
