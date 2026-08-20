<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WalletTransaction;
use App\Services\WalletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WalletController extends Controller
{
    public function __construct(private readonly WalletService $wallet) {}

    /** "Nata balansı" plus its ledger. */
    public function index(Request $request): JsonResponse
    {
        $profile = $request->attributes->get('profile');

        return response()->json([
            'balance' => $this->wallet->balance($profile->id),
            'currency' => config('nata.currency'),
            'transactions' => WalletTransaction::query()
                ->where('user_id', $profile->id)
                ->latest('created_at')
                ->limit(50)
                ->get()
                ->map(fn ($t) => [
                    'id' => $t->id,
                    'amount' => (float) $t->amount,
                    'kind' => $t->kind,
                    'note' => $t->note,
                    'order_id' => $t->order_id,
                    'created_at' => $t->created_at?->toIso8601String(),
                ]),
        ]);
    }
}
