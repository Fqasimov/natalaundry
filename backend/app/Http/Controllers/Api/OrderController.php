<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOrderRequest;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\Profile;
use App\Services\CatalogService;
use App\Services\OrderService;
use App\Services\PricingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;

class OrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly PricingService $pricing,
        private readonly CatalogService $catalog,
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

    /**
     * Live estimate for the basket, without creating anything.
     *
     * Items are named, not priced. The endpoint used to take a price per line
     * from the request and quote against it, which meant the quote could
     * disagree with the order it turned into: the app carries its own copy of
     * the catalogue for offline estimates, and if that copy drifts from the
     * server's the customer is shown one total at checkout and charged
     * another. Resolving here the same way order creation does keeps the two
     * numbers the same by construction.
     */
    public function quote(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['required', 'string'],
            'items.*.item_id' => ['required', 'string'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'delivery_tier' => ['required', Rule::in(config('nata.delivery.tiers'))],
            'is_outside_city' => ['boolean'],
        ]);

        $lines = array_map(function (array $item): array {
            $resolved = $this->catalog->resolve($item['service_id'], $item['item_id']);

            return [
                'item_name' => $resolved['name'],
                'price' => $resolved['price'],
                'quantity' => (int) $item['quantity'],
            ];
        }, $data['items']);

        return response()->json($this->pricing->breakdown(
            $lines,
            $data['delivery_tier'],
            (bool) ($data['is_outside_city'] ?? false),
        ) + ['items' => $lines]);
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

    // ---- bulk ("toplu") -----------------------------------------------------

    /** Creates a bulk order: deposit now, real total after the courier counts. */
    public function storeBulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'collection_time' => ['required', 'string', 'max:120'],
            'delivery_time' => ['nullable', 'string', 'max:120'],
            'address' => ['required', 'string', 'max:500'],
            'address_lat' => ['nullable', 'numeric', 'between:-90,90'],
            'address_lng' => ['nullable', 'numeric', 'between:-180,180'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_outside_city' => ['boolean'],
        ]);

        $order = $this->orders->createBulk($this->profile($request), $data);

        return (new OrderResource($order))->response()->setStatusCode(201);
    }

    /** Courier records the counted value of a collected bulk load. */
    public function count(Request $request, string $order): JsonResponse
    {
        $data = $request->validate([
            'counted_total' => ['required', 'numeric', 'min:0', 'max:100000'],
        ]);

        $model = Order::query()->findOrFail($order);

        try {
            $this->orders->countBulk(
                $model,
                $this->profile($request),
                (float) $data['counted_total'],
            );
        } catch (RuntimeException|\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return (new OrderResource($model->fresh()))->response();
    }
}
