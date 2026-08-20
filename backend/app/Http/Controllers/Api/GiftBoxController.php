<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Profile;
use App\Services\GiftBoxService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
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

        $tiers = [GiftBoxService::TIER_DAILY, GiftBoxService::TIER_GOLD, GiftBoxService::TIER_VIP];
        $boxes = [];
        foreach ($tiers as $tier) {
            $boxes[$tier] = $this->giftBoxes->availability($profile, $tier);
        }

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
        $data = $request->validate([
            'tier' => ['required', Rule::in([
                GiftBoxService::TIER_DAILY,
                GiftBoxService::TIER_GOLD,
                GiftBoxService::TIER_VIP,
            ])],
            'order_id' => ['nullable', 'uuid'],
        ]);

        try {
            $userReward = $this->giftBoxes->open(
                $this->profile($request),
                $data['tier'],
                $data['order_id'] ?? null,
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
