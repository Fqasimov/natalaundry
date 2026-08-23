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

    /** A finalised order — the only thing that grants a box. */
    private function completedOrder(Profile $customer): Order
    {
        return Order::forceCreate([
            'id' => (string) Str::uuid(),
            'user_id' => $customer->id,
            'status' => 'completed',
            'delivery_tier' => 'standard',
            'subtotal' => 20, 'discount' => 0, 'delivery_fee' => 5, 'total' => 25,
            'collection_time' => 'Bu gün, 18:00 - 20:00',
            'delivery_time' => 'Sabah, 12:00 - 14:00',
            'delivered_at' => now(),
            'created_at' => now(),
        ]);
    }

    /** One completed order grants one prize, not one per request. */
    public function test_a_box_cannot_be_opened_twice_for_one_order(): void
    {
        $this->reward('eco_care_package', [], GiftBoxService::TIER_ORDER);
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

        $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $order->id);

        $this->expectException(RuntimeException::class);
        $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $order->id);
    }





    public function test_a_box_needs_a_completed_order_and_opens_once_per_order(): void
    {
        $this->reward('free_express_delivery', [], GiftBoxService::TIER_ORDER);
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
            $this->giftBoxes->availability($customer, GiftBoxService::TIER_ORDER, $order->id)['reason'],
        );

        $order->update(['status' => 'completed']);
        $this->assertTrue(
            $this->giftBoxes->availability($customer, GiftBoxService::TIER_ORDER, $order->id)['available'],
        );

        $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $order->id);

        $this->assertSame(
            'already_opened',
            $this->giftBoxes->availability($customer, GiftBoxService::TIER_ORDER, $order->id)['reason'],
        );
    }

    public function test_a_balance_reward_credits_the_wallet_immediately(): void
    {
        $this->reward('balance_bonus', ['amount' => 4], GiftBoxService::TIER_ORDER, '4 AZN Balans Bonusu');
        $customer = $this->customer(['wallet_balance' => 10]);

        $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $this->completedOrder($customer)->id);

        $this->assertSame('14.00', (string) $customer->fresh()->wallet_balance);
        $this->assertDatabaseHas('wallet_transactions', ['user_id' => $customer->id, 'kind' => 'reward']);
    }

    public function test_an_eco_points_reward_adds_points(): void
    {
        $this->reward('eco_points', ['points' => 100], GiftBoxService::TIER_ORDER);
        $customer = $this->customer(['points' => 100]);

        $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $this->completedOrder($customer)->id);

        $this->assertSame(200, $customer->fresh()->points);
    }

    public function test_rewards_expire_after_the_configured_window(): void
    {
        $this->reward('discount_coupon', ['percent' => 20], GiftBoxService::TIER_ORDER);
        $customer = $this->customer();

        $userReward = $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $this->completedOrder($customer)->id);

        $this->assertEqualsWithDelta(
            (int) config('nata.rewards.ttl_days'),
            now()->diffInDays($userReward->expires_at),
            1,
        );
        $this->assertTrue($userReward->isSpendable());
    }

    public function test_an_expired_reward_is_worth_nothing(): void
    {
        $reward = $this->reward('discount_coupon', ['percent' => 20], GiftBoxService::TIER_ORDER);
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
        $reward = $this->reward('discount_coupon', ['percent' => 20], GiftBoxService::TIER_ORDER);
        $customer = $this->customer();

        $userReward = UserReward::create([
            'user_id' => $customer->id,
            'reward_id' => $reward->id,
            'won_at' => now(),
            'expires_at' => now()->addDays(7),
        ]);

        $this->assertSame(7.40, $this->giftBoxes->discountValue($userReward->load('reward'), 37));
    }

    public function test_opening_with_no_configured_rewards_fails_loudly(): void
    {
        $customer = $this->customer();

        $this->expectException(RuntimeException::class);
        $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $this->completedOrder($customer)->id);
    }

    /** There is no standing box: without a finalised order there is nothing to open. */
    public function test_there_is_no_box_without_a_finalised_order(): void
    {
        $this->reward('eco_points', ['points' => 50], GiftBoxService::TIER_ORDER);
        $customer = $this->customer();

        $this->assertSame(
            'order_required',
            $this->giftBoxes->availability($customer, GiftBoxService::TIER_ORDER)['reason'],
        );
        $this->assertCount(0, $this->giftBoxes->unopenedBoxes($customer));

        $order = $this->completedOrder($customer);
        $this->assertCount(1, $this->giftBoxes->unopenedBoxes($customer));

        $this->giftBoxes->open($customer, GiftBoxService::TIER_ORDER, $order->id);
        $this->assertCount(0, $this->giftBoxes->unopenedBoxes($customer));
    }
}
