<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        return response()->json([
            'id' => $profile->id,
            'name' => $profile->name,
            'phone' => $profile->phone,
            'email' => $profile->email,
            'language' => $profile->language,
            'role' => $profile->role,
            'points' => (int) $profile->points,
            'wallet_balance' => (float) $profile->wallet_balance,
            'is_subscribed' => $profile->hasActiveSubscription(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'phone' => ['sometimes', 'string', 'max:40'],
            'language' => ['sometimes', 'in:az,ru,en'],
        ]);

        $profile->fill($data)->save();

        return $this->show($request);
    }
}
