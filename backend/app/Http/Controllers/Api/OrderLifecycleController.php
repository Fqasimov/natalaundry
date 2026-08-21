<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\CourierAssignment;
use App\Models\Order;
use App\Services\InvalidTransitionException;
use App\Services\OrderAlreadyClaimedException;
use App\Services\OrderLifecycleService;
use App\Support\OrderLifecycle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Lifecycle transitions. Admin-driven steps live here too even though the
 * admin UI has moved to the website — the API is shared, only the client
 * differs.
 */
class OrderLifecycleController extends Controller
{
    public function __construct(private readonly OrderLifecycleService $lifecycle)
    {
    }

    /** Admin: broadcast to a chosen pool, or to every courier when omitted. */
    public function broadcast(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'courier_ids' => ['sometimes', 'array'],
            'courier_ids.*' => ['uuid'],
        ]);

        return $this->guard(fn () => $this->lifecycle->broadcast(
            $order,
            $request->attributes->get('profile'),
            $data['courier_ids'] ?? null,
        ));
    }

    /** Courier: first-to-claim wins; losers get 409. */
    public function claim(Request $request, Order $order): JsonResponse
    {
        return $this->guard(fn () => $this->lifecycle->claim(
            $order,
            $request->attributes->get('profile'),
        ));
    }

    /**
     * Any actor: move the order to an explicit next state. Naming the target
     * rather than "advance" keeps a double-tap idempotent — a repeated request
     * fails the transition check instead of skipping a step.
     */
    public function transition(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate([
            'to' => ['required', 'string', 'in:'.implode(',', array_keys(OrderLifecycle::TRANSITIONS))],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $profile = $request->attributes->get('profile');

        return $this->guard(fn () => $this->lifecycle->transition(
            $order,
            $data['to'],
            $profile,
            $profile?->role ?? 'customer',
            $data['note'] ?? null,
        ));
    }

    /** Courier: orders broadcast to me and still unclaimed. */
    public function available(Request $request): JsonResponse
    {
        $courier = $request->attributes->get('profile');

        $offeredIds = CourierAssignment::query()
            ->where('courier_id', $courier->id)
            ->pluck('order_id');

        $orders = Order::query()
            ->awaitingClaim()
            ->whereIn('id', $offeredIds)
            ->orderBy('created_at')
            ->get();

        return response()->json(['data' => OrderResource::collection($orders)]);
    }

    /** The audit trail, powering the customer's timeline stepper. */
    public function timeline(Order $order): JsonResponse
    {
        $logs = $order->statusLogs()->orderBy('created_at')->get([
            'from_state', 'to_state', 'actor_role', 'note', 'created_at',
        ]);

        return response()->json([
            'data' => [
                'lifecycle_state' => $order->lifecycle_state,
                'step_index' => OrderLifecycle::stepIndex($order->lifecycle_state ?? OrderLifecycle::ORDER_PLACED),
                'sequence' => OrderLifecycle::SEQUENCE,
                'is_tracking' => $order->isTracking(),
                'logs' => $logs,
            ],
        ]);
    }

    /**
     * Translate the domain exceptions into the status codes the app expects:
     * 409 for a lost claim race (it has its own toast), 422 for a move the
     * state machine or the caller's role forbids.
     */
    private function guard(callable $fn): JsonResponse
    {
        try {
            return response()->json(['data' => new OrderResource($fn())]);
        } catch (OrderAlreadyClaimedException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        } catch (InvalidTransitionException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
