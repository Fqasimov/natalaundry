<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CourierLocation;
use App\Models\Order;
use App\Support\OrderLifecycle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Live courier position, without a paid fleet-tracking product.
 *
 * The courier POSTs a ping every few seconds while en route; the customer GETs
 * the latest one and interpolates between fixes client-side. Two endpoints and
 * one narrow table — no Fleet Engine, no per-trip billing. If the ping rate
 * ever becomes the bottleneck this is the seam to swap for a socket, and the
 * client contract would not have to change.
 */
class TrackingController extends Controller
{
    /** Courier: record a position fix for an order they are en route on. */
    public function store(Request $request, Order $order): JsonResponse
    {
        $courier = $request->attributes->get('profile');

        if ($order->courier_id !== $courier?->id) {
            return response()->json(['message' => 'Not your order.'], 403);
        }

        // Reject pings outside the en-route states so a courier that failed to
        // stop its loop can't keep writing rows after delivery.
        if (! $order->isTracking()) {
            return response()->json([
                'message' => 'Order is not in a tracking state.',
                'tracking' => false,
            ], 409);
        }

        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'heading' => ['sometimes', 'nullable', 'numeric', 'between:0,360'],
            'speed' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'accuracy' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'recorded_at' => ['sometimes', 'nullable', 'date'],
        ]);

        CourierLocation::query()->create([
            'order_id' => $order->id,
            'courier_id' => $courier->id,
            'lat' => $data['lat'],
            'lng' => $data['lng'],
            'heading' => $data['heading'] ?? null,
            'speed' => $data['speed'] ?? null,
            'accuracy' => $data['accuracy'] ?? null,
            'recorded_at' => isset($data['recorded_at']) ? Carbon::parse($data['recorded_at']) : Carbon::now(),
            'created_at' => Carbon::now(),
        ]);

        return response()->json([
            'tracking' => true,
            'next_ping_seconds' => (int) config('nata.tracking.ping_seconds'),
        ], 201);
    }

    /**
     * Customer: the most recent fix, plus the pins the map needs.
     *
     * Returns `tracking: false` rather than 404 when the courier isn't moving,
     * so the client can keep polling one endpoint across the whole order
     * instead of branching on state.
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        $mayView = $order->user_id === $profile?->id
            || $order->courier_id === $profile?->id
            || $profile?->role === 'admin';

        if (! $mayView) {
            return response()->json(['message' => 'Not your order.'], 403);
        }

        // created_at is the tiebreaker: recorded_at is supplied by the phone
        // and two devices' clocks — or one device replaying a queued fix —
        // can hand us the same instant. Without a second key the row returned
        // is arbitrary and the marker can move backwards between polls.
        $latest = $order->locations()
            ->orderByDesc('recorded_at')
            ->orderByDesc('created_at')
            ->first();

        $staleAfter = (int) config('nata.tracking.stale_after_seconds');
        $isStale = $latest === null
            || $latest->recorded_at === null
            || $latest->recorded_at->diffInSeconds(Carbon::now()) > $staleAfter;

        return response()->json([
            'data' => [
                'lifecycle_state' => $order->lifecycle_state,
                'tracking' => $order->isTracking(),
                'stale' => $isStale,
                'poll_seconds' => (int) config('nata.tracking.ping_seconds'),
                'courier' => $order->courier_id ? [
                    'id' => $order->courier_id,
                    'name' => $order->courier?->name,
                    'phone' => $order->courier?->phone,
                ] : null,
                'position' => $latest ? [
                    'lat' => (float) $latest->lat,
                    'lng' => (float) $latest->lng,
                    'heading' => $latest->heading !== null ? (float) $latest->heading : null,
                    'recorded_at' => $latest->recorded_at?->toIso8601String(),
                ] : null,
                'destination' => [
                    'lat' => $order->address_lat !== null ? (float) $order->address_lat : null,
                    'lng' => $order->address_lng !== null ? (float) $order->address_lng : null,
                    'address' => $order->address,
                ],
            ],
        ]);
    }
}
