<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderPhotoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The garment photos on an order, as short-lived viewing URLs.
 *
 * Split from OrderController because it is the one endpoint that reaches
 * outside Postgres — it holds the service role and talks to Supabase Storage,
 * which is worth keeping visible rather than folding into the order payload.
 *
 * It is also why the URLs are not on OrderResource: signing costs an outbound
 * HTTP call, the URLs expire in minutes, and the order list renders twenty
 * orders at a time. Putting them there would sign sixty objects to show none
 * of them.
 */
class OrderPhotoController extends Controller
{
    public function __construct(private readonly OrderPhotoService $photos) {}

    public function index(Request $request, Order $order): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        if (! $this->photos->viewableBy($order, $profile)) {
            return response()->json([
                'message' => 'These photos belong to another order.',
            ], 403);
        }

        return response()->json([
            'data' => $this->photos->signedUrls($order),
            'expires_in' => OrderPhotoService::URL_TTL,
        ]);
    }
}
