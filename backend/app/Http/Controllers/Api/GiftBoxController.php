<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use App\Services\GiftBoxService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class GiftBoxController extends Controller
{
    public function __construct(private readonly GiftBoxService $giftBoxes) {}

    private function profile(Request $request): Profile
    {
        return $request->attributes->get('profile');
    }

    /** Powers the "Hədiyyə Qutusu" screen. */
    public function index(Request $request): JsonResponse
    {
        $profile = $this->profile($request);

        // One box per finalised order, so the screen lists the orders that
        // still have an unopened one rather than a fixed set of tiers.
        $boxes = $this->giftBoxes->unopenedBoxes($profile)->map(fn ($order) => [
            'order_id' => $order->id,
            'order_no' => $order->order_no,
            'total' => (float) $order->total,
            'completed_at' => $order->delivered_at?->toIso8601String(),
        ]);

        return response()->json([
            'active_rewards' => $this->giftBoxes->activeRewards($profile)->map(fn ($userReward) => [
                'id' => $userReward->id,
                'kind' => $userReward->reward->kind,
                'title' => $userReward->reward->title,
                'description' => $userReward->reward->description,
                'value' => $userReward->reward->value,
                'won_at' => $userReward->won_at?->toIso8601String(),
                'expires_at' => $userReward->expires_at->toIso8601String(),
                'days_left' => max(0, (int) ceil(now()->diffInHours($userReward->expires_at, false) / 24)),
            ]),
            'boxes' => $boxes,
            'ttl_days' => (int) config('nata.rewards.ttl_days'),
        ]);
    }

    public function open(Request $request): JsonResponse
    {
        // A box exists because an order was completed, so the order is what
        // identifies it. There is no tier to choose any more.
        $data = $request->validate([
            'order_id' => ['required', 'uuid'],
        ]);

        try {
            $userReward = $this->giftBoxes->open(
                $this->profile($request),
                GiftBoxService::TIER_ORDER,
                $data['order_id'],
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'id' => $userReward->id,
            'kind' => $userReward->reward->kind,
            'title' => $userReward->reward->title,
            'description' => $userReward->reward->description,
            'value' => $userReward->reward->value,
            'expires_at' => $userReward->expires_at->toIso8601String(),
        ], 201);
    }
}
