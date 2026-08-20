<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CatalogService;
use Illuminate\Http\JsonResponse;

class CatalogController extends Controller
{
    public function __construct(private readonly CatalogService $catalog) {}

    /** The price list backing "Xidmət icmalı". */
    public function index(): JsonResponse
    {
        return response()->json([
            'currency' => config('nata.currency'),
            'free_delivery_threshold' => (float) config('nata.delivery.free_threshold'),
            'delivery' => config('nata.delivery'),
            'services' => $this->catalog->all(),
        ]);
    }
}
