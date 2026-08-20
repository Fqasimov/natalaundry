<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\Profile;
use App\Services\OrderService;
use App\Services\PricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly PricingService $pricing,
    ) {}

    private function profile(Request $request): Profile
    {
        return $request->attributes->get('profile');
    }

    public function index(Request $request): JsonResponse
    {
        $orders = Order::query()
            ->where('user_id', $this->profile($request)->id)
            ->with('items')
            ->latest('created_at')
            ->paginate(20);

        return OrderResource::collection($orders)->response();
    }

    public function store(StoreOrderRequest $request): JsonResponse
    {
        $order = $this->orders->create($this->profile($request), $request->validated());

        return (new OrderResource($order))->response()->setStatusCode(201);
    }

    public function show(Request $request, string $order): JsonResponse
    {
        $profile = $this->profile($request);

        $model = Order::query()
            ->with('items')
            ->where('id', $order)
            ->where(fn ($q) => $q
                ->where('user_id', $profile->id)
                ->orWhere('courier_id', $profile->id))
            ->firstOrFail();

        return (new OrderResource($model))->response();
    }

    public function cancel(Request $request, string $order): JsonResponse
    {
        $model = Order::query()
            ->where('id', $order)
            ->where('user_id', $this->profile($request)->id)
            ->firstOrFail();

        try {
            $this->orders->cancel($model);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return (new OrderResource($model->load('items')))->response();
    }

    /** Live estimate for the basket, without creating anything. */
    public function quote(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.price' => ['required', 'numeric', 'min:0'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'delivery_tier' => ['required', 'string'],
            'is_outside_city' => ['boolean'],
        ]);

        return response()->json($this->pricing->breakdown(
            $data['items'],
            $data['delivery_tier'],
            (bool) ($data['is_outside_city'] ?? false),
        ));
    }

    // ---- courier endpoints -------------------------------------------------

    public function available(Request $request): JsonResponse
    {
        $profile = $this->profile($request);
        if (! $profile->isCourier()) {
            return response()->json(['message' => 'Couriers only.'], 403);
        }

        $orders = Order::query()->awaitingCourier()->with('items')->oldest('created_at')->paginate(20);

        return OrderResource::collection($orders)->response();
    }

    public function claim(Request $request, string $order): JsonResponse
    {
        $model = Order::query()->findOrFail($order);

        try {
            $this->orders->claim($model, $this->profile($request));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 409);
        }

        return (new OrderResource($model->load('items')))->response();
    }

    public function advance(Request $request, string $order): JsonResponse
    {
        $model = Order::query()->findOrFail($order);

        try {
            $this->orders->advance($model, $this->profile($request));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return (new OrderResource($model->load('items')))->response();
    }
}
