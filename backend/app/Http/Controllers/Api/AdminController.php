<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\Profile;
use App\Support\OrderLifecycle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Endpoints for the admin website.
 *
 * The admin UI is a browser app rather than part of the phone app — facility
 * work happens at a desk, and shipping dispatch controls to every install
 * would widen the blast radius for nothing. These endpoints are the seam
 * between the two.
 */
class AdminController extends Controller
{
    /** The live order feed, newest first, with everything the board renders. */
    public function orders(Request $request): JsonResponse
    {
        if (($guard = $this->requireAdmin($request)) !== null) {
            return $guard;
        }

        $orders = Order::query()
            ->with(['customer:id,name,phone', 'courier:id,name,phone'])
            ->whereNotIn('lifecycle_state', [OrderLifecycle::DELIVERED, OrderLifecycle::CANCELLED])
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json([
            'data' => $orders->map(fn (Order $order) => [
                'id' => $order->id,
                'order_no' => $order->order_no,
                'lifecycle_state' => $order->lifecycle_state,
                'status' => $order->status,
                'total' => (float) $order->total,
                'address' => $order->address,
                'collection_time' => $order->collection_time,
                'created_at' => $order->created_at?->toIso8601String(),
                'customer' => $order->customer ? [
                    'name' => $order->customer->name,
                    'phone' => $order->customer->phone,
                ] : null,
                'courier' => $order->courier ? [
                    'id' => $order->courier->id,
                    'name' => $order->courier->name,
                    'phone' => $order->courier->phone,
                ] : null,
                // The board only offers actions the state machine would
                // accept, so a button can never produce a 422.
                'can' => [
                    'broadcast' => OrderLifecycle::canTransition(
                        $order->lifecycle_state ?? OrderLifecycle::ORDER_PLACED,
                        OrderLifecycle::ASSIGNING_COURIERS,
                    ),
                    'at_laundry' => OrderLifecycle::canTransition(
                        $order->lifecycle_state ?? OrderLifecycle::ORDER_PLACED,
                        OrderLifecycle::AT_LAUNDRY,
                    ),
                    'processing_finished' => OrderLifecycle::canTransition(
                        $order->lifecycle_state ?? OrderLifecycle::ORDER_PLACED,
                        OrderLifecycle::PROCESSING_FINISHED,
                    ),
                ],
            ]),
        ]);
    }

    /** Couriers available to dispatch to. */
    public function couriers(Request $request): JsonResponse
    {
        if (($guard = $this->requireAdmin($request)) !== null) {
            return $guard;
        }

        return response()->json([
            'data' => Profile::query()
                ->where('role', 'courier')
                ->orderBy('name')
                ->get(['id', 'name', 'phone']),
        ]);
    }

    private function requireAdmin(Request $request): ?JsonResponse
    {
        $profile = $request->attributes->get('profile');

        return $profile?->role === 'admin'
            ? null
            : response()->json(['message' => 'Admin only.'], 403);
    }
}
