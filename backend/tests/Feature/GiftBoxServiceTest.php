<?php

namespace Tests\Feature;

use App\Models\GiftBoxOpening;
use App\Models\Order;
use App\Models\Profile;
use App\Models\Reward;
use App\Models\UserReward;
use App\Services\GiftBoxService;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class GiftBoxServiceTest extends TestCase
{
    private GiftBoxService $giftBoxes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->giftBoxes = app(GiftBoxService::class);
    }

    private function customer(array $attributes = []): Profile
    {
        return Profile::forceCreate(array_merge([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'phone' => '+994500000000',
            'role' => 'user',
            'points' => 100,
            'wallet_balance' => 0,
            'created_at' => now(),
        ], $attributes));
    }

    private function reward(string $kind, array $value, string $tier, string $title = 'Prize'): Reward
    {
        return Reward::create([
            'kind' => $kind,
            'title' => $title,
            'description' => 'Test reward',
            'value' => $value,
            'weight' => 1,
            'box_tier' => $tier,
            'active' => true,
        ]);
    }

    /**
     * One prize per opening, checked from a stale "available" verdict — the
     * state a second request holds when both reach the gate together.
     *
     * This does not prove the concurrency fix: the suite is single-process
     * against SQLite, so it cannot make two openings overlap, and this passes
     * against the check-then-write version too. What stops the real race is
     * the eligibility check running inside the transaction against a locked
     * profile row; this pins the sequential half of that contract.
     */
    public function test_the_daily_box_cannot_be_opened_twice(): void
    {
        $this->reward('eco_care_package', [], GiftBoxService::TIER_DAILY);
        $customer = $this->customer();

        // Both requests reach the gate before either has written anything.
        $first = $this->giftBoxes->availability($customer, GiftBoxService::TIER_DAILY);
        $second = $this->giftBoxes->availability($customer, GiftBoxService::TIER_DAILY);
        $this->assertTrue($first['available']);
        $this->assertTrue($second['available']);

        $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);

        $this->expectException(RuntimeException::class);
        $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);
    }

    /** One completed order grants one prize, not one per request. */
    public function test_a_gold_box_cannot_be_opened_twice_for_one_order(): void
    {
        $this->reward('eco_care_package', [], GiftBoxService::TIER_GOLD);
        $customer = $this->customer();
        $order = Order::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'status' => 'completed',
            'subtotal' => 10,
            'discount' => 0,
            'delivery_fee' => 0,
            'total' => 10,
            'collection_time' => 'Bu gün, 18:00 - 20:00',
            'delivery_time' => 'Sabah, 12:00 - 14:00',
            'created_at' => now(),
        ]);

        $this->giftBoxes->open($customer, GiftBoxService::TIER_GOLD, $order->id);

        $this->expectException(RuntimeException::class);
        $this->giftBoxes->open($customer, GiftBoxService::TIER_GOLD, $order->id);
    }

    public function test_the_daily_box_can_be_opened_once_then_enters_cooldown(): void
    {
        $this->reward('eco_care_package', [], GiftBoxService::TIER_DAILY);
        $customer = $this->customer();

        $this->assertTrue($this->giftBoxes->availability($customer, GiftBoxService::TIER_DAILY)['available']);

        $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);

        $after = $this->giftBoxes->availability($customer, GiftBoxService::TIER_DAILY);
        $this->assertFalse($after['available']);
        $this->assertSame('cooldown', $after['reason']);
        $this->assertNotNull($after['next_available_at']);

        $this->expectException(RuntimeException::class);
        $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);
    }

    public function test_the_daily_box_reopens_after_the_cooldown(): void
    {
        $this->reward('eco_care_package', [], GiftBoxService::TIER_DAILY);
        $customer = $this->customer();

        $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);

        // Backdate the opening past the cooldown window.
        GiftBoxOpening::query()->update(['opened_at' => now()->subHours(25)]);

        $this->assertTrue($this->giftBoxes->availability($customer, GiftBoxService::TIER_DAILY)['available']);
    }

    public function test_the_vip_box_requires_an_active_subscription(): void
    {
        $this->reward('vip_care_package', [], GiftBoxService::TIER_VIP);

        $plain = $this->customer();
        $this->assertSame(
            'subscription_required',
            $this->giftBoxes->availability($plain, GiftBoxService::TIER_VIP)['reason'],
        );

        $subscriber = $this->customer([
            'is_subscribed' => true,
            'subscription_expires_at' => now()->addMonth(),
        ]);
        $this->assertTrue($this->giftBoxes->availability($subscriber, GiftBoxService::TIER_VIP)['available']);
    }

    public function test_an_expired_subscription_does_not_unlock_the_vip_box(): void
    {
        $lapsed = $this->customer([
            'is_subscribed' => true,
            'subscription_expires_at' => now()->subDay(),
        ]);

        $this->assertFalse($this->giftBoxes->availability($lapsed, GiftBoxService::TIER_VIP)['available']);
    }

    public function test_the_gold_box_needs_a_completed_order_and_opens_once_per_order(): void
    {
        $this->reward('free_express_delivery', [], GiftBoxService::TIER_GOLD);
        $customer = $this->customer();

        $order = Order::create([
            'user_id' => $customer->id,
            'status' => 'delivering',
            'delivery_tier' => 'standard',
            'subtotal' => 20, 'discount' => 0, 'delivery_fee' => 5, 'total' => 25,
            'collection_time' => 'Sabah', 'delivery_time' => 'Sabah',
            'created_at' => now(),
        ]);

        $this->assertSame(
            'order_not_completed',
            $this->giftBoxes->availability($customer, GiftBoxService::TIER_GOLD, $order->id)['reason'],
        );

        $order->update(['status' => 'completed']);
        $this->assertTrue(
            $this->giftBoxes->availability($customer, GiftBoxService::TIER_GOLD, $order->id)['available'],
        );

        $this->giftBoxes->open($customer, GiftBoxService::TIER_GOLD, $order->id);

        $this->assertSame(
            'already_opened',
            $this->giftBoxes->availability($customer, GiftBoxService::TIER_GOLD, $order->id)['reason'],
        );
    }

    public function test_a_balance_reward_credits_the_wallet_immediately(): void
    {
        $this->reward('balance_bonus', ['amount' => 4], GiftBoxService::TIER_DAILY, '4 AZN Balans Bonusu');
        $customer = $this->customer(['wallet_balance' => 10]);

        $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);

        $this->assertSame('14.00', (string) $customer->fresh()->wallet_balance);
        $this->assertDatabaseHas('wallet_transactions', ['user_id' => $customer->id, 'kind' => 'reward']);
    }

    public function test_an_eco_points_reward_adds_points(): void
    {
        $this->reward('eco_points', ['points' => 100], GiftBoxService::TIER_DAILY);
        $customer = $this->customer(['points' => 100]);

        $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);

        $this->assertSame(200, $customer->fresh()->points);
    }

    public function test_rewards_expire_after_the_configured_window(): void
    {
        $this->reward('discount_coupon', ['percent' => 20], GiftBoxService::TIER_DAILY);
        $customer = $this->customer();

        $userReward = $this->giftBoxes->open($customer, GiftBoxService::TIER_DAILY);

        $this->assertEqualsWithDelta(
            (int) config('nata.rewards.ttl_days'),
            now()->diffInDays($userReward->expires_at),
            1,
        );
        $this->assertTrue($userReward->isSpendable());
    }

    public function test_an_expired_reward_is_worth_nothing(): void
    {
        $reward = $this->reward('discount_coupon', ['percent' => 20], GiftBoxService::TIER_DAILY);
        $customer = $this->customer();

        $expired = UserReward::create([
            'user_id' => $customer->id,
            'reward_id' => $reward->id,
            'won_at' => now()->subDays(10),
            'expires_at' => now()->subDays(3),
        ]);

        $this->assertFalse($expired->isSpendable());
        $this->assertSame(0.0, $this->giftBoxes->discountValue($expired->load('reward'), 100));
        $this->assertCount(0, $this->giftBoxes->activeRewards($customer));
    }

    public function test_a_percentage_coupon_is_worth_its_share_of_the_subtotal(): void
    {
        $reward = $this->reward('discount_coupon', ['percent' => 20], GiftBoxService::TIER_DAILY);
        $customer = $this->customer();

        $userReward = UserReward::create([
            'user_id' => $customer->id,
            'reward_id' => $reward->id,
            'won_at' => now(),
            'expires_at' => now()->addDays(7),
        ]);

        $this->assertSame(7.40, $this->giftBoxes->discountValue($userReward->load('reward'), 37));
    }

    public function test_opening_a_tier_with_no_configured_rewards_fails_loudly(): void
    {
        $this->expectException(RuntimeException::class);
        $this->giftBoxes->open($this->customer(), GiftBoxService::TIER_DAILY);
    }
}
